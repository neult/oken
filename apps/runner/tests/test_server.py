"""Tests for server.py - FastAPI endpoints and helper functions."""

import tarfile
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import status
from httpx import AsyncClient

from oken_runner.exceptions import ConfigError
from oken_runner.models import AgentState, EntrypointType
from oken_runner.server import (
    _parse_agent_config,
    _safe_extract_tarball,
    _validate_agent_id,
)


def create_tarball(files: dict[str, str]) -> bytes:
    """Create in-memory tarball from file dict."""
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, content in files.items():
            data = content.encode("utf-8")
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            tar.addfile(info, BytesIO(data))
    buffer.seek(0)
    return buffer.read()


class TestHealthEndpoint:
    """Tests for GET /health endpoint."""

    async def test_health_returns_ok(self, async_client: AsyncClient):
        """Health endpoint returns status ok."""
        from oken_runner.server import app

        app.state.registry.count_running = AsyncMock(return_value=5)

        response = await async_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ok"
        assert data["agents_running"] == 5

    async def test_health_with_zero_agents(self, async_client: AsyncClient):
        """Health endpoint works with no running agents."""
        from oken_runner.server import app

        app.state.registry.count_running = AsyncMock(return_value=0)

        response = await async_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["agents_running"] == 0


class TestListAgentsEndpoint:
    """Tests for GET /agents endpoint."""

    async def test_list_agents_empty(self, async_client: AsyncClient):
        """List agents returns empty list."""
        from oken_runner.server import app

        app.state.registry.list_agents = AsyncMock(return_value=[])

        response = await async_client.get("/agents")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["agents"] == []

    async def test_list_agents_with_agents(
        self, async_client: AsyncClient, sample_agent_state: AgentState
    ):
        """List agents returns agent details."""
        from oken_runner.server import app

        app.state.registry.list_agents = AsyncMock(return_value=[sample_agent_state])

        response = await async_client.get("/agents")

        assert response.status_code == status.HTTP_200_OK
        agents = response.json()["agents"]
        assert len(agents) == 1
        assert agents[0]["agent_id"] == sample_agent_state.agent_id
        assert agents[0]["name"] == sample_agent_state.config.name
        assert agents[0]["status"] == sample_agent_state.status


