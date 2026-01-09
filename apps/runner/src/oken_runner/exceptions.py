class RunnerError(Exception):
    """Base exception for runner errors."""

    def __init__(self, message: str, code: str):
        self.message = message
        self.code = code
        super().__init__(message)


class AgentNotFoundError(RunnerError):
    """Agent not found in registry."""

    def __init__(self, agent_id: str):
        super().__init__(f"Agent {agent_id} not found", "AGENT_NOT_FOUND")


class AgentNotRunningError(RunnerError):
    """Agent exists but is not running."""

    def __init__(self, agent_id: str, status: str):
        super().__init__(
            f"Agent {agent_id} is not running (status: {status})", "AGENT_NOT_RUNNING"
        )


class BuildError(RunnerError):
    """Docker image build failed."""

    def __init__(self, message: str, build_logs: str = ""):
        super().__init__(message, "BUILD_FAILED")
        self.build_logs = build_logs


class ContainerError(RunnerError):
    """Container operation failed."""

    def __init__(self, message: str):
        super().__init__(message, "CONTAINER_ERROR")


class ConfigError(RunnerError):
    """Agent configuration error."""

    def __init__(self, message: str):
        super().__init__(message, "CONFIG_ERROR")


class InvokeError(RunnerError):
    """Agent invocation failed."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message, "INVOKE_FAILED")
        self.status_code = status_code
