import logging
from pathlib import Path

import docker
from docker.errors import BuildError as DockerBuildError
from docker.errors import ImageNotFound, NotFound

from .config import Settings
from .exceptions import BuildError, ContainerError
from .models import AgentConfig, EntrypointType

logger = logging.getLogger(__name__)

WRAPPER_SCRIPT = """
import asyncio
import importlib.util
import os
import sys

from fastapi import FastAPI
import uvicorn

app = FastAPI()

ENTRYPOINT = os.environ.get("OKEN_ENTRYPOINT", "main.py")
ENTRY_TYPE = os.environ.get("OKEN_ENTRY_TYPE", "handler")

# Load user module
module_path = f"/app/{ENTRYPOINT}"
spec = importlib.util.spec_from_file_location("agent_module", module_path)
module = importlib.util.module_from_spec(spec)
sys.modules["agent_module"] = module
spec.loader.exec_module(module)

if ENTRY_TYPE == "handler":
    handler_fn = getattr(module, "handler", None) or getattr(module, "main", None)
    if handler_fn is None:
        raise RuntimeError(f"No handler or main function found in {ENTRYPOINT}")

    @app.post("/invoke")
    async def invoke(request: dict):
        result = handler_fn(request.get("input", {}))
        # Handle async handlers
        if asyncio.iscoroutine(result):
            result = await result
        return {"output": result}

elif ENTRY_TYPE == "agent":
    AgentClass = getattr(module, "Agent", None)
    if AgentClass is None:
        raise RuntimeError(f"No Agent class found in {ENTRYPOINT}")
    agent_instance = AgentClass()
    if hasattr(agent_instance, "setup"):
        setup_result = agent_instance.setup()
        if asyncio.iscoroutine(setup_result):
            asyncio.get_event_loop().run_until_complete(setup_result)

    @app.post("/invoke")
    async def invoke(request: dict):
        result = agent_instance.run(request.get("input", {}))
        # Handle async run methods
        if asyncio.iscoroutine(result):
            result = await result
        return {"output": result}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
"""


class DockerManager:
    """Manages Docker images and containers for agents."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = docker.from_env()
        self._network_id: str | None = None

    def ensure_network(self) -> None:
        """Create bridge network if it doesn't exist."""
        try:
            network = self.client.networks.get(self.settings.docker_network)
            self._network_id = network.id
            logger.info(f"Using existing network: {self.settings.docker_network}")
        except NotFound:
            network = self.client.networks.create(
                self.settings.docker_network, driver="bridge"
            )
            self._network_id = network.id
            logger.info(f"Created network: {self.settings.docker_network}")

    def build_image(
        self,
        agent_id: str,
        code_path: Path,
        config: AgentConfig,
        entrypoint_type: EntrypointType,
    ) -> str:
        """Build Docker image for agent. Returns image tag."""
        dockerfile_content = self._generate_dockerfile(config, entrypoint_type)
        dockerfile_path = code_path / "Dockerfile"
        dockerfile_path.write_text(dockerfile_content)

        # Write wrapper script for non-HTTP agents
        if entrypoint_type != EntrypointType.HTTP_SERVER:
            wrapper_path = code_path / "_oken_wrapper.py"
            wrapper_path.write_text(WRAPPER_SCRIPT)

        image_tag = f"oken-agent:{agent_id}"

        try:
            logger.info(f"Building image {image_tag} from {code_path}")
            self.client.images.build(
                path=str(code_path),
                tag=image_tag,
                rm=True,
                forcerm=True,
            )
            return image_tag
        except DockerBuildError as e:
            logs = "\n".join(
                line.get("stream", "") for line in e.build_log if "stream" in line
            )
            raise BuildError(f"Failed to build image: {e}", logs) from e

    def _generate_dockerfile(
        self, config: AgentConfig, entrypoint_type: EntrypointType
    ) -> str:
        """Generate Dockerfile based on agent config."""
        # Use uv base image without Python, install specific version
        base_image = f"{self.settings.base_image_prefix}:bookworm-slim"

        # Install Python and dependencies using uv
        deps_install = f"""
# Install Python
RUN uv python install {config.python_version}

# Copy dependency files first for caching
COPY pyproject.toml* uv.lock* requirements.txt* ./

# Initialize project if no pyproject.toml, then add dependencies
RUN if [ -f pyproject.toml ]; then \\
        uv sync --frozen 2>/dev/null || uv sync; \\
    elif [ -f requirements.txt ]; then \\
        uv init --python {config.python_version} && uv add -r requirements.txt; \\
    else \\
        uv init --python {config.python_version}; \\
    fi
"""

        # Entry command based on type
        if entrypoint_type == EntrypointType.HTTP_SERVER:
            # User provides their own server, run their entrypoint directly
            cmd = f'CMD ["uv", "run", "python", "{config.entrypoint}"]'
        else:
            # Use our wrapper for handler/agent patterns
            cmd = 'CMD ["uv", "run", "python", "_oken_wrapper.py"]'

        env_vars = f"""
ENV OKEN_ENTRYPOINT="{config.entrypoint}"
ENV OKEN_ENTRY_TYPE="{entrypoint_type.value}"
ENV PORT="{self.settings.container_port}"
"""

        return f"""FROM {base_image}

WORKDIR /app
{deps_install}
# Copy application code
COPY . .
{env_vars}
EXPOSE {self.settings.container_port}
{cmd}
"""

    def start_container(
        self,
        agent_id: str,
        image_tag: str,
        env: dict[str, str] | None = None,
    ) -> tuple[str, str]:
        """Start container. Returns (container_id, container_name)."""
        container_name = f"oken-{agent_id}"

        # Remove existing container with same name if exists
        try:
            existing = self.client.containers.get(container_name)
            logger.info(f"Removing existing container: {container_name}")
            existing.remove(force=True)
        except NotFound:
            pass

        try:
            container = self.client.containers.run(
                image_tag,
                detach=True,
                name=container_name,
                network=self.settings.docker_network,
                environment=env or {},
                labels={"oken.agent_id": agent_id},
            )
            logger.info(f"Started container: {container_name} ({container.short_id})")
            return container.id, container_name
        except Exception as e:
            raise ContainerError(f"Failed to start container: {e}") from e

    def stop_container(self, container_id: str) -> None:
        """Stop and remove container."""
        try:
            container = self.client.containers.get(container_id)
            container.stop(timeout=5)
            container.remove()
            logger.info(f"Stopped container: {container.short_id}")
        except NotFound:
            logger.warning(f"Container not found: {container_id}")

    def get_container_logs(self, container_id: str, tail: int = 100) -> str:
        """Get container logs."""
        try:
            container = self.client.containers.get(container_id)
            return container.logs(tail=tail).decode("utf-8")
        except NotFound:
            return ""

    def cleanup_image(self, image_tag: str) -> None:
        """Remove image."""
        try:
            self.client.images.remove(image_tag, force=True)
            logger.info(f"Removed image: {image_tag}")
        except ImageNotFound:
            pass

    def cleanup_orphaned_containers(self) -> int:
        """Remove any orphaned oken containers. Returns count removed."""
        count = 0
        containers = self.client.containers.list(
            all=True, filters={"label": "oken.agent_id"}
        )
        for container in containers:
            try:
                container.remove(force=True)
                count += 1
                logger.info(f"Cleaned up orphaned container: {container.name}")
            except Exception as e:
                logger.warning(f"Failed to cleanup container {container.name}: {e}")
        return count
