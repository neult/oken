---
title: Introduction
description: What is Oken
---

Oken deploys Python agents. You run `oken deploy`, you get a URL.

No Docker, no Kubernetes, no YAML files. Write your code, deploy it.

```python
# main.py
def handler(input):
    return {"message": f"Hello, {input.get('name', 'world')}!"}
```

```bash
oken init
oken deploy
```

## Architecture

- **CLI** - Go binary. Handles `oken deploy`, `oken logs`, etc.
- **Platform** - TanStack Start app. Dashboard, REST API, auth.
- **Runner** - Python FastAPI service. Executes agent code in Docker containers.

The CLI talks to Platform. Platform talks to Runner. You never touch Runner directly.

```
CLI → Platform → Runner → Docker container
```

Head to [Installation](/getting-started/installation/) to get started.
