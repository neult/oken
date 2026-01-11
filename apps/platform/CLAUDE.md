# Oken Platform

TanStack Start app - dashboard and REST API. Central hub between CLI and Runner.

## Important

- **Do not run long-running commands** (e.g., `bun run dev`). The user will start dev/prod servers manually.
- **Use bun only.** **Do NOT** use npm or yarn.
- **ALWAYS use task commands from repo root.** Never use `bun` if it is defined in the `Taskfile.yml`. See `Taskfile.yml` for all available commands.

## Commands

**IMPORTANT: Always run task commands from repo root, never use `bun run` directly.**

```bash
# Linting, formatting
task lint:platform       # Lint code
task format:platform     # Format code
task check:platform      # Format, lint, and organize imports

# Testing
task test:platform       # Run all tests

# Database
task db:generate         # Generate migrations
task db:migrate          # Run migrations

# Dependencies
bun add <pkg>            # Add dependency
bun add -D <pkg>         # Add dev dependency
```

## Linting & Formatting

Uses [Biome](https://biomejs.dev) for linting and formatting. Config in `biome.json`.

## Structure

```
src/
  routes/
    index.tsx             # Home page
    __root.tsx            # Root layout
    auth/
      device.tsx          # CLI device auth approval page
    api/
      agents.ts           # POST /api/agents (create+deploy), GET /api/agents (list)
      agents.$slug.ts     # GET/DELETE /api/agents/:slug
      agents.$slug.invoke.ts  # POST /api/agents/:slug/invoke
      agents.$slug.stop.ts    # POST /api/agents/:slug/stop
      auth/
        device.ts         # POST /api/auth/device (start session)
        device.$sessionId.ts  # GET /api/auth/device/:id (poll)
        device.$sessionId.approve.ts  # POST /api/auth/device/:id/approve
        device.lookup.ts  # GET /api/auth/device/lookup
  components/
    ui/                   # shadcn components (button, card, dialog, etc.)
  lib/
    api/
      auth.ts             # requireAuth() - API key validation
      errors.ts           # ApiError, NotFoundError, ValidationError, etc.
      types.ts            # Zod schemas and response types
    db/
      index.ts            # Drizzle client
      schema.ts           # Tables: users, agents, secrets, deployments, apiKeys, deviceAuthSessions
    auth/
      index.ts            # Better Auth config
      device.ts           # generateUserCode(), generateApiKey(), hashApiKey()
    runner/
      index.ts            # RunnerClient - HTTP client for Runner service
    utils.ts              # cn() helper for className merging
drizzle/                  # Migration files
```

## UI Components (shadcn)

Uses [shadcn/ui](https://ui.shadcn.com) with new-york style and zinc base color.

```bash
bunx shadcn@latest add <component>   # Add a component
```

Components live in `src/components/ui/`. Import like:

```tsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
```

## API Routes

Platform exposes REST API for CLI and dashboard:

```
# Agents
POST   /api/agents              → Create agent + deploy to Runner
GET    /api/agents              → List user's agents
GET    /api/agents/:slug        → Get single agent
DELETE /api/agents/:slug        → Delete agent
POST   /api/agents/:slug/invoke → Invoke agent (proxy to Runner)
POST   /api/agents/:slug/stop   → Stop agent

# Device Auth (CLI login)
POST   /api/auth/device              → Start device auth session
GET    /api/auth/device/:id          → Poll for token
POST   /api/auth/device/:id/approve  → Approve session (browser)
GET    /api/auth/device/lookup       → Lookup session by user code
```

All agent routes require `Authorization: Bearer ok_xxxxx` header.

## Database Schema

- `users` - Accounts (Better Auth managed)
- `agents` - id, name, slug, status, endpoint
- `secrets` - Encrypted env vars per user/agent
- `deployments` - History with logs
- `apiKeys` - Hashed API keys for CLI auth
- `deviceAuthSessions` - Temporary sessions for device auth flow

## Environment Variables

```
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=...
RUNNER_URL=http://localhost:8000
PLATFORM_URL=http://localhost:3000
```
