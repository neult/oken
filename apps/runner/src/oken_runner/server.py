import re
import tarfile
import tomllib
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from loguru import logger

from .agent_registry import AgentRegistry
from .config import Settings
from .docker_manager import DockerManager
from .entrypoint_detector import EntrypointDetector
from .exceptions import (
    AgentNotFoundError,
    AgentNotRunningError,
    ConfigError,
    InvokeError,
    RunnerError,
)

# Configure logging
from .logging import setup_logging
from .models import (
    AgentConfig,
    AgentState,
    DeployResponse,
    HealthResponse,
    InvokeRequest,
    InvokeResponse,
    StopResponse,
)
from .proxy import AgentProxy

setup_logging()


def get_settings() -> Settings:
    return Settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    settings = get_settings()

    # Initialize components
    docker_manager = DockerManager(settings)
    docker_manager.ensure_network()

    # Cleanup any orphaned containers from previous runs
    orphaned = docker_manager.cleanup_orphaned_containers()
    if orphaned:
        logger.info(f"Cleaned up {orphaned} orphaned containers")

    registry = AgentRegistry(settings, docker_manager)
    registry.start_cleanup_loop()

    proxy = AgentProxy(settings)
    await proxy.start()

    detector = EntrypointDetector()

    # Store in app state
    app.state.settings = settings
    app.state.docker = docker_manager
    app.state.registry = registry
    app.state.proxy = proxy
    app.state.detector = detector

    yield

    # Cleanup
    await registry.stop_cleanup_loop()
    await proxy.stop()


app = FastAPI(title="Oken Runner", lifespan=lifespan)


@app.exception_handler(RunnerError)
async def runner_error_handler(request: Request, exc: RunnerError):
    """Handle custom runner errors."""
    status_map = {
        "AGENT_NOT_FOUND": 404,
        "AGENT_NOT_RUNNING": 400,
        "BUILD_FAILED": 400,
        "CONTAINER_ERROR": 500,
        "CONFIG_ERROR": 400,
        "INVOKE_FAILED": 502,
    }
    status_code = status_map.get(exc.code, 500)
    if isinstance(exc, InvokeError):
        status_code = exc.status_code

    return JSONResponse(
        status_code=status_code,
        content={"error": exc.message, "code": exc.code},
    )


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    registry: AgentRegistry = app.state.registry
    return HealthResponse(status="ok", agents_running=await registry.count_running())


@app.post("/deploy", response_model=DeployResponse)
async def deploy(
    agent_id: Annotated[str, Form()],
    tarball: Annotated[UploadFile, File()],
):
    """Deploy an agent from a tarball."""
    settings: Settings = app.state.settings
    docker: DockerManager = app.state.docker
    registry: AgentRegistry = app.state.registry
    proxy: AgentProxy = app.state.proxy
    detector: EntrypointDetector = app.state.detector

    # Validate agent_id to prevent path traversal
    _validate_agent_id(agent_id)

    # Extract tarball to workspace
    workspace = Path(settings.data_dir) / "agents" / agent_id
    workspace.mkdir(parents=True, exist_ok=True)

    # Read and extract tarball with path traversal protection
    content = await tarball.read()
    _safe_extract_tarball(content, workspace)

    # Parse oken.toml
    config = _parse_agent_config(workspace)
    logger.info(f"Deploying agent {agent_id}: {config.name}")

    # Detect entrypoint type if not specified
    entrypoint_type = config.entrypoint_type or detector.detect(
        workspace, config.entrypoint
    )

    # Create agent state
    agent = AgentState(
        agent_id=agent_id,
        config=config,
        status="building",
        created_at=datetime.now(UTC),
    )
    await registry.register(agent)

    # Build Docker image
    try:
        image_tag = docker.build_image(agent_id, workspace, config, entrypoint_type)
    except Exception as e:
        await registry.update_status(agent_id, "error", str(e))
        raise

    # Start container
    try:
        container_id, container_name = docker.start_container(agent_id, image_tag)
        await registry.update_container(agent_id, container_id, container_name)
    except Exception as e:
        await registry.update_status(agent_id, "error", str(e))
        docker.cleanup_image(image_tag)
        raise

    # Wait for agent to be ready
    ready = await proxy.wait_for_ready(container_name)
    if not ready:
        await registry.update_status(agent_id, "error", "Agent failed to start")
        docker.stop_container(container_id)
        return DeployResponse(
            agent_id=agent_id,
            status="error",
            error="Agent failed to become ready within timeout",
        )

    # Update status to running
    await registry.update_status(agent_id, "running")

    return DeployResponse(
        agent_id=agent_id,
        status="running",
        endpoint=f"/invoke/{agent_id}",
    )


