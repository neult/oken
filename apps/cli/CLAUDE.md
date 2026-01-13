# Oken CLI

Go CLI for deploying and managing agents.

## Important

- **ALWAYS use task commands from repo root.** Never use `go` directly if it's defined in `Taskfile.yml`.

## Commands

```bash
# From repo root:
task dev:cli           # Run CLI
task build:cli         # Build binary to apps/cli/oken
task lint:cli          # Lint with golangci-lint
task format:cli        # Format with gofmt
task check:cli         # Lint + format check
task test:cli          # Run tests
task test:cli:cov      # Run tests with coverage
```

## Structure

```
cmd/
  root.go      # Root command, Execute()
  login.go     # oken login - device auth flow
  init.go      # oken init
  deploy.go    # oken deploy
  list.go      # oken list
  status.go    # oken status <agent>
  stop.go      # oken stop <agent>
  delete.go    # oken delete <agent>
  invoke.go    # oken invoke <agent>
  logs.go      # oken logs <agent> (stub)
  secrets.go   # oken secrets set/list (stub)
internal/
  api/
    client.go  # HTTP client with auth
    auth.go    # Device auth API calls
    agents.go  # Agent CRUD operations
  config/
    config.go  # Load/save ~/.oken/config.json
  pack/
    pack.go    # Tarball creation
  ui/
    ui.go      # Colored terminal output
```

## How CLI Talks to Platform

CLI never talks to Runner directly. All requests go through Platform:

```
oken login      → POST /api/auth/device (start)
                → GET /api/auth/device/:id (poll)
oken deploy     → POST /api/agents (multipart with tarball)
oken list       → GET /api/agents
oken status     → GET /api/agents/:slug
oken stop       → POST /api/agents/:slug/stop
oken delete     → DELETE /api/agents/:slug
oken invoke     → POST /api/agents/:slug/invoke
oken secrets    → POST/GET /api/secrets
```

The `internal/api/client.go` handles all HTTP calls to Platform.

## Config

`~/.oken/config.json` stores auth and settings:

```json
{
  "endpoint": "http://localhost:3000",
  "token": "ok_xxxxx",
  "user": {
    "email": "user@example.com"
  }
}
```

## Adding a New Command

1. Create `cmd/<name>.go`
2. Define command with `&cobra.Command{}`
3. Add to root in `init()`: `rootCmd.AddCommand(newCmd)`
4. If it needs auth, load config and create API client:
   ```go
   cfg, _ := config.Load()
   client := api.NewClient(cfg.Endpoint, cfg.Token)
   ```

## Argument Validation

```go
Args: cobra.NoArgs,            // No args allowed
Args: cobra.ExactArgs(1),      // Exactly 1 arg
Args: cobra.MinimumNArgs(1),   // At least 1 arg
```

## Testing

```bash
task test:cli                  # Run all tests
task test:cli:cov              # With coverage
```
