# Codex — Package and distribute a plugin

> Vendored from https://developers.openai.com/codex/plugins/build (OpenAI
> documentation). Pulled as reference for the `plugins/blaster/` tree. If the
> upstream page changes, refresh this mirror; do not treat a drift in the
> mirror as a project decision.

## Plugin structure

A portable plugin has a `plugin.json` manifest at its root. It can also include
a `skills/` directory, an `mcp.json` file for bundled MCP servers, and assets.
OpenAI-specific settings live in the root manifest's `extensions.com.openai`
object. A separate `.codex-plugin/plugin.json` is optional and serves as a
compatibility fallback when that object is absent.

- Keep `plugin.json`, `mcp.json`, `skills/`, and `assets/` at the plugin root.
- When adding a Codex overlay, keep only its `plugin.json` inside
  `.codex-plugin/`; referenced hooks, `.app.json`, and other resources stay at
  the plugin root.

Portable manifest example:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Bundle reusable skills and MCP servers.",
  "author": { "name": "Your team", "email": "team@example.com", "url": "https://example.com" },
  "homepage": "https://example.com/plugins/my-plugin",
  "repository": "https://github.com/example/my-plugin",
  "license": "MIT",
  "keywords": ["research", "crm"]
}
```

The root `plugin.json` is the portable entry point. OpenAI also accepts legacy
and Claude-compatible manifests, but new packages should use this format.

## OpenAI-specific metadata

Add `extensions.com.openai` to root `plugin.json` for presentation, registered
MCP server mappings, and lifecycle hooks. Keep portable identity
(`name`, `version`, `description`) at the root. When `extensions.com.openai`
is an object it replaces the entire `.codex-plugin/plugin.json` overlay; the two
are not merged.

## MCP servers

Configure portable MCP servers in root `mcp.json`. Include the Agent Plugins
MCP schema and a named entry under `mcpServers`.

Remote HTTP server:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "docs": { "type": "streamable-http", "url": "https://example.com/mcp" }
  }
}
```

For public submission, submit the remote HTTPS endpoint through "With MCP". If
the MCP server runs locally, deploy it to a public HTTPS URL. After install,
users can enable or disable a bundled MCP server and tune tool approval policy
from their Codex config without editing the plugin:

```toml
[plugins."my-plugin".mcp_servers.docs]
enabled = true
default_tools_approval_mode = "prompt"
enabled_tools = ["search"]
```

## Marketplace

A marketplace is a JSON catalog of plugins.

- Repo marketplace: `$REPO_ROOT/.agents/plugins/marketplace.json`
- Personal marketplace: `~/.agents/plugins/marketplace.json`

Each plugin entry has a `name`, a `source` pointing at the plugin directory
(`source.path` relative to the marketplace root, `./`-prefixed), a `policy`
(`installation`, `authentication`), and a `category`:

```json
{
  "name": "local-repo",
  "plugins": [
    {
      "name": "my-plugin",
      "source": { "source": "local", "path": "./plugins/my-plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

Git-backed and npm-registry entries are also supported:

```json
{
  "name": "remote-helper",
  "source": { "source": "git-subdir", "url": "https://github.com/example/plugins.git", "path": "./plugins/remote-helper", "ref": "main" },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

## CLI commands

```bash
codex plugin marketplace add owner/repo
codex plugin marketplace add owner/repo --ref main
codex plugin marketplace add ./local-marketplace-root
codex plugin marketplace list
codex plugin marketplace upgrade
codex plugin marketplace remove marketplace-name
```

Marketplace sources can be GitHub shorthand (`owner/repo` or
`owner/repo@ref`), HTTP/HTTPS Git URLs, SSH Git URLs, or local marketplace
roots.

## Enable or disable a plugin for a repo

The repo marketplace makes plugins discoverable; the repo's `.codex/config.toml`
controls whether a local-marketplace plugin is enabled for that project:

```toml
[plugins."my-plugin@local-repo"]
enabled = true
```

The quoted key is `plugin-name@marketplace-name`. Project `.codex/config.toml`
loads only for trusted projects; project settings override user, cloud-managed,
and system defaults.

## Skills

Skills live under `skills/<skill-name>/SKILL.md` with YAML frontmatter
(`name`, `description`). Codex discovers them from the root `skills/` directory
of a portable plugin. The built-in `@plugin-creator` skill scaffolds a
`.codex-plugin/plugin.json` compatibility manifest and a local marketplace
entry.

Source: https://developers.openai.com/codex/plugins/build
