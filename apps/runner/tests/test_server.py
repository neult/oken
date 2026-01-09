"""Tests for server.py - FastAPI endpoints and helper functions."""

import tarfile
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import FastAPI, status
from httpx import AsyncClient
from pytest_mock import MockerFixture

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

    async def test_health_returns_ok(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Health endpoint returns status ok."""
        app.state.registry.count_running = mocker.AsyncMock(return_value=5)

        response = await async_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ok"
        assert data["agents_running"] == 5

    async def test_health_with_zero_agents(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Health endpoint works with no running agents."""
        app.state.registry.count_running = mocker.AsyncMock(return_value=0)

        response = await async_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["agents_running"] == 0


class TestListAgentsEndpoint:
    """Tests for GET /agents endpoint."""

    async def test_list_agents_empty(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """List agents returns empty list."""
        app.state.registry.list_agents = mocker.AsyncMock(return_value=[])

        response = await async_client.get("/agents")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["agents"] == []

    async def test_list_agents_with_agents(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        sample_agent_state: AgentState,
    ):
        """List agents returns agent details."""
        app.state.registry.list_agents = mocker.AsyncMock(
            return_value=[sample_agent_state]
        )

        response = await async_client.get("/agents")

        assert response.status_code == status.HTTP_200_OK
        agents = response.json()["agents"]
        assert len(agents) == 1
        assert agents[0]["agent_id"] == sample_agent_state.agent_id
        assert agents[0]["name"] == sample_agent_state.config.name
        assert agents[0]["status"] == sample_agent_state.status


class TestInvokeEndpoint:
    """Tests for POST /invoke/{agent_id} endpoint."""

    async def test_invoke_agent_not_found(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Invoke fails when agent doesn't exist."""
        app.state.registry.get = mocker.AsyncMock(return_value=None)

        response = await async_client.post(
            "/invoke/nonexistent",
            json={"input": {}},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["code"] == "AGENT_NOT_FOUND"

    async def test_invoke_agent_not_running(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        sample_agent_state: AgentState,
    ):
        """Invoke fails when agent is not running."""
        sample_agent_state.status = "building"
        app.state.registry.get = mocker.AsyncMock(return_value=sample_agent_state)

        response = await async_client.post(
            "/invoke/test-agent",
            json={"input": {}},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "AGENT_NOT_RUNNING"

    async def test_invoke_agent_no_container(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        sample_agent_state: AgentState,
    ):
        """Invoke fails when agent has no container."""
        sample_agent_state.status = "running"
        sample_agent_state.container_name = None
        app.state.registry.get = mocker.AsyncMock(return_value=sample_agent_state)

        response = await async_client.post(
            "/invoke/test-agent",
            json={"input": {}},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "AGENT_NOT_RUNNING"

    async def test_invoke_success(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        sample_agent_state: AgentState,
    ):
        """Successful agent invocation."""
        sample_agent_state.status = "running"
        sample_agent_state.container_name = "oken-test-agent"
        app.state.registry.get = mocker.AsyncMock(return_value=sample_agent_state)
        app.state.registry.touch = mocker.AsyncMock()
        app.state.proxy.invoke = mocker.AsyncMock(
            return_value={"output": {"result": 42}}
        )

        response = await async_client.post(
            "/invoke/test-agent",
            json={"input": {"value": 21}},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["output"] == {"result": 42}
        app.state.registry.touch.assert_called_once()

    async def test_invoke_error_uses_status_code(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        sample_agent_state: AgentState,
    ):
        """InvokeError uses its status_code in response."""
        from oken_runner.exceptions import InvokeError

        sample_agent_state.status = "running"
        sample_agent_state.container_name = "oken-test-agent"
        app.state.registry.get = mocker.AsyncMock(return_value=sample_agent_state)
        app.state.registry.touch = mocker.AsyncMock()
        app.state.proxy.invoke = mocker.AsyncMock(
            side_effect=InvokeError("Agent returned error", status_code=503)
        )

        response = await async_client.post(
            "/invoke/test-agent",
            json={"input": {}},
        )

        assert response.status_code == 503
        assert response.json()["code"] == "INVOKE_FAILED"


class TestDeployEndpoint:
    """Tests for POST /deploy endpoint."""

    async def test_deploy_invalid_agent_id_empty(self, async_client: AsyncClient):
        """Deploy fails with empty agent_id (FastAPI validation)."""
        response = await async_client.post(
            "/deploy",
            data={"agent_id": ""},
            files={"tarball": ("agent.tar.gz", b"fake", "application/gzip")},
        )

        # FastAPI returns 422 for empty form field
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    async def test_deploy_invalid_agent_id_path_traversal(
        self, async_client: AsyncClient
    ):
        """Deploy fails with path traversal in agent_id."""
        response = await async_client.post(
            "/deploy",
            data={"agent_id": "../../../etc"},
            files={"tarball": ("agent.tar.gz", b"fake", "application/gzip")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "CONFIG_ERROR"

    async def test_deploy_invalid_agent_id_too_long(self, async_client: AsyncClient):
        """Deploy fails with agent_id over 128 chars."""
        response = await async_client.post(
            "/deploy",
            data={"agent_id": "a" * 129},
            files={"tarball": ("agent.tar.gz", b"fake", "application/gzip")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "CONFIG_ERROR"

    async def test_deploy_malicious_tarball(
        self, async_client: AsyncClient, malicious_tarball: bytes
    ):
        """Deploy fails with path traversal in tarball."""
        response = await async_client.post(
            "/deploy",
            data={"agent_id": "test-agent"},
            files={"tarball": ("agent.tar.gz", malicious_tarball, "application/gzip")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "CONFIG_ERROR"

    async def test_deploy_missing_oken_toml(self, async_client: AsyncClient):
        """Deploy fails when oken.toml is missing."""
        tarball = create_tarball({"main.py": "def handler(x): return x"})

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "test-agent"},
            files={"tarball": ("agent.tar.gz", tarball, "application/gzip")},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "CONFIG_ERROR"

    async def test_deploy_success(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        valid_agent_tarball: bytes,
    ):
        """Successful agent deployment."""
        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.registry.update_container = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            return_value="oken-agent:test-agent"
        )
        app.state.docker.start_container = mocker.MagicMock(
            return_value=("container-123", "oken-test-agent")
        )
        app.state.proxy.wait_for_ready = mocker.AsyncMock(return_value=True)

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "test-agent"},
            files={
                "tarball": ("agent.tar.gz", valid_agent_tarball, "application/gzip")
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["agent_id"] == "test-agent"
        assert data["status"] == "running"
        assert data["endpoint"] == "/invoke/test-agent"

    async def test_deploy_build_failure(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        valid_agent_tarball: bytes,
    ):
        """Deploy fails when Docker build fails."""
        from oken_runner.exceptions import BuildError

        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            side_effect=BuildError("Build failed", "Error in Dockerfile")
        )

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "test-agent"},
            files={
                "tarball": ("agent.tar.gz", valid_agent_tarball, "application/gzip")
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "BUILD_FAILED"

    async def test_deploy_container_start_failure(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        valid_agent_tarball: bytes,
    ):
        """Deploy fails when container fails to start."""
        from oken_runner.exceptions import ContainerError

        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            return_value="oken-agent:test-agent"
        )
        app.state.docker.start_container = mocker.MagicMock(
            side_effect=ContainerError("Failed to start container")
        )
        app.state.docker.cleanup_image = mocker.MagicMock()

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "test-agent"},
            files={
                "tarball": ("agent.tar.gz", valid_agent_tarball, "application/gzip")
            },
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.json()["code"] == "CONTAINER_ERROR"

    async def test_deploy_agent_not_ready(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        valid_agent_tarball: bytes,
    ):
        """Deploy returns error when agent fails health check."""
        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.registry.update_container = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            return_value="oken-agent:test-agent"
        )
        app.state.docker.start_container = mocker.MagicMock(
            return_value=("container-123", "oken-test-agent")
        )
        app.state.docker.stop_container = mocker.MagicMock()
        app.state.proxy.wait_for_ready = mocker.AsyncMock(return_value=False)

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "test-agent"},
            files={
                "tarball": ("agent.tar.gz", valid_agent_tarball, "application/gzip")
            },
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "error"
        assert "ready" in data["error"].lower()

    async def test_deploy_langchain_agent(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Deploy LangChain-based agent with class detection."""
        langchain_code = '''
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI

class LangChainAgent:
    """LangChain-based agent."""

    def __init__(self):
        self.llm = ChatOpenAI()

    def run(self, input: dict) -> dict:
        query = input.get("query", "")
        return {"response": f"Processed: {query}"}
'''
        tarball = create_tarball(
            {
                "oken.toml": '[agent]\nname = "langchain-agent"\nentrypoint = "agent.py"',
                "agent.py": langchain_code,
            }
        )

        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.registry.update_container = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            return_value="oken-agent:lc-agent"
        )
        app.state.docker.start_container = mocker.MagicMock(
            return_value=("container-lc", "oken-lc-agent")
        )
        app.state.proxy.wait_for_ready = mocker.AsyncMock(return_value=True)

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "lc-agent"},
            files={"tarball": ("agent.tar.gz", tarball, "application/gzip")},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "running"

    async def test_deploy_crewai_agent(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Deploy CrewAI-based agent with class detection."""
        crewai_code = '''
from crewai import Agent, Crew, Task

class CrewAIAgent:
    """CrewAI-based agent."""

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
'''
        tarball = create_tarball(
            {
                "oken.toml": '[agent]\nname = "crewai-agent"\nentrypoint = "crew.py"',
                "crew.py": crewai_code,
            }
        )

        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.registry.update_container = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            return_value="oken-agent:crew-agent"
        )
        app.state.docker.start_container = mocker.MagicMock(
            return_value=("container-crew", "oken-crew-agent")
        )
        app.state.proxy.wait_for_ready = mocker.AsyncMock(return_value=True)

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "crew-agent"},
            files={"tarball": ("agent.tar.gz", tarball, "application/gzip")},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "running"

    async def test_deploy_fastapi_http_server(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Deploy FastAPI HTTP server agent."""
        fastapi_code = """
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/invoke")
async def invoke(request: dict):
    return {"output": request.get("input", {})}
"""
        tarball = create_tarball(
            {
                "oken.toml": '[agent]\nname = "http-agent"\nentrypoint = "server.py"',
                "server.py": fastapi_code,
            }
        )

        app.state.registry.register = mocker.AsyncMock()
        app.state.registry.update_status = mocker.AsyncMock()
        app.state.registry.update_container = mocker.AsyncMock()
        app.state.docker.build_image = mocker.MagicMock(
            return_value="oken-agent:http-agent"
        )
        app.state.docker.start_container = mocker.MagicMock(
            return_value=("container-http", "oken-http-agent")
        )
        app.state.proxy.wait_for_ready = mocker.AsyncMock(return_value=True)

        response = await async_client.post(
            "/deploy",
            data={"agent_id": "http-agent"},
            files={"tarball": ("agent.tar.gz", tarball, "application/gzip")},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "running"


class TestStopEndpoint:
    """Tests for POST /stop/{agent_id} endpoint."""

    async def test_stop_agent_not_found(
        self, async_client: AsyncClient, app: FastAPI, mocker: MockerFixture
    ):
        """Stop fails when agent doesn't exist."""
        app.state.registry.unregister = mocker.AsyncMock(return_value=None)

        response = await async_client.post("/stop/nonexistent")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_stop_success(
        self,
        async_client: AsyncClient,
        app: FastAPI,
        mocker: MockerFixture,
        sample_agent_state: AgentState,
    ):
        """Successful agent stop."""
        app.state.registry.unregister = mocker.AsyncMock(
            return_value=sample_agent_state
        )
        app.state.docker.stop_container = mocker.MagicMock()
        app.state.docker.cleanup_image = mocker.MagicMock()

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
