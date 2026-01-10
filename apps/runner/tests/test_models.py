"""Tests for models.py - Pydantic models and validation."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from oken_runner.models import (
    AgentConfig,
    AgentState,
    DeployResponse,
    EntrypointType,
    HealthResponse,
    InvokeRequest,
    InvokeResponse,
    StopResponse,
)


class TestEntrypointType:
    """Tests for EntrypointType enum."""

    def test_handler_value(self):
        """Handler type has correct value."""
        assert EntrypointType.HANDLER.value == "handler"

    def test_agent_class_value(self):
        """Agent class type has correct value."""
        assert EntrypointType.AGENT_CLASS.value == "agent"

    def test_http_server_value(self):
        """HTTP server type has correct value."""
        assert EntrypointType.HTTP_SERVER.value == "http"

    def test_all_types(self):
        """All expected types exist."""
        types = list(EntrypointType)
        assert len(types) == 3
        assert EntrypointType.HANDLER in types
        assert EntrypointType.AGENT_CLASS in types
        assert EntrypointType.HTTP_SERVER in types


class TestAgentConfig:
    """Tests for AgentConfig model."""

    def test_minimal_config(self):
        """Minimal config with only name."""
        config = AgentConfig(name="test-agent")

        assert config.name == "test-agent"
        assert config.python_version == "3.12"  # default
        assert config.entrypoint == "main.py"  # default
        assert config.entrypoint_type is None
        assert config.warm_timeout == 300  # default

    def test_full_config(self):
        """Full config with all fields."""
        config = AgentConfig(
            name="full-agent",
            python_version="3.11",
            entrypoint="app.py",
            entrypoint_type=EntrypointType.HTTP_SERVER,
            warm_timeout=600,
        )

        assert config.name == "full-agent"
        assert config.python_version == "3.11"
        assert config.entrypoint == "app.py"
        assert config.entrypoint_type == EntrypointType.HTTP_SERVER
        assert config.warm_timeout == 600

    def test_entrypoint_type_from_string(self):
        """Entrypoint type can be set from string."""
        config = AgentConfig(name="test", entrypoint_type="handler")
        assert config.entrypoint_type == EntrypointType.HANDLER

        config = AgentConfig(name="test", entrypoint_type="agent")
        assert config.entrypoint_type == EntrypointType.AGENT_CLASS

        config = AgentConfig(name="test", entrypoint_type="http")
        assert config.entrypoint_type == EntrypointType.HTTP_SERVER

    def test_missing_name_raises(self):
        """Missing name raises ValidationError."""
        with pytest.raises(ValidationError):
            AgentConfig()


class TestAgentState:
    """Tests for AgentState model."""

    def test_minimal_state(self):
        """Minimal state with required fields."""
        now = datetime.now(UTC)
        config = AgentConfig(name="test")

        state = AgentState(
            agent_id="agent-123",
            config=config,
            status="building",
            created_at=now,
        )

        assert state.agent_id == "agent-123"
        assert state.config.name == "test"
        assert state.status == "building"
        assert state.created_at == now
        assert state.container_id is None
        assert state.container_name is None
        assert state.last_invoked is None
        assert state.error is None

    def test_full_state(self):
        """Full state with all fields."""
        now = datetime.now(UTC)
        config = AgentConfig(name="test")

        state = AgentState(
            agent_id="agent-123",
            config=config,
            status="running",
            container_id="container-abc",
            container_name="oken-agent-123",
            created_at=now,
            last_invoked=now,
            error=None,
        )

        assert state.container_id == "container-abc"
        assert state.container_name == "oken-agent-123"
        assert state.last_invoked == now

    def test_state_with_error(self):
        """State with error message."""
        config = AgentConfig(name="test")

        state = AgentState(
            agent_id="agent-123",
            config=config,
            status="error",
            created_at=datetime.now(UTC),
            error="Build failed: missing dependency",
        )

        assert state.status == "error"
        assert state.error == "Build failed: missing dependency"


class TestDeployResponse:
    """Tests for DeployResponse model."""

    def test_success_response(self):
        """Successful deploy response."""
        response = DeployResponse(
            agent_id="agent-123",
            status="running",
            endpoint="/invoke/agent-123",
        )

        assert response.agent_id == "agent-123"
        assert response.status == "running"
        assert response.endpoint == "/invoke/agent-123"
        assert response.error is None

    def test_error_response(self):
        """Error deploy response."""
        response = DeployResponse(
            agent_id="agent-123",
            status="error",
            error="Build failed",
        )

        assert response.status == "error"
        assert response.error == "Build failed"
        assert response.endpoint is None


class TestInvokeRequest:
    """Tests for InvokeRequest model."""

    def test_with_input(self):
        """Request with input data."""
        request = InvokeRequest(input={"query": "hello", "count": 5})

        assert request.input == {"query": "hello", "count": 5}

    def test_empty_input(self):
        """Request with empty input dict."""
        request = InvokeRequest(input={})

        assert request.input == {}

    def test_nested_input(self):
        """Request with nested input data."""
        request = InvokeRequest(
            input={
                "user": {"name": "Alice", "id": 123},
                "options": ["a", "b", "c"],
            }
        )

        assert request.input["user"]["name"] == "Alice"
        assert request.input["options"] == ["a", "b", "c"]


class TestInvokeResponse:
    """Tests for InvokeResponse model."""

    def test_with_output(self):
        """Response with output data."""
        response = InvokeResponse(output={"result": 42, "status": "ok"})

        assert response.output == {"result": 42, "status": "ok"}
        assert response.error is None

    def test_with_error(self):
        """Response with error."""
        response = InvokeResponse(error="Agent crashed")

        assert response.output is None
        assert response.error == "Agent crashed"

    def test_default_none_output(self):
        """Response defaults to None output."""
        response = InvokeResponse()

        assert response.output is None
        assert response.error is None


class TestStopResponse:
    """Tests for StopResponse model."""

    def test_stop_response(self):
        """Stop response with agent_id and status."""
        response = StopResponse(agent_id="agent-123", status="stopped")

        assert response.agent_id == "agent-123"
        assert response.status == "stopped"


class TestHealthResponse:
    """Tests for HealthResponse model."""

    def test_health_response(self):
        """Health response with status and count."""
        response = HealthResponse(status="ok", agents_running=5)

        assert response.status == "ok"
        assert response.agents_running == 5

    def test_health_response_zero_agents(self):
        """Health response with zero agents."""
        response = HealthResponse(status="ok", agents_running=0)

        assert response.agents_running == 0