class TestInvokeEndpoint:
    """Tests for POST /invoke/{agent_id} endpoint."""

    async def test_invoke_agent_not_found(self, async_client: AsyncClient):
        """Invoke fails when agent doesn't exist."""
        from oken_runner.server import app

        app.state.registry.get = AsyncMock(return_value=None)

        response = await async_client.post(
            "/invoke/nonexistent",
            json={"input": {}},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["code"] == "AGENT_NOT_FOUND"

    async def test_invoke_agent_not_running(
        self, async_client: AsyncClient, sample_agent_state: AgentState
    ):
        """Invoke fails when agent is not running."""
        from oken_runner.server import app

        sample_agent_state.status = "building"
        app.state.registry.get = AsyncMock(return_value=sample_agent_state)

        response = await async_client.post(
            "/invoke/test-agent",
            json={"input": {}},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "AGENT_NOT_RUNNING"

    async def test_invoke_success(
        self, async_client: AsyncClient, sample_agent_state: AgentState
    ):
        """Successful agent invocation."""
        from oken_runner.server import app

        sample_agent_state.status = "running"
        sample_agent_state.container_name = "oken-test-agent"
        app.state.registry.get = AsyncMock(return_value=sample_agent_state)
        app.state.registry.touch = AsyncMock()
        app.state.proxy.invoke = AsyncMock(return_value={"output": {"result": 42}})

        response = await async_client.post(
            "/invoke/test-agent",
            json={"input": {"value": 21}},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["output"] == {"result": 42}
        app.state.registry.touch.assert_called_once()


class TestStopEndpoint:
    """Tests for POST /stop/{agent_id} endpoint."""

    async def test_stop_agent_not_found(self, async_client: AsyncClient):
        """Stop fails when agent doesn't exist."""
        from oken_runner.server import app

        app.state.registry.unregister = AsyncMock(return_value=None)

        response = await async_client.post("/stop/nonexistent")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_stop_success(
        self, async_client: AsyncClient, sample_agent_state: AgentState
    ):
        """Successful agent stop."""
        from oken_runner.server import app

        app.state.registry.unregister = AsyncMock(return_value=sample_agent_state)
        app.state.docker.stop_container = MagicMock()
        app.state.docker.cleanup_image = MagicMock()

        response = await async_client.post(f"/stop/{sample_agent_state.agent_id}")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "stopped"


class TestValidateAgentId:
    """Tests for _validate_agent_id() security function."""

    def test_valid_alphanumeric(self):
        """Valid alphanumeric agent_id passes."""
        _validate_agent_id("myagent123")  # Should not raise

    def test_valid_with_hyphens(self):
        """Valid agent_id with hyphens passes."""
        _validate_agent_id("my-agent-123")  # Should not raise

    def test_valid_with_underscores(self):
        """Valid agent_id with underscores passes."""
        _validate_agent_id("my_agent_123")  # Should not raise

    def test_valid_mixed(self):
        """Valid agent_id with mixed characters passes."""
        _validate_agent_id("My-Agent_123")  # Should not raise

    def test_valid_max_length(self):
        """Agent_id at max length (128) passes."""
        _validate_agent_id("a" * 128)  # Should not raise

    def test_invalid_empty(self):
        """Empty agent_id raises ConfigError."""
        with pytest.raises(ConfigError, match="cannot be empty"):
            _validate_agent_id("")

    def test_invalid_too_long(self):
        """Agent_id over 128 chars raises ConfigError."""
        with pytest.raises(ConfigError, match="too long"):
            _validate_agent_id("a" * 129)

    def test_invalid_path_traversal_dots(self):
        """Path traversal with dots raises ConfigError."""
        with pytest.raises(ConfigError, match="alphanumeric"):
            _validate_agent_id("../../../etc")

    def test_invalid_path_traversal_slash(self):
        """Path traversal with slash raises ConfigError."""
        with pytest.raises(ConfigError, match="alphanumeric"):
            _validate_agent_id("foo/bar")

    def test_invalid_backslash(self):
        """Backslash raises ConfigError."""
        with pytest.raises(ConfigError, match="alphanumeric"):
            _validate_agent_id("foo\\bar")

    def test_invalid_special_chars(self):
        """Special characters raise ConfigError."""
        invalid_ids = [
            "agent@123",
            "agent#1",
            "agent$",
            "agent%20",
            "agent;rm",
            "agent`cmd`",
            "agent|pipe",
            "agent&bg",
            "agent<>",
            "agent()",
            "agent{}",
            "agent[]",
            "agent!",
            "agent?",
            "agent*",
            "agent'quote",
            'agent"quote',
        ]
        for agent_id in invalid_ids:
            with pytest.raises(ConfigError):
                _validate_agent_id(agent_id)

    def test_invalid_whitespace(self):
        """Whitespace raises ConfigError."""
        with pytest.raises(ConfigError, match="alphanumeric"):
            _validate_agent_id("agent name")

    def test_invalid_newline(self):
        """Newline raises ConfigError."""
        with pytest.raises(ConfigError, match="alphanumeric"):
            _validate_agent_id("agent\nname")


class TestSafeExtractTarball:
    """Tests for _safe_extract_tarball() security function."""

    def test_extract_valid_tarball(self, tmp_path: Path, valid_agent_tarball: bytes):
        """Valid tarball extracts successfully."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        _safe_extract_tarball(valid_agent_tarball, workspace)

        assert (workspace / "oken.toml").exists()
        assert (workspace / "main.py").exists()

    def test_extract_path_traversal_blocked(
        self, tmp_path: Path, malicious_tarball: bytes
    ):
        """Path traversal in tarball is blocked."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        with pytest.raises(ConfigError, match="Path traversal"):
            _safe_extract_tarball(malicious_tarball, workspace)

    def test_extract_absolute_path_blocked(self, tmp_path: Path):
        """Absolute path in tarball is blocked."""
        buffer = BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
            info = tarfile.TarInfo(name="/etc/passwd")
            data = b"malicious"
            info.size = len(data)
            tar.addfile(info, BytesIO(data))
        buffer.seek(0)

        workspace = tmp_path / "workspace"
        workspace.mkdir()

        with pytest.raises(ConfigError, match="Path traversal"):
            _safe_extract_tarball(buffer.read(), workspace)

    def test_extract_nested_path_traversal_blocked(self, tmp_path: Path):
        """Nested path traversal is blocked."""
        buffer = BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
            info = tarfile.TarInfo(name="subdir/../../etc/passwd")
            data = b"malicious"
            info.size = len(data)
            tar.addfile(info, BytesIO(data))
        buffer.seek(0)

        workspace = tmp_path / "workspace"
        workspace.mkdir()

        with pytest.raises(ConfigError, match="Path traversal"):
            _safe_extract_tarball(buffer.read(), workspace)

    def test_extract_with_subdirectories(self, tmp_path: Path):
        """Tarball with subdirectories extracts correctly."""
        tarball = create_tarball(
            {
                "oken.toml": "[agent]\nname = 'test'\n",
                "src/main.py": "def handler(x): return x",
                "src/utils/helper.py": "def help(): pass",
            }
        )

        workspace = tmp_path / "workspace"
        workspace.mkdir()

        _safe_extract_tarball(tarball, workspace)

        assert (workspace / "oken.toml").exists()
        assert (workspace / "src" / "main.py").exists()
        assert (workspace / "src" / "utils" / "helper.py").exists()


class TestParseAgentConfig:
    """Tests for _parse_agent_config() function."""

    def test_parse_valid_config(self, tmp_path: Path):
        """Valid oken.toml parses correctly."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "oken.toml").write_text("""
[agent]
name = "my-agent"
python_version = "3.11"
entrypoint = "app.py"
warm_timeout = 600
""")

        config = _parse_agent_config(workspace)

        assert config.name == "my-agent"
        assert config.python_version == "3.11"
        assert config.entrypoint == "app.py"
        assert config.warm_timeout == 600

    def test_parse_minimal_config(self, tmp_path: Path):
        """Minimal oken.toml with defaults."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "oken.toml").write_text("""
[agent]
name = "minimal-agent"
""")

        config = _parse_agent_config(workspace)

        assert config.name == "minimal-agent"
        assert config.entrypoint == "main.py"  # default
        assert config.python_version == "3.12"  # default

    def test_parse_missing_config_file(self, tmp_path: Path):
        """Missing oken.toml raises ConfigError."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        with pytest.raises(ConfigError, match="oken.toml not found"):
            _parse_agent_config(workspace)

    def test_parse_invalid_toml(self, tmp_path: Path):
        """Invalid TOML raises ConfigError."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "oken.toml").write_text("invalid toml [[[")

        with pytest.raises(ConfigError, match="Invalid oken.toml"):
            _parse_agent_config(workspace)

    def test_parse_missing_name(self, tmp_path: Path):
        """Missing agent.name raises ConfigError."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "oken.toml").write_text("""
[agent]
entrypoint = "main.py"
""")

        with pytest.raises(ConfigError, match="must specify agent.name"):
            _parse_agent_config(workspace)

    def test_parse_empty_agent_section(self, tmp_path: Path):
        """Empty agent section raises ConfigError."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "oken.toml").write_text("""
[agent]
""")

        with pytest.raises(ConfigError, match="must specify agent.name"):
            _parse_agent_config(workspace)

    def test_parse_with_entrypoint_type(self, tmp_path: Path):
        """Config with explicit entrypoint_type."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "oken.toml").write_text("""
[agent]
name = "http-agent"
entrypoint = "server.py"
entrypoint_type = "http"
""")

        config = _parse_agent_config(workspace)

        assert config.name == "http-agent"
        assert config.entrypoint_type == EntrypointType.HTTP_SERVER
