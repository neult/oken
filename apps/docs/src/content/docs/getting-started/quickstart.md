---
title: Quick Start
description: Deploy your first agent
---

Make sure you've [installed the CLI](/getting-started/installation/) first.

## Login

```bash
oken login
```

Opens your browser. Approve it, done. Token gets saved to `~/.oken/config.json`.

## Write an agent

```bash
mkdir my-agent && cd my-agent
```

Create `main.py`:

```python
def handler(input):
    name = input.get("name", "world")
    return {"message": f"Hello, {name}!"}
```

Got dependencies? Add `requirements.txt`:

```
requests>=2.28.0
```

## Init and deploy

```bash
oken init
oken deploy
```

Output:

```
✓ Agent deployed successfully!
  Name:     my-agent
  Slug:     my-agent
  Status:   running
  Endpoint: http://localhost:3000/api/agents/my-agent/invoke
```

## Call it

```bash
oken invoke my-agent -i '{"name": "Oken"}'
```

```json
{
  "message": "Hello, Oken!"
}
```

## What's next

- [oken.toml](/configuration/oken-toml/) - config options
- [secrets](/cli/secrets/) - env vars for your agents
- [logs](/cli/logs/) - view agent output
