---
title: oken.toml
description: Agent configuration file
---

`oken.toml` configures your agent. Create it with `oken init` or write it yourself.

## Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name |
| `slug` | Yes | URL-safe identifier (lowercase, hyphens only) |
| `python_version` | No | Python version (default: 3.12) |
| `entrypoint` | No | Main file (default: main.py) |
| `warm_timeout` | No | Seconds to keep agent warm (default: 300) |

## Example

```toml
name = "my-agent"
slug = "my-agent"
python_version = "3.11"
entrypoint = "agent.py"
```

## Entrypoint types

The runner auto-detects how to run your code:

**handler** - A function that takes input and returns output:

```python
def handler(input):
    return {"result": input.get("x") * 2}
```

Also works with `def main(input)`.

**agent** - A class with a `run` method:

```python
class Agent:
    def run(self, input):
        return {"result": input.get("x") * 2}
```

**http** - Your own FastAPI/Flask server. The runner proxies requests to it.

## Slug rules

- Lowercase letters, numbers, hyphens only
- No spaces or underscores
- Must be unique across your agents

`oken init` generates a slug from your folder name.
