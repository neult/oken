"""Tests for docker_manager.py - Docker operations."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from docker.errors import APIError, BuildError as DockerBuildError
from docker.errors import ImageNotFound, NotFound

from oken_runner.config import Settings
from oken_runner.docker_manager import DockerManager
from oken_runner.exceptions import BuildError, ContainerError
from oken_runner.models import AgentConfig, EntrypointType


class TestNetworkManagement:
    """Tests for Docker network management."""

    def test_ensure_network_uses_existing(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Uses existing network if available."""
        mock_docker_client.networks.get.return_value = MagicMock(id="existing-network")

        mock_docker_manager.ensure_network()

        mock_docker_client.networks.get.assert_called_once()
        mock_docker_client.networks.create.assert_not_called()
        assert mock_docker_manager._network_id == "existing-network"

    def test_ensure_network_creates_new(
        self, test_settings: Settings, mock_docker_client: MagicMock
    ):
        """Creates new network if not found."""
        mock_docker_client.networks.get.side_effect = NotFound("Network not found")
        mock_docker_client.networks.create.return_value = MagicMock(id="new-network")

        with patch("docker.from_env", return_value=mock_docker_client):
            manager = DockerManager(test_settings)
            manager.client = mock_docker_client
            manager.ensure_network()

        mock_docker_client.networks.create.assert_called_once_with(
            test_settings.docker_network, driver="bridge"
        )
        assert manager._network_id == "new-network"


class TestImageBuilding:
    """Tests for Docker image building."""

    def test_build_image_success(
        self,
        mock_docker_manager: DockerManager,
        mock_docker_client: MagicMock,
        tmp_path: Path,
    ):
        """Successfully builds Docker image."""
        code_path = tmp_path / "agent"
        code_path.mkdir()
        (code_path / "main.py").write_text("def handler(x): return x")

        config = AgentConfig(name="test", entrypoint="main.py")

        result = mock_docker_manager.build_image(
            "test-agent", code_path, config, EntrypointType.HANDLER
        )

        assert result == "oken-agent:test-agent"
        mock_docker_client.images.build.assert_called_once()

        # Verify Dockerfile was created
        assert (code_path / "Dockerfile").exists()

        # Verify wrapper script was created for handler type
        assert (code_path / "_oken_wrapper.py").exists()

    def test_build_image_http_server_no_wrapper(
        self,
        mock_docker_manager: DockerManager,
        mock_docker_client: MagicMock,
        tmp_path: Path,
    ):
        """HTTP server type doesn't create wrapper script."""
        code_path = tmp_path / "agent"
        code_path.mkdir()
        (code_path / "main.py").write_text(
            "from fastapi import FastAPI; app = FastAPI()"
        )

        config = AgentConfig(name="test", entrypoint="main.py")

        mock_docker_manager.build_image(
            "test-agent", code_path, config, EntrypointType.HTTP_SERVER
        )

        # Wrapper should NOT be created for HTTP server
        assert not (code_path / "_oken_wrapper.py").exists()

    def test_build_image_failure(
        self,
        mock_docker_manager: DockerManager,
        mock_docker_client: MagicMock,
        tmp_path: Path,
    ):
        """Build failure raises BuildError with logs."""
        code_path = tmp_path / "agent"
        code_path.mkdir()
        (code_path / "main.py").write_text("def handler(x): return x")

        config = AgentConfig(name="test", entrypoint="main.py")

        # Simulate build failure
        mock_docker_client.images.build.side_effect = DockerBuildError(
            "Build failed",
            build_log=[
                {"stream": "Step 1/5\n"},
                {"stream": "Error: something broke\n"},
            ],
        )

        with pytest.raises(BuildError) as exc_info:
            mock_docker_manager.build_image(
                "test-agent", code_path, config, EntrypointType.HANDLER
            )

        assert "Failed to build image" in exc_info.value.message
        assert "Error: something broke" in exc_info.value.build_logs


class TestDockerfileGeneration:
    """Tests for Dockerfile generation."""

    def test_dockerfile_handler_type(
        self, mock_docker_manager: DockerManager, tmp_path: Path
    ):
        """Dockerfile for handler type uses wrapper script."""
        code_path = tmp_path / "agent"
        code_path.mkdir()
        (code_path / "main.py").write_text("def handler(x): return x")

        config = AgentConfig(name="test", entrypoint="main.py", python_version="3.12")

        mock_docker_manager.build_image(
            "test-agent", code_path, config, EntrypointType.HANDLER
        )

        dockerfile = (code_path / "Dockerfile").read_text()
        assert "_oken_wrapper.py" in dockerfile
        assert "OKEN_ENTRY_TYPE" in dockerfile

    def test_dockerfile_http_server_type(
        self, mock_docker_manager: DockerManager, tmp_path: Path
    ):
        """Dockerfile for HTTP server type runs entrypoint directly."""
        code_path = tmp_path / "agent"
        code_path.mkdir()
        (code_path / "main.py").write_text("from fastapi import FastAPI")

        config = AgentConfig(name="test", entrypoint="app.py", python_version="3.11")

        mock_docker_manager.build_image(
            "test-agent", code_path, config, EntrypointType.HTTP_SERVER
        )

        dockerfile = (code_path / "Dockerfile").read_text()
        assert "app.py" in dockerfile
        assert "_oken_wrapper.py" not in dockerfile


