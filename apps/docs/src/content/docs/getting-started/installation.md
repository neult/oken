---
title: Installation
description: Install the Oken CLI
---

## Build from source

Requires Go 1.21+ and [Task](https://taskfile.dev).

```bash
git clone https://github.com/neult/oken.git
cd oken
task build:cli
```

This builds the binary to `apps/cli/oken`. Move it somewhere in your PATH:

```bash
sudo mv apps/cli/oken /usr/local/bin/
```

Check it works:

```bash
oken --help
```
