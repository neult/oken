# Oken Runner

Python service that executes agent code. Receives commands from Platform.

## Commands

**Use uv only. Do not use pip directly.**

```bash
uv run fastapi dev src/oken_runner/server.py   # Dev server on :8000
uv add <pkg>                                    # Add dependency
uv sync                                         # Install deps from lockfile

# From repo root:
task dev:runner
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
  server.py      # FastAPI app, HTTP endpoints
  executor.py    # Agent process management
  sandbox.py     # Isolation and venv setup
  __init__.py
```

## How Runner Works

Platform sends commands to Runner:

```
POST /deploy    → Receive tarball, create venv with uv, start agent process
POST /invoke    → Proxy request to running agent
GET  /logs/:id  → Return agent logs
POST /stop/:id  → Stop agent process
GET  /health    → Health check
```

## Agent Execution Flow

1. Platform POSTs tarball to `/deploy`
2. Runner extracts to `/data/agents/<id>/code/`
3. Runner runs `uv venv` + `uv pip install -r requirements.txt`
4. Runner spawns agent process on internal port (9001, 9002, ...)
5. Runner proxies `/invoke` requests to correct agent port

## Environment Variables

```
PLATFORM_URL=http://localhost:3000
DATA_DIR=/data
```
