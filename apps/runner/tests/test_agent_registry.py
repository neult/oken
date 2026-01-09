"""Tests for agent_registry.py - State management."""

import asyncio
from datetime import UTC, datetime, timedelta

from oken_runner.agent_registry import AgentRegistry
from oken_runner.config import Settings
from oken_runner.docker_manager import DockerManager
from oken_runner.models import AgentConfig, AgentState


class TestAgentRegistration:
    """Tests for agent registration and retrieval."""

    async def test_register_new_agent(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Register a new agent successfully."""
        await agent_registry.register(sample_agent_state)
        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is not None
        assert agent.agent_id == sample_agent_state.agent_id
        assert agent.config.name == sample_agent_state.config.name

    async def test_register_duplicate_overwrites(
        self, agent_registry: AgentRegistry, sample_agent_config: AgentConfig
    ):
        """Registering duplicate agent_id overwrites existing."""
        agent1 = AgentState(
            agent_id="test-agent",
            config=sample_agent_config,
            status="running",
            created_at=datetime.now(UTC),
        )
        agent2 = AgentState(
            agent_id="test-agent",
            config=AgentConfig(name="updated-agent", entrypoint="app.py"),
            status="building",
            created_at=datetime.now(UTC),
        )

        await agent_registry.register(agent1)
        await agent_registry.register(agent2)

        agent = await agent_registry.get("test-agent")
        assert agent is not None
        assert agent.config.name == "updated-agent"
        assert agent.status == "building"

    async def test_get_nonexistent_agent(self, agent_registry: AgentRegistry):
        """Get returns None for nonexistent agent."""
        agent = await agent_registry.get("nonexistent")
        assert agent is None


class TestAgentStateUpdates:
    """Tests for agent state updates."""

    async def test_touch_updates_last_invoked(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Touch updates last_invoked timestamp."""
        await agent_registry.register(sample_agent_state)
        assert sample_agent_state.last_invoked is None

        await agent_registry.touch(sample_agent_state.agent_id)

        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is not None
        assert agent.last_invoked is not None

    async def test_touch_nonexistent_agent_no_error(
        self, agent_registry: AgentRegistry
    ):
        """Touch on nonexistent agent doesn't raise error."""
        await agent_registry.touch("nonexistent")  # Should not raise

    async def test_update_status(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Update agent status."""
        await agent_registry.register(sample_agent_state)
        await agent_registry.update_status(
            sample_agent_state.agent_id, "error", "Build failed"
        )

        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is not None
        assert agent.status == "error"
        assert agent.error == "Build failed"

    async def test_update_status_without_error(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Update agent status without error message."""
        sample_agent_state.status = "building"
        await agent_registry.register(sample_agent_state)
        await agent_registry.update_status(sample_agent_state.agent_id, "running")

        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is not None
        assert agent.status == "running"
        assert agent.error is None

    async def test_update_container(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Update agent container info."""
        sample_agent_state.container_id = None
        sample_agent_state.container_name = None
        await agent_registry.register(sample_agent_state)

        await agent_registry.update_container(
            sample_agent_state.agent_id, "new-container-id", "new-container-name"
        )

        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is not None
        assert agent.container_id == "new-container-id"
        assert agent.container_name == "new-container-name"


class TestAgentUnregistration:
    """Tests for agent unregistration."""

    async def test_unregister_existing_agent(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Unregister returns and removes agent."""
        await agent_registry.register(sample_agent_state)
        removed = await agent_registry.unregister(sample_agent_state.agent_id)

        assert removed is not None
        assert removed.agent_id == sample_agent_state.agent_id

        # Verify it's gone
        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is None

    async def test_unregister_nonexistent_agent(self, agent_registry: AgentRegistry):
        """Unregister returns None for nonexistent agent."""
        removed = await agent_registry.unregister("nonexistent")
        assert removed is None


class TestAgentListing:
    """Tests for listing agents."""

    async def test_list_agents_empty(self, agent_registry: AgentRegistry):
        """List agents returns empty list when no agents."""
        agents = await agent_registry.list_agents()
        assert agents == []

    async def test_list_agents_with_agents(
        self, agent_registry: AgentRegistry, sample_agent_config: AgentConfig
    ):
        """List agents returns all registered agents."""
        agent1 = AgentState(
            agent_id="agent-1",
            config=sample_agent_config,
            status="running",
            created_at=datetime.now(UTC),
        )
        agent2 = AgentState(
            agent_id="agent-2",
            config=sample_agent_config,
            status="building",
            created_at=datetime.now(UTC),
        )

        await agent_registry.register(agent1)
        await agent_registry.register(agent2)

        agents = await agent_registry.list_agents()
        assert len(agents) == 2
        agent_ids = {a.agent_id for a in agents}
        assert agent_ids == {"agent-1", "agent-2"}

    async def test_count_running(
        self, agent_registry: AgentRegistry, sample_agent_config: AgentConfig
    ):
        """Count only running agents."""
        agent1 = AgentState(
            agent_id="agent-1",
            config=sample_agent_config,
            status="running",
            created_at=datetime.now(UTC),
        )
        agent2 = AgentState(
            agent_id="agent-2",
            config=sample_agent_config,
            status="building",
            created_at=datetime.now(UTC),
        )
        agent3 = AgentState(
            agent_id="agent-3",
            config=sample_agent_config,
            status="running",
            created_at=datetime.now(UTC),
        )

        await agent_registry.register(agent1)
        await agent_registry.register(agent2)
        await agent_registry.register(agent3)

        count = await agent_registry.count_running()
        assert count == 2


class TestConcurrentAccess:
    """Tests for concurrent access safety."""

    async def test_concurrent_registrations(
        self, agent_registry: AgentRegistry, sample_agent_config: AgentConfig
    ):
        """Multiple concurrent registrations are safe."""

        async def register_agent(agent_id: str):
            agent = AgentState(
                agent_id=agent_id,
                config=sample_agent_config,
                status="running",
                created_at=datetime.now(UTC),
            )
            await agent_registry.register(agent)

        # Register 10 agents concurrently
        await asyncio.gather(*[register_agent(f"agent-{i}") for i in range(10)])

        agents = await agent_registry.list_agents()
        assert len(agents) == 10

    async def test_concurrent_touch_operations(
        self, agent_registry: AgentRegistry, sample_agent_state: AgentState
    ):
        """Multiple concurrent touch operations are safe."""
        await agent_registry.register(sample_agent_state)

        # Touch the same agent 10 times concurrently
        await asyncio.gather(
            *[agent_registry.touch(sample_agent_state.agent_id) for _ in range(10)]
        )

        agent = await agent_registry.get(sample_agent_state.agent_id)
        assert agent is not None
        assert agent.last_invoked is not None


class TestCleanupLoop:
    """Tests for cleanup loop functionality."""

    async def test_start_and_stop_cleanup_loop(self, agent_registry: AgentRegistry):
        """Cleanup loop can be started and stopped."""
        agent_registry.start_cleanup_loop()
        assert agent_registry._cleanup_task is not None

        await agent_registry.stop_cleanup_loop()
        assert (
            agent_registry._cleanup_task.cancelled()
            or agent_registry._cleanup_task.done()
        )

    async def test_cleanup_idle_agent(
        self,
        test_settings: Settings,
        mock_docker_manager: DockerManager,
        sample_agent_config: AgentConfig,
    ):
        """Idle agents are cleaned up after timeout."""
        # Use very short timeout for testing
        test_settings.cleanup_interval = 1
        sample_agent_config.warm_timeout = 1

        registry = AgentRegistry(test_settings, mock_docker_manager)

        # Create agent that's already past timeout
        agent = AgentState(
            agent_id="idle-agent",
            config=sample_agent_config,
            status="running",
            container_id="container-123",
            created_at=datetime.now(UTC) - timedelta(seconds=10),
        )
        await registry.register(agent)

        # Run cleanup
        await registry._cleanup_idle_agents()

        # Agent should be removed
        result = await registry.get("idle-agent")
        assert result is None

    async def test_cleanup_skips_recently_invoked(
        self,
        test_settings: Settings,
        mock_docker_manager: DockerManager,
        sample_agent_config: AgentConfig,
    ):
        """Recently invoked agents are not cleaned up."""
        sample_agent_config.warm_timeout = 300

        registry = AgentRegistry(test_settings, mock_docker_manager)

        agent = AgentState(
            agent_id="active-agent",
            config=sample_agent_config,
            status="running",
            container_id="container-123",
            created_at=datetime.now(UTC) - timedelta(seconds=10),
            last_invoked=datetime.now(UTC),  # Just invoked
        )
        await registry.register(agent)

        # Run cleanup
        await registry._cleanup_idle_agents()

        # Agent should still exist
        result = await registry.get("active-agent")
        assert result is not None

    async def test_cleanup_race_condition_protection(
        self,
        test_settings: Settings,
        mock_docker_manager: DockerManager,
        sample_agent_config: AgentConfig,
    ):
        """Agent invoked during cleanup decision is not stopped."""
        sample_agent_config.warm_timeout = 1

        registry = AgentRegistry(test_settings, mock_docker_manager)

        agent = AgentState(
            agent_id="race-agent",
            config=sample_agent_config,
            status="running",
            container_id="container-123",
            created_at=datetime.now(UTC) - timedelta(seconds=10),
            last_invoked=None,
        )
        await registry.register(agent)

        # Simulate: cleanup decides to stop, but agent gets invoked
        # We'll call _stop_agent_if_still_idle with old last_invoked
        await registry.touch("race-agent")  # Agent gets invoked

        # Now try to stop with the old last_invoked value (None)
        await registry._stop_agent_if_still_idle("race-agent", None)

        # Agent should still exist because last_invoked changed
        result = await registry.get("race-agent")
        assert result is not None
