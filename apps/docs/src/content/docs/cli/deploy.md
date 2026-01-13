---
title: oken deploy
description: Deploy agent to platform
---

```bash
oken deploy
```

Packages the current directory and deploys it. Reads config from `oken.toml`.

## Flags

| Flag | Description |
|------|-------------|
| `-n, --name` | Agent name (overrides oken.toml) |
| `-s, --slug` | Agent slug (overrides oken.toml) |

## Examples

Deploy using `oken.toml`:

```bash
oken deploy
```

Override name and slug:

```bash
oken deploy --name "My Agent" --slug my-agent
```