@app.post("/invoke/{agent_id}", response_model=InvokeResponse)
async def invoke(agent_id: str, request: InvokeRequest):
    """Invoke a running agent."""
    registry: AgentRegistry = app.state.registry
    proxy: AgentProxy = app.state.proxy

    # Get agent
    agent = await registry.get(agent_id)
    if not agent:
        raise AgentNotFoundError(agent_id)

    if agent.status != "running":
        raise AgentNotRunningError(agent_id, agent.status)

    if not agent.container_name:
        raise AgentNotRunningError(agent_id, "no container")

    # Update last invoked time
    await registry.touch(agent_id)

    # Proxy request to agent
    result = await proxy.invoke(agent.container_name, request.input)
    return InvokeResponse(output=result.get("output"))


@app.post("/stop/{agent_id}", response_model=StopResponse)
async def stop(agent_id: str):
    """Stop a running agent."""
    registry: AgentRegistry = app.state.registry
    docker: DockerManager = app.state.docker

    # Get and remove agent from registry
    agent = await registry.unregister(agent_id)
    if not agent:
        raise AgentNotFoundError(agent_id)

    # Stop container
    if agent.container_id:
        docker.stop_container(agent.container_id)

    # Cleanup image
    docker.cleanup_image(f"oken-agent:{agent_id}")

    return StopResponse(agent_id=agent_id, status="stopped")


@app.get("/agents")
async def list_agents():
    """List all registered agents."""
    registry: AgentRegistry = app.state.registry
    agents = await registry.list_agents()
    return {
        "agents": [
            {
                "agent_id": a.agent_id,
                "name": a.config.name,
                "status": a.status,
                "created_at": a.created_at.isoformat(),
                "last_invoked": a.last_invoked.isoformat() if a.last_invoked else None,
            }
            for a in agents
        ]
    }


# Regex pattern for valid agent IDs: alphanumeric, hyphens, underscores only
_AGENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_agent_id(agent_id: str) -> None:
    """Validate agent_id to prevent path traversal attacks."""
    if not agent_id:
        raise ConfigError("agent_id cannot be empty")
    if len(agent_id) > 128:
        raise ConfigError("agent_id too long (max 128 characters)")
    if not _AGENT_ID_PATTERN.match(agent_id):
        raise ConfigError(
            "agent_id must contain only alphanumeric characters, hyphens, and underscores"
        )


def _safe_extract_tarball(content: bytes, workspace: Path) -> None:
    """Extract tarball with path traversal protection."""
    workspace_resolved = workspace.resolve()

    with tarfile.open(fileobj=BytesIO(content), mode="r:gz") as tar:
        for member in tar.getmembers():
            # Resolve the target path
            member_path = (workspace / member.name).resolve()

            # Check for path traversal
            if not str(member_path).startswith(str(workspace_resolved)):
                raise ConfigError(f"Path traversal detected in tarball: {member.name}")

        # Safe to extract
        tar.extractall(workspace, filter="data")


def _parse_agent_config(workspace: Path) -> AgentConfig:
    """Parse oken.toml from workspace."""
    config_path = workspace / "oken.toml"
    if not config_path.exists():
        raise ConfigError("oken.toml not found in agent tarball")

    try:
        data = tomllib.loads(config_path.read_text())
    except tomllib.TOMLDecodeError as e:
        raise ConfigError(f"Invalid oken.toml: {e}") from e

    agent_data = data.get("agent", {})
    if not agent_data.get("name"):
        raise ConfigError("oken.toml must specify agent.name")

    return AgentConfig(**agent_data)
