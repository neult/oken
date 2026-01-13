# Oken

AI agent deployment platform. One CLI command, get a URL.

## Component Docs

See CLAUDE.md in each app for component-specific details:

- `apps/cli/CLAUDE.md` - CLI commands, structure, API client
- `apps/platform/CLAUDE.md` - API routes, database schema, auth
- `apps/runner/CLAUDE.md` - Agent execution, Docker, entrypoint types
- `apps/docs/CLAUDE.md` - Documentation site

## Task Runner

This repo uses [Task](https://taskfile.dev) as a task runner. Commands are defined in `Taskfile.yml` at the repo root.

## Quick Reference

```bash
# Local Environment (Docker)
task local:start       # Start all services (postgres, platform, runner)
task local:start:build # Start with image rebuild
task local:stop        # Stop all services
task local:logs        # View logs from all services

# Development (individual services)
task dev:cli        # Run CLI (Go)
task dev:platform   # Run platform on :3000 (TanStack Start)
task dev:runner     # Run runner on :8000 (FastAPI)
task dev:docs       # Run docs on :4321 (Astro Starlight)

# Build
task build:cli      # Build CLI binary to apps/cli/oken
task build:platform # Build platform for production
task build:docs     # Build docs for production

# Database
task db:generate    # Generate Drizzle migrations
task db:migrate     # Run migrations
```

## Self-Hosting

To run Oken locally:

```bash
git clone https://github.com/neult/oken.git
cd oken
task local:start    # or: oken local start
```

Services will be available at:
- Platform: http://localhost:3000
- Runner: http://localhost:8000
- Postgres: localhost:5432

## Architecture

- **CLI** (`apps/cli`): Go + Cobra. Single binary for `oken deploy`, `oken logs`, etc.
- **Platform** (`apps/platform`): TanStack Start + Better Auth + Drizzle + PostgreSQL. Dashboard and REST API.
- **Runner** (`apps/runner`): Python + FastAPI. Executes agent code in isolated environments using uv.

## Code Style

- Keep changes minimal and focused
- Follow existing patterns in each component
- No unnecessary abstractions

## Commit Messages

**IMPORTANT:** Follow these rules exactly.

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Scopes: `cli`, `platform`, `runner`, or omit for repo-wide changes

Rules:
- Keep messages short and concise (single line)
- No descriptions or body text
- No co-author tags
- No trailing periods

Examples:
```
feat(cli): add oken logs command
fix(runner): handle missing requirements.txt
docs: update claude.md files
chore: update dependencies
```

## Workflow

- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
- Run typechecks/lints before committing
- Test changes in the relevant app before PRs
