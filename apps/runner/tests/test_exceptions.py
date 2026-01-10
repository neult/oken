"""Tests for exceptions.py - Custom exception hierarchy."""

import pytest

from oken_runner.exceptions import (
    AgentNotFoundError,
    AgentNotRunningError,
    BuildError,
    ConfigError,
    ContainerError,
    InvokeError,
    RunnerError,
)


class TestRunnerError:
    """Tests for base RunnerError."""

    def test_basic_error(self):
        """Basic error with message and code."""
        error = RunnerError("Something went wrong", "CUSTOM_CODE")

        assert error.message == "Something went wrong"
        assert error.code == "CUSTOM_CODE"
        assert str(error) == "Something went wrong"


class TestAgentNotFoundError:
    """Tests for AgentNotFoundError."""

    def test_error_message(self):
        """Error includes agent_id in message."""
        error = AgentNotFoundError("my-agent-123")

        assert "my-agent-123" in error.message
        assert error.code == "AGENT_NOT_FOUND"


class TestAgentNotRunningError:
    """Tests for AgentNotRunningError."""

    def test_error_message(self):
        """Error includes agent_id and status in message."""
        error = AgentNotRunningError("my-agent", "building")

        assert "my-agent" in error.message
        assert "building" in error.message
        assert error.code == "AGENT_NOT_RUNNING"


class TestBuildError:
    """Tests for BuildError."""

    def test_error_with_logs(self):
        """Error includes build logs."""
        logs = "Step 1/5: FROM python:3.12\nStep 2/5: Error!"
        error = BuildError("Build failed", logs)

        assert error.message == "Build failed"
        assert error.build_logs == logs
        assert error.code == "BUILD_FAILED"

    def test_error_without_logs(self):
        """Error without build logs."""
        error = BuildError("Build failed")

        assert error.message == "Build failed"
        assert error.build_logs == ""


class TestContainerError:
    """Tests for ContainerError."""

    def test_error_message(self):
        """Container error with message."""
        error = ContainerError("Failed to start container")

        assert error.message == "Failed to start container"
        assert error.code == "CONTAINER_ERROR"


class TestConfigError:
    """Tests for ConfigError."""

    def test_error_message(self):
        """Config error with message."""
        error = ConfigError("Invalid configuration")

        assert error.message == "Invalid configuration"
        assert error.code == "CONFIG_ERROR"


class TestInvokeError:
    """Tests for InvokeError."""

    def test_error_with_status_code(self):
        """Error includes HTTP status code."""
        error = InvokeError("Agent returned error", 500)

        assert error.message == "Agent returned error"
        assert error.status_code == 500
        assert error.code == "INVOKE_FAILED"

    def test_default_status_code(self):
        """Default status code is 500."""
        error = InvokeError("Connection failed")

        assert error.status_code == 500

    def test_timeout_status_code(self):
        """Timeout uses 504 status code."""
        error = InvokeError("Request timed out", 504)

        assert error.status_code == 504


class TestExceptionInheritance:
    """Tests for exception inheritance."""

    def test_all_inherit_from_runner_error(self):
        """All custom exceptions inherit from RunnerError."""
        exceptions = [
            AgentNotFoundError("test"),
            AgentNotRunningError("test", "building"),
            BuildError("test"),
            ContainerError("test"),
            ConfigError("test"),
            InvokeError("test"),
        ]

        for exc in exceptions:
            assert isinstance(exc, RunnerError)
            assert isinstance(exc, Exception)

    def test_can_catch_as_runner_error(self):
        """All exceptions can be caught as RunnerError."""
        with pytest.raises(RunnerError):
            raise AgentNotFoundError("test")

        with pytest.raises(RunnerError):
            raise BuildError("test")

        with pytest.raises(RunnerError):
            raise InvokeError("test")
