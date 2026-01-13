---
title: oken invoke
description: Call an agent
---

```bash
oken invoke <agent> [flags]
```

Sends a request to your agent and prints the response.

## Flags

| Flag | Description |
|------|-------------|
| `-i, --input` | JSON input to send |

## Examples

With inline JSON:

```bash
oken invoke my-agent -i '{"name": "world"}'
```

From stdin:

```bash
echo '{"name": "world"}' | oken invoke my-agent
```

No input (sends `{}`):

```bash
oken invoke my-agent
```
