# Oken Platform

TanStack Start app - dashboard and REST API. Central hub between CLI and Runner.

## Commands

**Use bun only. Do not use npm or yarn.**

```bash
bun run dev      # Dev server on :3000
bun run build    # Production build
bun run test     # Run vitest tests
bun add <pkg>    # Add dependency

# Database
bunx drizzle-kit generate   # Generate migrations
bunx drizzle-kit migrate    # Run migrations

# From repo root:
task dev:platform
task db:generate
task db:migrate
```

## Testing

```bash
bun run test              # Run all tests once
bun run test --watch      # Watch mode
bun run test src/foo.test.ts   # Single file
```

Tests use vitest. Place test files next to source as `*.test.ts` or `*.test.tsx`.

## Structure

```
src/
  routes/
    index.tsx           # Home page
    __root.tsx          # Root layout
    api/
      agents.ts         # Agent CRUD + deployment
      secrets.ts        # Secret management
  components/
    ui/                 # shadcn components (button, card, dialog, etc.)
  lib/
    db/
      index.ts          # Drizzle client
      schema.ts         # Tables: users, agents, secrets, deployments
    auth/               # Better Auth config
    runner/             # HTTP client for Runner service
    utils.ts            # cn() helper for className merging
drizzle/                # Migration files
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

Config in `components.json`. Uses Tailwind v4 with CSS variables for theming (light/dark mode supported).

## How Platform Connects CLI and Runner

```
CLI  --REST-->  Platform  --REST-->  Runner

POST /api/agents        → Store metadata, forward tarball to Runner
GET  /api/agents/:id/logs → Fetch logs from Runner
POST /api/agents/:id/invoke → Proxy request to agent on Runner
```

Platform handles auth, stores data in PostgreSQL, and orchestrates Runner.

## Database Schema

- `users` - Accounts (Better Auth managed)
- `agents` - id, name, slug, status, endpoint
- `secrets` - Encrypted env vars per user/agent
- `deployments` - History with logs

## Environment Variables

```
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=...
RUNNER_URL=http://localhost:8000
```
