"""Integration test fixtures - real Docker, no mocks."""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path

import docker
import httpx
import pytest
from docker.errors import NotFound
from httpx import ASGITransport, AsyncClient
from loguru import logger

from oken_runner.agent_registry import AgentRegistry
from oken_runner.config import Settings
from oken_runner.docker_manager import DockerManager
from oken_runner.entrypoint_detector import EntrypointDetector
from oken_runner.exceptions import InvokeError
from oken_runner.proxy import AgentProxy

from ..conftest import create_tarball

# Label used to identify test containers/images for cleanup
TEST_LABEL = "oken.test"
TEST_LABEL_VALUE = "integration"
TEST_NETWORK = "oken-test-integration"


def _docker_available() -> bool:
    """Check if Docker daemon is running."""
    try:
        client = docker.from_env()
        client.ping()
        return True
    except Exception:
        return False


# Fail fast if Docker is not available
if not _docker_available():
    pytest.exit("Docker is not available. Integration tests require Docker.", 1)


class PortMappingDockerManager(DockerManager):
    """DockerManager that uses port mapping for host access.

    Maps container port 8080 to a random host port so tests running
    on the host can reach the containers.
    """

    def __init__(self, settings: Settings):
        super().__init__(settings)
        # Track container_name -> host_port mapping
        self.port_mappings: dict[str, int] = {}

    def start_container(
        self,
        agent_id: str,
        image_tag: str,
        env: dict[str, str] | None = None,
    ) -> tuple[str, str]:
        """Start container with port mapping. Returns (container_id, container_name)."""
        container_name = f"oken-{agent_id}"

        # Remove existing container with same name if exists
        try:
            existing = self.client.containers.get(container_name)
            logger.info(f"Removing existing container: {container_name}")
            existing.remove(force=True)
        except NotFound:
            pass

        try:
            # Start with port mapping to a random host port
            container = self.client.containers.run(
                image_tag,
                detach=True,
                name=container_name,
                network=self.settings.docker_network,
                environment=env or {},
                labels={
                    "oken.agent_id": agent_id,
                    TEST_LABEL: TEST_LABEL_VALUE,
                },
                ports={f"{self.settings.container_port}/tcp": None},  # Random host port
            )

            # Get the assigned host port
            container.reload()
            port_bindings = container.attrs["NetworkSettings"]["Ports"]
            host_port = int(
                port_bindings[f"{self.settings.container_port}/tcp"][0]["HostPort"]
            )
            self.port_mappings[container_name] = host_port

            logger.info(
                f"Started container: {container_name} ({container.short_id}) "
                f"on host port {host_port}"
            )
            return container.id, container_name
        except Exception as e:
            from oken_runner.exceptions import ContainerError

            raise ContainerError(f"Failed to start container: {e}") from e

    def stop_container(self, container_id: str) -> None:
        """Stop container and clean up port mapping."""
        try:
            container = self.client.containers.get(container_id)
            container_name = container.name
            container.stop(timeout=5)
            container.remove()
            # Clean up port mapping
            self.port_mappings.pop(container_name, None)
            logger.info(f"Stopped container: {container.short_id}")
        except NotFound:
            logger.warning(f"Container not found: {container_id}")


