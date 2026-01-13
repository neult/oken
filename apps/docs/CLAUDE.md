# Oken Docs

Astro Starlight docs site.

## Commands

```bash
task dev:docs      # Run on :4321
task build:docs    # Build for production
```

## Structure

```
src/content/docs/
  index.mdx                    # Landing page
  getting-started/
    introduction.md
    installation.md
    quickstart.md
  cli/
    overview.md
    login.md, init.md, deploy.md, etc.
  configuration/
    oken-toml.md
```

## Adding Pages

1. Create `.md` or `.mdx` file in `src/content/docs/`
2. Add frontmatter with `title` and `description`
3. Add to sidebar in `astro.config.mjs`

## Style

- Keep docs concise and direct
- Show code examples, not walls of text
- Use actual values from the codebase, not made up URLs or domains
