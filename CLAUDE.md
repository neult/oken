# Oken

AI agent deployment platform. One CLI command, get a URL.

## Task Runner

This repo uses [Task](https://taskfile.dev) as a task runner. Commands are defined in `Taskfile.yml` at the repo root.

## Quick Reference

```bash
# Development
task dev:cli        # Run CLI (Go)
task dev:platform   # Run platform on :3000 (TanStack Start)
task dev:runner     # Run runner on :8000 (FastAPI)

# Build
task build:cli      # Build CLI binary to apps/cli/oken
task build:platform # Build platform for production

# Database
task db:generate    # Generate Drizzle migrations
task db:migrate     # Run migrations
```

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
