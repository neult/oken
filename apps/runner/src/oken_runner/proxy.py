import logging

import httpx

from .config import Settings
from .exceptions import InvokeError

logger = logging.getLogger(__name__)


class AgentProxy:
    """Proxies requests to agent containers."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        """Initialize HTTP client."""
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.settings.invoke_timeout)
        )

    async def stop(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()

    async def invoke(self, container_name: str, payload: dict) -> dict:
        """Forward invoke request to agent container."""
        if not self._client:
            raise RuntimeError("Proxy not started")

        url = f"http://{container_name}:{self.settings.container_port}/invoke"

        try:
            logger.debug(f"Invoking agent at {url}")
            response = await self._client.post(url, json={"input": payload})
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException as e:
            raise InvokeError("Agent invocation timed out", 504) from e
        except httpx.HTTPStatusError as e:
            raise InvokeError(
                f"Agent returned error: {e.response.text}",
                e.response.status_code,
            ) from e
        except httpx.RequestError as e:
            raise InvokeError(f"Failed to connect to agent: {e}", 502) from e

    async def health_check(self, container_name: str) -> bool:
        """Check if agent container is healthy."""
        if not self._client:
            return False

        url = f"http://{container_name}:{self.settings.container_port}/health"

        try:
            response = await self._client.get(url, timeout=5.0)
            return response.status_code == 200
        except httpx.RequestError:
            return False

    async def wait_for_ready(
        self, container_name: str, timeout: int | None = None
    ) -> bool:
        """Wait for agent container to be ready."""
        if timeout is None:
            timeout = self.settings.health_check_timeout

        import asyncio

        for _ in range(timeout):
            if await self.health_check(container_name):
                logger.info(f"Agent {container_name} is ready")
                return True
            await asyncio.sleep(1)

        logger.warning(f"Agent {container_name} failed to become ready")
        return False
