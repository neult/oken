---
title: oken init
description: Create oken.toml config file
---

```bash
oken init
```

Creates `oken.toml` in the current directory with defaults based on the folder name.

```toml
name = "my-agent"
slug = "my-agent"
```

If `oken.toml` already exists, it'll error out.
