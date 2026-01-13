FROM ghcr.io/astral-sh/uv:python3.12-alpine

WORKDIR /app

COPY apps/runner/pyproject.toml apps/runner/uv.lock ./
RUN uv sync --locked --no-install-project

COPY apps/runner/src ./src
RUN uv sync --locked

EXPOSE 8000
CMD ["uv", "run", "fastapi", "dev", "src/oken_runner/server.py", "--host", "0.0.0.0"]
