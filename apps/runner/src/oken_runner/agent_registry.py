import asyncio
from datetime import UTC, datetime

from docker.errors import APIError, NotFound
from loguru import logger

from .config import Settings
from .docker_manager import DockerManager
from .models import AgentState


class AgentRegistry:
    """In-memory registry of running agents with warm pool management."""

    def __init__(self, settings: Settings, docker_manager: DockerManager):
        self.settings = settings
        self.docker = docker_manager
        self._agents: dict[str, AgentState] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: asyncio.Task | None = None

    def start_cleanup_loop(self) -> None:
        """Start background task to cleanup idle agents."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Started agent cleanup loop")

    async def stop_cleanup_loop(self) -> None:
        """Stop background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            logger.info("Stopped agent cleanup loop")

    async def register(self, agent: AgentState) -> None:
        """Register a new agent."""
        async with self._lock:
            self._agents[agent.agent_id] = agent
            logger.info(f"Registered agent: {agent.agent_id}")

    async def get(self, agent_id: str) -> AgentState | None:
        """Get agent by ID."""
        async with self._lock:
            return self._agents.get(agent_id)

    async def touch(self, agent_id: str) -> None:
        """Update last_invoked timestamp for an agent."""
        async with self._lock:
            if agent_id in self._agents:
                self._agents[agent_id].last_invoked = datetime.now(UTC)

    async def update_status(
        self, agent_id: str, status: str, error: str | None = None
    ) -> None:
        """Update agent status."""
        async with self._lock:
            if agent_id in self._agents:
                self._agents[agent_id].status = status
                if error:
                    self._agents[agent_id].error = error

    async def update_container(
        self, agent_id: str, container_id: str, container_name: str
    ) -> None:
        """Update agent container info."""
        async with self._lock:
            if agent_id in self._agents:
                self._agents[agent_id].container_id = container_id
                self._agents[agent_id].container_name = container_name

    async def unregister(self, agent_id: str) -> AgentState | None:
        """Remove agent from registry. Returns the removed agent."""
        async with self._lock:
            return self._agents.pop(agent_id, None)

    async def list_agents(self) -> list[AgentState]:
        """List all registered agents."""
        async with self._lock:
            return list(self._agents.values())

    async def count_running(self) -> int:
        """Count running agents."""
        async with self._lock:
            return sum(1 for a in self._agents.values() if a.status == "running")

    async def _cleanup_loop(self) -> None:
        """Background task to stop idle agents."""
        while True:
            await asyncio.sleep(self.settings.cleanup_interval)
            await self._cleanup_idle_agents()

    async def _cleanup_idle_agents(self) -> None:
        """Stop agents that have been idle longer than their warm_timeout."""
        now = datetime.now(UTC)
        agents_to_stop: list[tuple[str, datetime | None]] = []

        async with self._lock:
            for agent_id, agent in self._agents.items():
                if agent.status != "running":
                    continue

                # Use last_invoked if set, otherwise use created_at
                last_activity = agent.last_invoked or agent.created_at
                idle_seconds = (now - last_activity).total_seconds()

                if idle_seconds > agent.config.warm_timeout:
                    # Store the last_invoked time to check for race condition
                    agents_to_stop.append((agent_id, agent.last_invoked))
                    logger.info(
                        f"Agent {agent_id} idle for {idle_seconds:.0f}s "
                        f"(timeout: {agent.config.warm_timeout}s)"
                    )

        # Stop idle agents outside the lock
        for agent_id, last_invoked_at_decision in agents_to_stop:
            await self._stop_agent_if_still_idle(agent_id, last_invoked_at_decision)

    async def _stop_agent_if_still_idle(
        self, agent_id: str, last_invoked_at_decision: datetime | None
    ) -> None:
        """Stop an agent only if it hasn't been invoked since the cleanup decision."""
        async with self._lock:
            agent = self._agents.get(agent_id)
            if not agent:
                return  # Already removed

            # Check if agent was invoked after we decided to stop it
            if agent.last_invoked != last_invoked_at_decision:
                logger.info(
                    f"Agent {agent_id} was invoked during cleanup, skipping stop"
                )
                return

            # Remove from registry
            self._agents.pop(agent_id, None)

        # Stop container outside the lock
        if agent and agent.container_id:
            try:
                self.docker.stop_container(agent.container_id)
                logger.info(f"Stopped idle agent: {agent_id}")
            except NotFound:
                logger.debug(f"Container already removed for agent {agent_id}")
            except APIError as e:
                logger.error(f"Failed to stop agent {agent_id} (container {agent.container_id}): {e}")
