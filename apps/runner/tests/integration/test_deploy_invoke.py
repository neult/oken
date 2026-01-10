"""Integration tests for deploy, invoke, and stop flows."""

import pytest
from fastapi import status
from httpx import AsyncClient

pytestmark = pytest.mark.integration


class TestHandlerAgent:
    """Tests for handler function agents."""

    async def test_deploy_invoke_stop_lifecycle(
        self,
        integration_client: AsyncClient,
        handler_agent_tarball: bytes,
        unique_agent_id: str,
    ):
        """Full lifecycle: deploy → invoke → stop."""
        # Deploy
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={
                "tarball": ("agent.tar.gz", handler_agent_tarball, "application/gzip")
            },
            timeout=120.0,
        )

        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["status"] == "running"
        assert data["endpoint"] == f"/invoke/{unique_agent_id}"

        # Invoke
        response = await integration_client.post(
            f"/invoke/{unique_agent_id}",
            json={"input": {"name": "Integration Test"}},
            timeout=30.0,
        )

        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["output"]["message"] == "Hello, Integration Test!"
        assert data["output"]["received"] == {"name": "Integration Test"}

        # Stop
        response = await integration_client.post(f"/stop/{unique_agent_id}")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["status"] == "stopped"

        # Verify agent is gone
        response = await integration_client.post(
            f"/invoke/{unique_agent_id}",
            json={"input": {}},
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_invoke_multiple_times(
        self,
        integration_client: AsyncClient,
        handler_agent_tarball: bytes,
        unique_agent_id: str,
    ):
        """Agent handles multiple invocations."""
        # Deploy
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={
                "tarball": ("agent.tar.gz", handler_agent_tarball, "application/gzip")
            },
            timeout=120.0,
        )
        assert response.status_code == status.HTTP_200_OK

        # Multiple invokes
        for i in range(3):
            response = await integration_client.post(
                f"/invoke/{unique_agent_id}",
                json={"input": {"iteration": i}},
                timeout=30.0,
            )
            assert response.status_code == status.HTTP_200_OK
            assert response.json()["output"]["received"]["iteration"] == i

        # Cleanup
        await integration_client.post(f"/stop/{unique_agent_id}")

    async def test_async_handler(
        self,
        integration_client: AsyncClient,
        async_handler_agent_tarball: bytes,
        unique_agent_id: str,
    ):
        """Async handler functions work correctly."""
        # Deploy
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={
                "tarball": (
                    "agent.tar.gz",
                    async_handler_agent_tarball,
                    "application/gzip",
                )
            },
            timeout=120.0,
        )
        assert response.status_code == status.HTTP_200_OK

        # Invoke
        response = await integration_client.post(
            f"/invoke/{unique_agent_id}",
            json={"input": {"test": "async"}},
            timeout=30.0,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["output"]["async"] is True

        # Cleanup
        await integration_client.post(f"/stop/{unique_agent_id}")


class TestClassAgent:
    """Tests for Agent class pattern."""

    async def test_deploy_invoke_stop_lifecycle(
        self,
        integration_client: AsyncClient,
        class_agent_tarball: bytes,
        unique_agent_id: str,
    ):
        """Agent class with setup() and run() methods."""
        # Deploy
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={
                "tarball": ("agent.tar.gz", class_agent_tarball, "application/gzip")
            },
            timeout=120.0,
        )
        assert response.status_code == status.HTTP_200_OK

        # First invoke - setup should have been called
        response = await integration_client.post(
            f"/invoke/{unique_agent_id}",
            json={"input": {"action": "test"}},
            timeout=30.0,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["output"]["initialized"] is True
        assert data["output"]["call_count"] == 1

        # Second invoke - call_count should increment
        response = await integration_client.post(
            f"/invoke/{unique_agent_id}",
            json={"input": {"action": "test2"}},
            timeout=30.0,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["output"]["call_count"] == 2

        # Cleanup
        await integration_client.post(f"/stop/{unique_agent_id}")


class TestHttpAgent:
    """Tests for HTTP server agents."""

    async def test_deploy_invoke_stop_lifecycle(
        self,
        integration_client: AsyncClient,
        http_agent_tarball: bytes,
        unique_agent_id: str,
    ):
        """User-provided FastAPI server."""
        # Deploy
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={"tarball": ("agent.tar.gz", http_agent_tarball, "application/gzip")},
            timeout=120.0,
        )
        assert response.status_code == status.HTTP_200_OK, response.text

        # Invoke
        response = await integration_client.post(
            f"/invoke/{unique_agent_id}",
            json={"input": {"custom": "data"}},
            timeout=30.0,
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["output"]["http_server"] is True
        assert data["output"]["received"] == {"custom": "data"}

        # Cleanup
        await integration_client.post(f"/stop/{unique_agent_id}")


class TestErrorCases:
    """Tests for error handling."""

    async def test_deploy_missing_config(
        self,
        integration_client: AsyncClient,
        missing_config_tarball: bytes,
        unique_agent_id: str,
    ):
        """Deploy fails when oken.toml is missing."""
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={
                "tarball": ("agent.tar.gz", missing_config_tarball, "application/gzip")
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "CONFIG_ERROR"
        assert "oken.toml" in response.json()["error"]

    async def test_invoke_nonexistent_agent(
        self,
        integration_client: AsyncClient,
    ):
        """Invoke fails for non-existent agent."""
        response = await integration_client.post(
            "/invoke/does-not-exist",
            json={"input": {}},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["code"] == "AGENT_NOT_FOUND"

    async def test_stop_nonexistent_agent(
        self,
        integration_client: AsyncClient,
    ):
        """Stop fails for non-existent agent."""
        response = await integration_client.post("/stop/does-not-exist")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_deploy_invalid_agent_id(
        self,
        integration_client: AsyncClient,
        handler_agent_tarball: bytes,
    ):
        """Deploy fails with invalid agent_id."""
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": "../../../etc/passwd"},
            files={
                "tarball": ("agent.tar.gz", handler_agent_tarball, "application/gzip")
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["code"] == "CONFIG_ERROR"


class TestAgentListing:
    """Tests for agent listing endpoint."""

    async def test_list_agents(
        self,
        integration_client: AsyncClient,
        handler_agent_tarball: bytes,
        unique_agent_id: str,
    ):
        """List agents shows deployed agents."""
        # Initially empty or only has other test agents
        response = await integration_client.get("/agents")
        assert response.status_code == status.HTTP_200_OK
        initial_count = len(response.json()["agents"])

        # Deploy an agent
        response = await integration_client.post(
            "/deploy",
            data={"agent_id": unique_agent_id},
            files={
                "tarball": ("agent.tar.gz", handler_agent_tarball, "application/gzip")
            },
            timeout=120.0,
        )
        assert response.status_code == status.HTTP_200_OK

        # Should appear in list
        response = await integration_client.get("/agents")
        assert response.status_code == status.HTTP_200_OK
        agents = response.json()["agents"]
        assert len(agents) == initial_count + 1

        agent_ids = [a["agent_id"] for a in agents]
        assert unique_agent_id in agent_ids

        # Cleanup
        await integration_client.post(f"/stop/{unique_agent_id}")


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    async def test_health_check(
        self,
        integration_client: AsyncClient,
    ):
        """Health endpoint returns status."""
        response = await integration_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ok"
        assert "agents_running" in data
