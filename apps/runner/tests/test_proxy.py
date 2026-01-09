"""Tests for proxy.py - HTTP proxy to agent containers."""

import httpx
import pytest
import respx

from oken_runner.config import Settings
from oken_runner.exceptions import InvokeError
from oken_runner.proxy import AgentProxy


class TestProxyInvoke:
    """Tests for invoke() method."""

    @respx.mock
    async def test_invoke_success(self, agent_proxy: AgentProxy):
        """Successful invocation returns response."""
        respx.post("http://test-container:8080/invoke").mock(
            return_value=httpx.Response(200, json={"output": {"result": 42}})
        )

        result = await agent_proxy.invoke("test-container", {"value": 21})
        assert result == {"output": {"result": 42}}

    @respx.mock
    async def test_invoke_timeout(self, agent_proxy: AgentProxy):
        """Timeout raises InvokeError with 504 status."""
        respx.post("http://test-container:8080/invoke").mock(
            side_effect=httpx.TimeoutException("Connection timed out")
        )

        with pytest.raises(InvokeError) as exc_info:
            await agent_proxy.invoke("test-container", {})

        assert exc_info.value.status_code == 504
        assert "timed out" in exc_info.value.message

    @respx.mock
    async def test_invoke_http_error(self, agent_proxy: AgentProxy):
        """HTTP error raises InvokeError with original status code."""
        respx.post("http://test-container:8080/invoke").mock(
            return_value=httpx.Response(500, text="Internal Server Error")
        )

        with pytest.raises(InvokeError) as exc_info:
            await agent_proxy.invoke("test-container", {})

        assert exc_info.value.status_code == 500

    @respx.mock
    async def test_invoke_connection_error(self, agent_proxy: AgentProxy):
        """Connection error raises InvokeError with 502 status."""
        respx.post("http://test-container:8080/invoke").mock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        with pytest.raises(InvokeError) as exc_info:
            await agent_proxy.invoke("test-container", {})

        assert exc_info.value.status_code == 502
        assert "Failed to connect" in exc_info.value.message

    async def test_invoke_without_start_raises(self, test_settings: Settings):
        """Invoke without starting proxy raises RuntimeError."""
        proxy = AgentProxy(test_settings)
        # Don't call start()

        with pytest.raises(RuntimeError, match="Proxy not started"):
            await proxy.invoke("test-container", {})


class TestProxyHealthCheck:
    """Tests for health_check() method."""

    @respx.mock
    async def test_health_check_healthy(self, agent_proxy: AgentProxy):
        """Health check returns True for healthy container."""
        respx.get("http://test-container:8080/health").mock(
            return_value=httpx.Response(200, json={"status": "ok"})
        )

        result = await agent_proxy.health_check("test-container")
        assert result is True

    @respx.mock
    async def test_health_check_unhealthy_status(self, agent_proxy: AgentProxy):
        """Health check returns False for non-200 status."""
        respx.get("http://test-container:8080/health").mock(
            return_value=httpx.Response(503, json={"status": "unhealthy"})
        )

        result = await agent_proxy.health_check("test-container")
        assert result is False

    @respx.mock
    async def test_health_check_connection_error(self, agent_proxy: AgentProxy):
        """Health check returns False on connection error."""
        respx.get("http://test-container:8080/health").mock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        result = await agent_proxy.health_check("test-container")
        assert result is False

    async def test_health_check_without_start(self, test_settings: Settings):
        """Health check returns False if proxy not started."""
        proxy = AgentProxy(test_settings)
        # Don't call start()

        result = await proxy.health_check("test-container")
        assert result is False


class TestProxyWaitForReady:
    """Tests for wait_for_ready() method."""

    @respx.mock
    async def test_wait_for_ready_immediate(self, agent_proxy: AgentProxy):
        """Wait for ready returns True immediately if healthy."""
        respx.get("http://test-container:8080/health").mock(
            return_value=httpx.Response(200, json={"status": "ok"})
        )

        result = await agent_proxy.wait_for_ready("test-container", timeout=5)
        assert result is True

    @respx.mock
    async def test_wait_for_ready_timeout(self, agent_proxy: AgentProxy):
        """Wait for ready returns False after timeout."""
        respx.get("http://test-container:8080/health").mock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        # Use very short timeout for test
        result = await agent_proxy.wait_for_ready("test-container", timeout=1)
        assert result is False

    @respx.mock
    async def test_wait_for_ready_eventual_success(self, agent_proxy: AgentProxy):
        """Wait for ready succeeds after initial failures."""
        route = respx.get("http://test-container:8080/health")

        # First call fails, second succeeds
        route.side_effect = [
            httpx.ConnectError("Connection refused"),
            httpx.Response(200, json={"status": "ok"}),
        ]

        result = await agent_proxy.wait_for_ready("test-container", timeout=5)
        assert result is True


class TestProxyLifecycle:
    """Tests for proxy start/stop lifecycle."""

    async def test_start_creates_client(self, test_settings: Settings):
        """Start creates HTTP client."""
        proxy = AgentProxy(test_settings)
        assert proxy._client is None

        await proxy.start()
        assert proxy._client is not None

        await proxy.stop()

    async def test_stop_closes_client(self, test_settings: Settings):
        """Stop closes HTTP client."""
        proxy = AgentProxy(test_settings)
        await proxy.start()
        assert proxy._client is not None

        await proxy.stop()
        # Client should be closed (aclose called)

    async def test_stop_without_start_no_error(self, test_settings: Settings):
        """Stop without start doesn't raise error."""
        proxy = AgentProxy(test_settings)
        await proxy.stop()  # Should not raise
