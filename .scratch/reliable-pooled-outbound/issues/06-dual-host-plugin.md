# Ticket 06: Dual-host plugin packaging

Type: task
Status: claimed

Package Blaster so it loads natively on both Claude Code and Codex from one
tree, and record the decision in the wayfinder map.

## The question

How do we ship the `blaster-mcp` server plus the operator skills so an agent
host installs them without hand-editing three config files per host?

## The decision

One `plugins/blaster/` directory carries both hosts' manifests from the same
source:

- **Claude Code**: `.claude-plugin/plugin.json` + `.mcp.json` + `skills/`.
  Load with `claude --plugin-dir ./plugins/blaster` or a marketplace.
- **Codex**: root portable `plugin.json` (Agent Plugins schema) + `mcp.json` +
  `skills/`, distributed by the repo-scoped
  `.agents/plugins/marketplace.json` and registered with
  `codex plugin marketplace add matthewdonsemail-lab/blaster`.

The MCP config is declared twice (different file names, same server) because
the two hosts do not share a config format. Every skill body is drawn from the
as-built docs - `docs/pools.md`, `docs/sequencer.md`, `docs/send.md` - so the
skill and the code cannot drift apart.

The send skill is `disable-model-invocation: true`: the operator says "send",
the model does not decide. The read and plan skills (pools, prospects,
sequences, suppressions) stay model-invoked.

The exact vendor pages are committed under `docs/plugins/.claude/` and
`docs/plugins/.codex/`; if either host changes its spec, refresh the page
first, then re-audit the tree.

## Why not two trees

A separate Claude tree and Codex tree would diverge on the day one of them
gets a skill the other does not. One tree, two thin manifests, is the only
shape where `check:surfaces`-style drift detection can hold both at once.
