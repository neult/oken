---
title: oken logs
description: View agent logs
---

```bash
oken logs <agent> [flags]
```

Shows logs from your agent.

## Flags

| Flag | Description |
|------|-------------|
| `-f, --follow` | Stream logs in real-time |
| `-n, --tail` | Number of lines to show (default 100, max 10000) |

## Examples

Last 100 lines:

```bash
oken logs my-agent
```

Stream logs (like `tail -f`):

```bash
oken logs my-agent -f
```

Last 500 lines:

```bash
oken logs my-agent -n 500
```
