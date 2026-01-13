---
title: oken secrets
description: Manage secrets
---

Secrets are injected as environment variables into your agents.

## Commands

### Set a secret

```bash
oken secrets set KEY=value
```

Secret names must be uppercase with underscores (e.g., `API_KEY`, `DATABASE_URL`).

### List secrets

```bash
oken secrets list
```

### Delete a secret

```bash
oken secrets delete KEY
```

## Scopes

Secrets can be user-level (available to all your agents) or agent-specific.

**User-level:**

```bash
oken secrets set OPENAI_API_KEY=sk-xxx
```

**Agent-specific:**

```bash
oken secrets set API_KEY=xxx --agent my-agent
```

Agent-specific secrets override user-level secrets with the same name.

## Examples

```bash
# Set a secret for all agents
oken secrets set OPENAI_API_KEY=sk-xxx

# Set a secret for one agent
oken secrets set DATABASE_URL=postgres://... --agent my-agent

# List all secrets
oken secrets list

# List secrets for an agent
oken secrets list --agent my-agent

# Delete a secret
oken secrets delete API_KEY
```
