from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Storage
    data_dir: str = "/tmp/oken"

    # Docker
    docker_network: str = "oken-agents"
    base_image_prefix: str = "ghcr.io/astral-sh/uv"

    # Warm pool
    default_warm_timeout: int = 300  # 5 minutes
    cleanup_interval: int = 30  # seconds between cleanup checks

    # Agent container
    container_port: int = 8080  # port agents expose inside container
    health_check_timeout: int = 30  # seconds to wait for agent to be ready
    invoke_timeout: int = 300  # 5 min timeout for agent invocations

    model_config = {"env_prefix": "OKEN_"}