class PortMappingAgentProxy(AgentProxy):
    """AgentProxy that connects via localhost using port mappings."""

    def __init__(self, settings: Settings, docker_manager: PortMappingDockerManager):
        super().__init__(settings)
        self.docker_manager = docker_manager

    async def invoke(self, container_name: str, payload: dict) -> dict:
        """Forward invoke request via localhost port mapping."""
        if not self._client:
            raise RuntimeError("Proxy not started")

        host_port = self.docker_manager.port_mappings.get(container_name)
        if not host_port:
            raise InvokeError(f"No port mapping for {container_name}", 502)

        url = f"http://localhost:{host_port}/invoke"

        try:
            logger.debug(f"Invoking agent at {url}")
            response = await self._client.post(url, json={"input": payload})
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException as e:
            raise InvokeError("Agent invocation timed out", 504) from e
        except httpx.HTTPStatusError as e:
            raise InvokeError(
                f"Agent returned error: {e.response.text}",
                e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise InvokeError(f"Failed to connect to agent: {e}", 502) from e

    async def health_check(self, container_name: str) -> bool:
        """Check if agent container is healthy via localhost."""
        if not self._client:
            return False

        host_port = self.docker_manager.port_mappings.get(container_name)
        if not host_port:
            return False

        url = f"http://localhost:{host_port}/health"

        try:
            response = await self._client.get(url, timeout=5.0)
            return response.status_code == 200
        except httpx.RequestError:
            return False

    async def wait_for_ready(
        self, container_name: str, timeout: int | None = None
    ) -> bool:
        """Wait for agent container to be ready."""
        if timeout is None:
            timeout = self.settings.health_check_timeout

        for _ in range(timeout):
            if await self.health_check(container_name):
                logger.info(f"Agent {container_name} is ready")
                return True
            await asyncio.sleep(1)

        logger.warning(f"Agent {container_name} failed to become ready")
        return False


@pytest.fixture(scope="session")
def docker_client():
    """Get Docker client."""
    return docker.from_env()


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_resources(docker_client):
    """Clean up any leftover test containers/images before and after tests."""

    def do_cleanup():
        # Remove containers with test label
        containers = docker_client.containers.list(
            all=True, filters={"label": f"{TEST_LABEL}={TEST_LABEL_VALUE}"}
        )
        for container in containers:
            try:
                container.remove(force=True)
            except Exception:
                pass

        # Remove images with test label
        images = docker_client.images.list(
            filters={"label": f"{TEST_LABEL}={TEST_LABEL_VALUE}"}
        )
        for image in images:
            try:
                docker_client.images.remove(image.id, force=True)
            except Exception:
                pass

        # Remove test network if exists
        try:
            network = docker_client.networks.get(TEST_NETWORK)
            network.remove()
        except NotFound:
            pass

    # Cleanup before tests
    do_cleanup()

    yield

    # Cleanup after tests
    do_cleanup()


@pytest.fixture
def integration_settings(tmp_path: Path) -> Settings:
    """Create settings for integration tests."""
    return Settings(
        data_dir=str(tmp_path / "oken-data"),
        docker_network=TEST_NETWORK,
        default_warm_timeout=60,
        cleanup_interval=5,
        container_port=8080,
        health_check_timeout=60,
        invoke_timeout=30,
    )


@pytest.fixture
def docker_manager(integration_settings: Settings) -> PortMappingDockerManager:
    """Create DockerManager with port mapping support."""
    manager = PortMappingDockerManager(integration_settings)
    manager.ensure_network()
    return manager


@pytest.fixture
async def agent_registry(
    integration_settings: Settings, docker_manager: PortMappingDockerManager
) -> AsyncGenerator[AgentRegistry]:
    """Create real AgentRegistry."""
    registry = AgentRegistry(integration_settings, docker_manager)
    yield registry
    if registry._cleanup_task:
        await registry.stop_cleanup_loop()


@pytest.fixture
async def agent_proxy(
    integration_settings: Settings, docker_manager: PortMappingDockerManager
) -> AsyncGenerator[PortMappingAgentProxy]:
    """Create AgentProxy with port mapping support."""
    proxy = PortMappingAgentProxy(integration_settings, docker_manager)
    await proxy.start()
    yield proxy
    await proxy.stop()


@pytest.fixture
def entrypoint_detector() -> EntrypointDetector:
    """Create EntrypointDetector."""
    return EntrypointDetector()


@pytest.fixture
async def integration_client(
    integration_settings: Settings,
    docker_manager: PortMappingDockerManager,
    agent_registry: AgentRegistry,
    agent_proxy: PortMappingAgentProxy,
    entrypoint_detector: EntrypointDetector,
) -> AsyncGenerator[AsyncClient]:
    """Create async test client with real dependencies."""
    from oken_runner.server import app

    app.state.settings = integration_settings
    app.state.docker = docker_manager
    app.state.registry = agent_registry
    app.state.proxy = agent_proxy
    app.state.detector = entrypoint_detector

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


@pytest.fixture
def unique_agent_id() -> str:
    """Generate unique agent ID for test isolation."""
    return f"test-{uuid.uuid4().hex[:8]}"


# Sample agent code fixtures


@pytest.fixture
def handler_agent_tarball() -> bytes:
    """Simple handler function agent."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "handler-test"
python_version = "3.12"
entrypoint = "main.py"
""",
            "pyproject.toml": """
[project]
name = "handler-agent"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi", "uvicorn"]
""",
            "main.py": """
def handler(input: dict) -> dict:
    name = input.get("name", "World")
    return {"message": f"Hello, {name}!", "received": input}
""",
        }
    )


@pytest.fixture
def async_handler_agent_tarball() -> bytes:
    """Async handler function agent."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "async-handler-test"
python_version = "3.12"
entrypoint = "main.py"
""",
            "pyproject.toml": """
[project]
name = "async-handler-agent"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi", "uvicorn"]
""",
            "main.py": """
import asyncio

async def handler(input: dict) -> dict:
    await asyncio.sleep(0.1)
    return {"async": True, "input": input}
""",
        }
    )


@pytest.fixture
def class_agent_tarball() -> bytes:
    """Agent class with run() method."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "class-test"
python_version = "3.12"
entrypoint = "agent.py"
""",
            "pyproject.toml": """
[project]
name = "class-agent"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi", "uvicorn"]
""",
            "agent.py": """
class Agent:
    def __init__(self):
        self.call_count = 0

    def setup(self):
        self.initialized = True

    def run(self, input: dict) -> dict:
        self.call_count += 1
        return {
            "initialized": getattr(self, "initialized", False),
            "call_count": self.call_count,
            "input": input,
        }
""",
        }
    )


@pytest.fixture
def http_agent_tarball() -> bytes:
    """FastAPI HTTP server agent."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "http-test"
python_version = "3.12"
entrypoint = "server.py"
entrypoint_type = "http"
""",
            "pyproject.toml": """
[project]
name = "http-agent"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["fastapi", "uvicorn"]
""",
            "server.py": """
import os
from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/invoke")
async def invoke(request: dict):
    input_data = request.get("input", {})
    return {"output": {"http_server": True, "received": input_data}}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
""",
        }
    )


@pytest.fixture
def missing_config_tarball() -> bytes:
    """Tarball without oken.toml."""
    return create_tarball(
        {
            "main.py": """
def handler(input: dict) -> dict:
    return input
""",
        }
    )


@pytest.fixture
def invalid_entrypoint_tarball() -> bytes:
    """Tarball with syntax error in entrypoint."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "invalid-test"
entrypoint = "main.py"
""",
            "main.py": """
def handler(input: dict) -> dict
    return input  # Missing colon - syntax error
""",
        }
    )


@pytest.fixture
def missing_handler_tarball() -> bytes:
    """Tarball with no handler/main function."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "no-handler-test"
entrypoint = "main.py"
""",
            "main.py": """
# No handler or main function defined
def some_other_function():
    pass
""",
        }
    )
