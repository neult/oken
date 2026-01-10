"""Shared test fixtures for oken-runner tests."""

import tarfile
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from pytest_mock import MockerFixture

from oken_runner.agent_registry import AgentRegistry
from oken_runner.config import Settings
from oken_runner.docker_manager import DockerManager
from oken_runner.entrypoint_detector import EntrypointDetector
from oken_runner.models import AgentConfig, AgentState
from oken_runner.proxy import AgentProxy

# ============================================================================
# Settings Fixtures
# ============================================================================


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    """Create test settings with temp directory."""
    return Settings(
        data_dir=str(tmp_path / "oken-data"),
        docker_network="oken-test-network",
        default_warm_timeout=60,
        cleanup_interval=5,
        container_port=8080,
        health_check_timeout=10,
        invoke_timeout=30,
    )


# ============================================================================
# Mock Docker Fixtures
# ============================================================================


@pytest.fixture
def mock_docker_client(mocker: MockerFixture):
    """Create mock Docker client."""
    client = mocker.MagicMock()

    # Mock network operations
    client.networks.get.return_value = mocker.MagicMock(id="network-123")
    client.networks.create.return_value = mocker.MagicMock(id="network-456")

    # Mock image operations
    client.images.build.return_value = (mocker.MagicMock(), [])
    client.images.remove.return_value = None

    # Mock container operations
    mock_container = mocker.MagicMock()
    mock_container.id = "container-abc123"
    mock_container.short_id = "abc123"
    mock_container.name = "oken-test-agent"
    mock_container.logs.return_value = b"Container logs here"
    client.containers.run.return_value = mock_container
    client.containers.get.return_value = mock_container
    client.containers.list.return_value = []

    return client


@pytest.fixture
def mock_docker_manager(
    test_settings: Settings, mock_docker_client: MagicMock
) -> DockerManager:
    """Create DockerManager with mocked client."""
    with patch("docker.from_env", return_value=mock_docker_client):
        manager = DockerManager(test_settings)
        manager.client = mock_docker_client
        return manager


# ============================================================================
# Agent Registry Fixtures
# ============================================================================


@pytest.fixture
async def agent_registry(
    test_settings: Settings, mock_docker_manager: DockerManager
) -> AsyncGenerator[AgentRegistry]:
    """Create AgentRegistry for testing."""
    registry = AgentRegistry(test_settings, mock_docker_manager)
    yield registry
    # Cleanup: stop cleanup loop if started
    if registry._cleanup_task:
        await registry.stop_cleanup_loop()


@pytest.fixture
def sample_agent_config() -> AgentConfig:
    """Create sample agent configuration."""
    return AgentConfig(
        name="test-agent",
        python_version="3.12",
        entrypoint="main.py",
        entrypoint_type=None,
        warm_timeout=300,
    )


@pytest.fixture
def sample_agent_state(sample_agent_config: AgentConfig) -> AgentState:
    """Create sample agent state."""
    return AgentState(
        agent_id="test-agent-001",
        config=sample_agent_config,
        status="running",
        container_id="container-abc123",
        container_name="oken-test-agent-001",
        created_at=datetime.now(UTC),
        last_invoked=None,
        error=None,
    )


# ============================================================================
# Proxy Fixtures
# ============================================================================


@pytest.fixture
async def agent_proxy(test_settings: Settings) -> AsyncGenerator[AgentProxy]:
    """Create AgentProxy for testing."""
    proxy = AgentProxy(test_settings)
    await proxy.start()
    yield proxy
    await proxy.stop()


# ============================================================================
# Entrypoint Detector Fixtures
# ============================================================================


@pytest.fixture
def entrypoint_detector() -> EntrypointDetector:
    """Create EntrypointDetector instance."""
    return EntrypointDetector()


@pytest.fixture
def code_workspace(tmp_path: Path) -> Path:
    """Create temporary workspace for agent code."""
    workspace = tmp_path / "agent-workspace"
    workspace.mkdir()
    return workspace


# ============================================================================
# Tarball Fixtures
# ============================================================================


def create_tarball(files: dict[str, str]) -> bytes:
    """Create in-memory tarball from file dict.

    Args:
        files: Dict mapping filename to content

    Returns:
        Gzipped tarball bytes
    """
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, content in files.items():
            data = content.encode("utf-8")
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            tar.addfile(info, BytesIO(data))
    buffer.seek(0)
    return buffer.read()


@pytest.fixture
def valid_agent_tarball() -> bytes:
    """Create valid agent tarball with oken.toml and main.py."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "test-agent"
python_version = "3.12"
entrypoint = "main.py"
""",
            "main.py": """
def handler(input: dict) -> dict:
    return {"message": f"Hello, {input.get('name', 'World')}!"}
""",
        }
    )


@pytest.fixture
def malicious_tarball() -> bytes:
    """Create tarball with path traversal attempt."""
    buffer = BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        # Attempt path traversal
        info = tarfile.TarInfo(name="../../../etc/passwd")
        data = b"malicious content"
        info.size = len(data)
        tar.addfile(info, BytesIO(data))
    buffer.seek(0)
    return buffer.read()


# ============================================================================
# FastAPI Test Client Fixtures
# ============================================================================


@pytest.fixture
def app():
    """Return the FastAPI app instance for direct state manipulation in tests."""
    from oken_runner.server import app

    return app


@pytest.fixture
async def async_client(
    test_settings: Settings,
    mock_docker_manager: DockerManager,
    mocker: MockerFixture,
) -> AsyncGenerator[AsyncClient]:
    """Create async test client for FastAPI app."""
    from oken_runner.server import app

    # Mock the lifespan dependencies
    app.state.settings = test_settings
    app.state.docker = mock_docker_manager
    app.state.registry = mocker.AsyncMock(spec=AgentRegistry)
    app.state.proxy = mocker.AsyncMock(spec=AgentProxy)
    app.state.detector = EntrypointDetector()

    # Set up default mock returns
    app.state.registry.count_running = mocker.AsyncMock(return_value=0)
    app.state.registry.list_agents = mocker.AsyncMock(return_value=[])

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
