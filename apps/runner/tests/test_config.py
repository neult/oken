"""Tests for config.py - Settings and configuration."""

import os
from unittest.mock import patch

from oken_runner.config import Settings


class TestSettingsDefaults:
    """Tests for default settings values."""

    def test_default_data_dir(self):
        """Default data_dir is /tmp/oken."""
        settings = Settings()
        assert settings.data_dir == "/tmp/oken"

    def test_default_docker_network(self):
        """Default docker_network is oken-agents."""
        settings = Settings()
        assert settings.docker_network == "oken-agents"

    def test_default_warm_timeout(self):
        """Default warm_timeout is 300 seconds."""
        settings = Settings()
        assert settings.default_warm_timeout == 300

    def test_default_cleanup_interval(self):
        """Default cleanup_interval is 30 seconds."""
        settings = Settings()
        assert settings.cleanup_interval == 30

    def test_default_container_port(self):
        """Default container_port is 8080."""
        settings = Settings()
        assert settings.container_port == 8080

    def test_default_health_check_timeout(self):
        """Default health_check_timeout is 30 seconds."""
        settings = Settings()
        assert settings.health_check_timeout == 30

    def test_default_invoke_timeout(self):
        """Default invoke_timeout is 300 seconds."""
        settings = Settings()
        assert settings.invoke_timeout == 300

    def test_default_base_image_prefix(self):
        """Default base_image_prefix is ghcr.io/astral-sh/uv."""
        settings = Settings()
        assert settings.base_image_prefix == "ghcr.io/astral-sh/uv"


class TestSettingsFromEnvironment:
    """Tests for loading settings from environment variables."""

    def test_data_dir_from_env(self):
        """data_dir can be set from OKEN_DATA_DIR."""
        with patch.dict(os.environ, {"OKEN_DATA_DIR": "/custom/data"}):
            settings = Settings()
            assert settings.data_dir == "/custom/data"

    def test_docker_network_from_env(self):
        """docker_network can be set from OKEN_DOCKER_NETWORK."""
        with patch.dict(os.environ, {"OKEN_DOCKER_NETWORK": "custom-network"}):
            settings = Settings()
            assert settings.docker_network == "custom-network"

    def test_warm_timeout_from_env(self):
        """default_warm_timeout can be set from OKEN_DEFAULT_WARM_TIMEOUT."""
        with patch.dict(os.environ, {"OKEN_DEFAULT_WARM_TIMEOUT": "600"}):
            settings = Settings()
            assert settings.default_warm_timeout == 600

    def test_cleanup_interval_from_env(self):
        """cleanup_interval can be set from OKEN_CLEANUP_INTERVAL."""
        with patch.dict(os.environ, {"OKEN_CLEANUP_INTERVAL": "60"}):
            settings = Settings()
            assert settings.cleanup_interval == 60

    def test_container_port_from_env(self):
        """container_port can be set from OKEN_CONTAINER_PORT."""
        with patch.dict(os.environ, {"OKEN_CONTAINER_PORT": "9000"}):
            settings = Settings()
            assert settings.container_port == 9000

    def test_health_check_timeout_from_env(self):
        """health_check_timeout can be set from OKEN_HEALTH_CHECK_TIMEOUT."""
        with patch.dict(os.environ, {"OKEN_HEALTH_CHECK_TIMEOUT": "60"}):
            settings = Settings()
            assert settings.health_check_timeout == 60

    def test_invoke_timeout_from_env(self):
        """invoke_timeout can be set from OKEN_INVOKE_TIMEOUT."""
        with patch.dict(os.environ, {"OKEN_INVOKE_TIMEOUT": "600"}):
            settings = Settings()
            assert settings.invoke_timeout == 600


class TestSettingsTypeCoercion:
    """Tests for type coercion of settings values."""

    def test_integer_coercion(self):
        """String values are coerced to integers."""
        with patch.dict(os.environ, {"OKEN_CONTAINER_PORT": "8888"}):
            settings = Settings()
            assert settings.container_port == 8888
            assert isinstance(settings.container_port, int)

    def test_multiple_env_vars(self):
        """Multiple environment variables can be set together."""
        env = {
            "OKEN_DATA_DIR": "/var/oken",
            "OKEN_DOCKER_NETWORK": "prod-network",
            "OKEN_DEFAULT_WARM_TIMEOUT": "900",
        }
        with patch.dict(os.environ, env):
            settings = Settings()
            assert settings.data_dir == "/var/oken"
            assert settings.docker_network == "prod-network"
            assert settings.default_warm_timeout == 900


class TestSettingsDirectInstantiation:
    """Tests for direct instantiation with values."""

    def test_direct_values(self):
        """Settings can be instantiated with direct values."""
        settings = Settings(
            data_dir="/custom/path",
            docker_network="test-network",
            default_warm_timeout=120,
            cleanup_interval=10,
            container_port=9090,
            health_check_timeout=15,
            invoke_timeout=60,
        )

        assert settings.data_dir == "/custom/path"
        assert settings.docker_network == "test-network"
        assert settings.default_warm_timeout == 120
        assert settings.cleanup_interval == 10
        assert settings.container_port == 9090
        assert settings.health_check_timeout == 15
        assert settings.invoke_timeout == 60

    def test_partial_values(self):
        """Settings can be instantiated with partial values."""
        settings = Settings(data_dir="/custom/path")

        assert settings.data_dir == "/custom/path"
        assert settings.docker_network == "oken-agents"  # default
        assert settings.default_warm_timeout == 300  # default