class TestContainerManagement:
    """Tests for container lifecycle management."""

    def test_start_container_success(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Successfully starts container."""
        mock_container = MagicMock()
        mock_container.id = "container-123"
        mock_container.short_id = "123"
        mock_docker_client.containers.run.return_value = mock_container
        mock_docker_client.containers.get.side_effect = NotFound("Not found")

        container_id, container_name = mock_docker_manager.start_container(
            "test-agent", "oken-agent:test-agent"
        )

        assert container_id == "container-123"
        assert container_name == "oken-test-agent"
        mock_docker_client.containers.run.assert_called_once()

    def test_start_container_removes_existing(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Removes existing container with same name before starting."""
        existing_container = MagicMock()
        mock_docker_client.containers.get.return_value = existing_container

        new_container = MagicMock()
        new_container.id = "new-container"
        new_container.short_id = "new"
        mock_docker_client.containers.run.return_value = new_container

        mock_docker_manager.start_container("test-agent", "oken-agent:test-agent")

        existing_container.remove.assert_called_once_with(force=True)

    def test_start_container_failure(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Container start failure raises ContainerError."""
        mock_docker_client.containers.get.side_effect = NotFound("Not found")
        mock_docker_client.containers.run.side_effect = Exception("Failed to start")

        with pytest.raises(ContainerError) as exc_info:
            mock_docker_manager.start_container("test-agent", "oken-agent:test-agent")

        assert "Failed to start container" in str(exc_info.value)

    def test_stop_container_success(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Successfully stops and removes container."""
        mock_container = MagicMock()
        mock_docker_client.containers.get.return_value = mock_container

        mock_docker_manager.stop_container("container-123")

        mock_container.stop.assert_called_once_with(timeout=5)
        mock_container.remove.assert_called_once()

    def test_stop_container_not_found(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Stop container handles NotFound gracefully."""
        mock_docker_client.containers.get.side_effect = NotFound("Not found")

        # Should not raise
        mock_docker_manager.stop_container("nonexistent")


class TestContainerLogs:
    """Tests for container log retrieval."""

    def test_get_container_logs(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Gets container logs."""
        mock_container = MagicMock()
        mock_container.logs.return_value = b"Log line 1\nLog line 2"
        mock_docker_client.containers.get.return_value = mock_container

        logs = mock_docker_manager.get_container_logs("container-123")

        assert logs == "Log line 1\nLog line 2"
        mock_container.logs.assert_called_once_with(tail=100)

    def test_get_container_logs_not_found(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Returns None for nonexistent container."""
        mock_docker_client.containers.get.side_effect = NotFound("Not found")

        logs = mock_docker_manager.get_container_logs("nonexistent")

        assert logs is None


class TestImageCleanup:
    """Tests for image cleanup."""

    def test_cleanup_image_success(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Successfully removes image."""
        mock_docker_manager.cleanup_image("oken-agent:test")

        mock_docker_client.images.remove.assert_called_once_with(
            "oken-agent:test", force=True
        )

    def test_cleanup_image_not_found(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Handles ImageNotFound gracefully."""
        mock_docker_client.images.remove.side_effect = ImageNotFound("Not found")

        # Should not raise
        mock_docker_manager.cleanup_image("nonexistent:tag")


class TestOrphanedContainerCleanup:
    """Tests for orphaned container cleanup."""

    def test_cleanup_orphaned_containers(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Cleans up orphaned oken containers."""
        orphan1 = MagicMock(name="oken-orphan-1")
        orphan2 = MagicMock(name="oken-orphan-2")
        mock_docker_client.containers.list.return_value = [orphan1, orphan2]

        count = mock_docker_manager.cleanup_orphaned_containers()

        assert count == 2
        orphan1.remove.assert_called_once_with(force=True)
        orphan2.remove.assert_called_once_with(force=True)

    def test_cleanup_orphaned_containers_none(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Returns 0 when no orphaned containers."""
        mock_docker_client.containers.list.return_value = []

        count = mock_docker_manager.cleanup_orphaned_containers()

        assert count == 0

    def test_cleanup_orphaned_containers_partial_failure(
        self, mock_docker_manager: DockerManager, mock_docker_client: MagicMock
    ):
        """Continues cleanup even if some containers fail to remove."""
        orphan1 = MagicMock(name="oken-orphan-1")
        orphan1.remove.side_effect = APIError("Failed")
        orphan2 = MagicMock(name="oken-orphan-2")
        mock_docker_client.containers.list.return_value = [orphan1, orphan2]

        count = mock_docker_manager.cleanup_orphaned_containers()

        # Only orphan2 was successfully removed
        assert count == 1
