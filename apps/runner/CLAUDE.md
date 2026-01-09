# Oken Runner

Python service that executes agent code in Docker containers. Receives commands from Platform.

## Important

- **Do not run long-running commands** (e.g., `fastapi dev`, `uv run fastapi dev`). The user will start dev/prod servers manually.
- **Use uv only.** Do not use pip directly.

## Commands

```bash
# Linting and formatting (run before committing)
uv run ruff check src/                    # Lint
uv run ruff check src/ --fix              # Lint and auto-fix
uv run ruff format src/                   # Format

# Type checking
uv run ty check src/                      # Type check

# From repo root:
task lint:runner                          # Run all checks
task format:runner                        # Format code

# Dependencies
uv add <pkg>                              # Add dependency
uv sync                                   # Install deps from lockfile
```

## Testing

```bash
uv run pytest                      # Run all tests
uv run pytest -v                   # Verbose
uv run pytest tests/test_server.py # Single file
uv run pytest -k "test_health"     # Run matching tests
```

## Structure

```
src/oken_runner/
  server.py              # FastAPI app, HTTP endpoints
  config.py              # Settings via pydantic-settings
  models.py              # Pydantic request/response models
  docker_manager.py      # Docker image/container operations
  agent_registry.py      # In-memory agent state, warm pool
  proxy.py               # HTTP proxy to agent containers
  entrypoint_detector.py # Auto-detect handler/class/server patterns
  exceptions.py          # Custom exception hierarchy
  __init__.py
```

## How Runner Works

Platform sends commands to Runner:

```
POST /deploy       → Receive tarball, build Docker image, start container
POST /invoke/{id}  → Proxy request to running agent container
POST /stop/{id}    → Stop agent container
GET  /agents       → List all running agents
GET  /health       → Health check
```

## Agent Execution Flow

1. Platform POSTs tarball to `/deploy` with `agent_id`
2. Runner extracts to `$DATA_DIR/agents/<id>/`
3. Runner parses `oken.toml` for agent config
4. Runner auto-detects entrypoint type (handler/class/http)
5. Runner builds Docker image with uv for dependencies
6. Runner starts container on `oken-agents` bridge network
7. Runner waits for health check, then returns success
8. Runner proxies `/invoke` requests to container

## Environment Variables

```
OKEN_DATA_DIR=/tmp/oken              # Where agent code is stored
OKEN_DOCKER_NETWORK=oken-agents      # Docker network name
OKEN_DEFAULT_WARM_TIMEOUT=300        # Seconds to keep agents warm
OKEN_CLEANUP_INTERVAL=30             # Seconds between cleanup checks
```

## oken.toml Format

```toml
[agent]
name = "my-agent"
python_version = "3.12"        # Python version for container
entrypoint = "main.py"         # Entry point file
warm_timeout = 300             # Seconds to keep warm (optional)
# entrypoint_type = "handler"  # Auto-detected if omitted
```

## Entrypoint Types

- **handler**: Function `def handler(input: dict) -> dict` or `def main(input: dict) -> dict`
- **agent**: Class with `class Agent` and `def run(self, input: dict) -> dict`
- **http**: User provides their own FastAPI/Flask server
