"""Shared test fixtures for oken-runner tests."""

import tarfile
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

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
def mock_docker_client() -> MagicMock:
    """Create mock Docker client."""
    client = MagicMock()

    # Mock network operations
    client.networks.get.return_value = MagicMock(id="network-123")
    client.networks.create.return_value = MagicMock(id="network-456")

    # Mock image operations
    client.images.build.return_value = (MagicMock(), [])
    client.images.remove.return_value = None

    # Mock container operations
    mock_container = MagicMock()
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
def agent_tarball_with_requirements() -> bytes:
    """Create agent tarball with requirements.txt."""
    return create_tarball(
        {
            "oken.toml": """
[agent]
name = "deps-agent"
entrypoint = "main.py"
""",
            "main.py": """
import requests

def handler(input: dict) -> dict:
    return {"status": "ok"}
""",
            "requirements.txt": "requests>=2.28.0\n",
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
async def async_client(
    test_settings: Settings,
    mock_docker_manager: DockerManager,
) -> AsyncGenerator[AsyncClient]:
    """Create async test client for FastAPI app."""
    from oken_runner.server import app

    # Mock the lifespan dependencies
    app.state.settings = test_settings
    app.state.docker = mock_docker_manager
    app.state.registry = AsyncMock(spec=AgentRegistry)
    app.state.proxy = AsyncMock(spec=AgentProxy)
    app.state.detector = EntrypointDetector()

    # Set up default mock returns
    app.state.registry.count_running = AsyncMock(return_value=0)
    app.state.registry.list_agents = AsyncMock(return_value=[])

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


# ============================================================================
# Example Agent Code Snippets
# ============================================================================

HANDLER_SIMPLE = """
def handler(input: dict) -> dict:
    \"\"\"Simple synchronous handler.\"\"\"
    name = input.get("name", "World")
    return {"greeting": f"Hello, {name}!"}
"""

HANDLER_ASYNC = """
import asyncio

async def handler(input: dict) -> dict:
    \"\"\"Async handler with await.\"\"\"
    await asyncio.sleep(0.1)
    return {"result": input.get("value", 0) * 2}
"""

HANDLER_MAIN = """
def main(input: dict) -> dict:
    \"\"\"Handler using main() instead of handler().\"\"\"
    return {"processed": True, "data": input}
"""

HANDLER_INVOKE = """
def invoke(input: dict) -> dict:
    \"\"\"Handler using invoke() function.\"\"\"
    return {"invoked": True}
"""

HANDLER_RUN = """
def run(input: dict) -> dict:
    \"\"\"Handler using run() function.\"\"\"
    return {"ran": True}
"""

AGENT_CLASS_SIMPLE = """
class Agent:
    \"\"\"Simple agent class.\"\"\"

    def __init__(self):
        self.counter = 0

    def run(self, input: dict) -> dict:
        self.counter += 1
        return {"count": self.counter, "input": input}
"""

AGENT_CLASS_WITH_SETUP = """
class MyAgent:
    \"\"\"Agent with setup method.\"\"\"

    def setup(self):
        self.model = "initialized"

    def run(self, input: dict) -> dict:
        return {"model": self.model, "query": input.get("query")}
"""

AGENT_CLASS_ASYNC = """
class AsyncAgent:
    \"\"\"Agent with async run method.\"\"\"

    async def run(self, input: dict) -> dict:
        import asyncio
        await asyncio.sleep(0.01)
        return {"async": True}
"""

AGENT_CLASS_INVOKE = """
class TaskAgent:
    \"\"\"Agent with invoke method.\"\"\"

    def invoke(self, input: dict) -> dict:
        return {"invoked": True}
"""

AGENT_CLASS_CALL = """
class CallableAgent:
    \"\"\"Agent with __call__ method.\"\"\"

    def __call__(self, input: dict) -> dict:
        return {"called": True}
"""

HTTP_FASTAPI = """
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/invoke")
async def invoke(request: dict):
    return {"output": request.get("input", {})}
"""

HTTP_FLASK = """
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/invoke", methods=["POST"])
def invoke():
    data = request.get_json()
    return jsonify({"output": data.get("input", {})})
"""

HTTP_STARLETTE = """
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

async def health(request):
    return JSONResponse({"status": "ok"})

app = Starlette(routes=[Route("/health", health)])
"""

HTTP_UVICORN_RUN = """
import uvicorn
from fastapi import FastAPI

app = FastAPI()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
"""

LANGCHAIN_AGENT = """
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI

class LangChainAgent:
    \"\"\"LangChain-based agent.\"\"\"

    def __init__(self):
        self.llm = ChatOpenAI()

    def run(self, input: dict) -> dict:
        query = input.get("query", "")
        return {"response": f"Processed: {query}"}
"""

CREWAI_CREW = """
from crewai import Agent, Crew, Task

class CrewAIAgent:
    \"\"\"CrewAI-based agent.\"\"\"

    def setup(self):
        self.researcher = Agent(
            role="Researcher",
            goal="Research topics",
            backstory="Expert researcher"
        )
        self.crew = Crew(agents=[self.researcher], tasks=[])

    def run(self, input: dict) -> dict:
        task = Task(description=input.get("task", ""))
        result = self.crew.kickoff()
        return {"result": str(result)}
"""

INVALID_SYNTAX = """
def handler(input: dict) -> dict:
    return {"broken"  # Missing closing brace
"""

NO_HANDLER = """
# This file has no handler, main, or Agent class
def helper_function():
    return "helper"

class NotAnAgent:
    def process(self):
        pass
"""

MIXED_HANDLER_AND_AGENT = """
def handler(input: dict) -> dict:
    return {"from": "handler"}

class Agent:
    def run(self, input: dict) -> dict:
        return {"from": "agent"}
"""

MIXED_HTTP_AND_HANDLER = """
from fastapi import FastAPI

app = FastAPI()

def handler(input: dict) -> dict:
    return {"from": "handler"}

@app.post("/invoke")
async def invoke(request: dict):
    return {"from": "http"}
"""


@pytest.fixture
def agent_code_samples() -> dict[str, str]:
    """Return all agent code samples."""
    return {
        "handler_simple": HANDLER_SIMPLE,
        "handler_async": HANDLER_ASYNC,
        "handler_main": HANDLER_MAIN,
        "handler_invoke": HANDLER_INVOKE,
        "handler_run": HANDLER_RUN,
        "agent_class_simple": AGENT_CLASS_SIMPLE,
        "agent_class_with_setup": AGENT_CLASS_WITH_SETUP,
        "agent_class_async": AGENT_CLASS_ASYNC,
        "agent_class_invoke": AGENT_CLASS_INVOKE,
        "agent_class_call": AGENT_CLASS_CALL,
        "http_fastapi": HTTP_FASTAPI,
        "http_flask": HTTP_FLASK,
        "http_starlette": HTTP_STARLETTE,
        "http_uvicorn_run": HTTP_UVICORN_RUN,
        "langchain_agent": LANGCHAIN_AGENT,
        "crewai_crew": CREWAI_CREW,
        "invalid_syntax": INVALID_SYNTAX,
        "no_handler": NO_HANDLER,
        "mixed_handler_and_agent": MIXED_HANDLER_AND_AGENT,
        "mixed_http_and_handler": MIXED_HTTP_AND_HANDLER,
    }
