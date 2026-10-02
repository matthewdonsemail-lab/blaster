# Plugin packaging

How `plugins/blaster/` is shaped so it loads natively on both Claude Code and
Codex, and the vendor pages the layout is drawn from.

## The tree

```
plugins/blaster/
├── .claude-plugin/
│   └── plugin.json          # Claude Code manifest
├── plugin.json              # Codex portable manifest (Agent Plugins schema)
├── mcp.json                 # Codex portable MCP config (mcpServers + transport type)
├── .mcp.json                # Claude Code MCP config (same server, Claude format)
├── skills/
│   ├── send-sms/SKILL.md
│   ├── number-pools/SKILL.md
│   ├── sequences/SKILL.md
│   ├── prospects/SKILL.md
│   └── suppressions/SKILL.md
└── .agents/
    └── plugins/
        └── marketplace.json # repo-scoped Codex marketplace entry
```

The two manifests describe the same plugin; each host reads its own. The MCP
config is declared twice because the two hosts use different file names and
formats, but both point at the same `blaster-mcp` server.

## Vendor reference pages

These pages are committed as the source of the layout decisions above:

- [`.claude/create.md`](.claude/create.md) — Claude Code: plugin manifest,
  skill layout, `.mcp.json`, `--plugin-dir` load path, marketplace.
- [`.codex/package.md`](.codex/package.md) — Codex: portable `plugin.json`
  (Agent Plugins schema), `mcp.json`, repo-scoped marketplace,
  `codex plugin marketplace` CLI.

If either host changes its plugin spec, refresh the matching vendor page first,
then re-audit the tree against it. Do not edit the layout without updating the
vendor page, so the decision and its source stay paired.

## What makes the tree drift-proof

`check:surfaces` already enforces that the MCP tools and HTTP routes a
capability names exist. The same logic is extended to the skill files under
`plugins/blaster/skills/`: any `blaster <cmd>` or `blaster_<tool>` token a skill
names must resolve to a live CLI command or MCP tool, so a shipped skill cannot
describe a command that no longer exists.

## The one decision that shapes the skills

For an SMS-sending tool with a per-number rate budget and a durable suppression
list, the send skills default to `disable-model-invocation: true` — the
operator says "send", the model does not decide. The read and plan skills
(pools, prospects, sequences validate/preview) stay model-invoked, because they
are safe to reach for without an explicit operator command.
