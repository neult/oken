# Oken CLI

Go CLI for deploying and managing agents.

## Commands

```bash
go run .               # Run CLI
go build -o oken .     # Build binary

# From repo root:
task dev:cli
task build:cli
```

## Structure

```
cmd/
  root.go      # Root command, Execute()
  init.go      # oken init
  deploy.go    # oken deploy
  logs.go      # oken logs <agent>
  secrets.go   # oken secrets set/list
  login.go     # oken login
internal/
  api/         # HTTP client for Platform REST API
  config/      # CLI config (~/.oken)
  pack/        # Tarball creation
```

## How CLI Talks to Platform

CLI never talks to Runner directly. All requests go through Platform:

```
oken deploy     → POST /api/agents (sends tarball)
oken logs       → GET /api/agents/:id/logs
oken secrets    → POST/GET /api/secrets
oken login      → POST /api/auth/*
```

The `internal/api/client.go` handles all HTTP calls to Platform.

## Argument Validation

```go
Args: cobra.ExactArgs(1),      // Exactly 1 arg
Args: cobra.MinimumNArgs(1),   // At least 1 arg
Args: cobra.NoArgs,            // No args allowed
```

## Adding a New Command

1. Create `cmd/<name>.go`
2. Define command with `&cobra.Command{}`
3. Add to root in `init()`: `rootCmd.AddCommand(newCmd)`

## Testing

```bash
go test ./...              # Run all tests
go test ./cmd              # Test cmd package
go test -v ./...           # Verbose output
go test -run TestDeploy    # Run specific test
```

## Config

`~/.oken/config.json` - stores auth token and platform endpoint
