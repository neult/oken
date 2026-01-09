from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class EntrypointType(str, Enum):
    HANDLER = "handler"  # def handler(input: dict) -> dict
    AGENT_CLASS = "agent"  # class Agent with run() method
    HTTP_SERVER = "http"  # agent runs its own HTTP server


class AgentConfig(BaseModel):
    """Parsed from oken.toml"""

    name: str
    python_version: str = "3.12"
    entrypoint: str = "main.py"
    entrypoint_type: EntrypointType | None = None  # auto-detect if None
    warm_timeout: int = 300  # seconds to keep warm after last request


class AgentState(BaseModel):
    """Runtime state for a deployed agent"""

    agent_id: str
    config: AgentConfig
    status: str = "pending"  # pending, building, running, stopped, error
    container_id: str | None = None
    container_name: str | None = None
    created_at: datetime
    last_invoked: datetime | None = None
    error: str | None = None


class DeployResponse(BaseModel):
    agent_id: str
    status: str
    endpoint: str | None = None
    error: str | None = None


class InvokeRequest(BaseModel):
    input: dict


class InvokeResponse(BaseModel):
    output: dict | None = None
    error: str | None = None


class StopResponse(BaseModel):
    agent_id: str
    status: str


class HealthResponse(BaseModel):
    status: str
    agents_running: int
