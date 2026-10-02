# Claude Code — Create a plugin

> Vendored from https://code.claude.com/docs/en/plugins/create (Anthropic
> documentation). Pulled as reference for the `plugins/blaster/` tree. If the
> upstream page changes, refresh this mirror; do not treat a drift in the mirror
> as a project decision.

## What a plugin is

A plugin is a directory of skills, agents, hooks, and MCP servers, plus a
`plugin.json` file, called the manifest, that names the plugin. Claude Code
loads the directory as one unit, so you can share it with teammates, install it
in several projects, or publish it to a marketplace.

When you move standalone skills, agents, hooks, and MCP config into a plugin:

- **Where the files go:** under the plugin's own directory (the plugin root), as
  `skills/`, `agents/`, `hooks/hooks.json`, and `.mcp.json`.
- **How they're named:** plugin skills and agents get the plugin name as a
  prefix, such as `/my-plugin:hello`, so two plugins can each provide a `hello`
  skill without colliding.

## Create a plugin

1. Create the plugin directory, with a `.claude-plugin/` folder inside it to
   hold the manifest: `mkdir -p my-first-plugin/.claude-plugin`.
2. Write the manifest at `my-first-plugin/.claude-plugin/plugin.json`:

   ```json
   {
     "name": "my-first-plugin",
     "description": "A greeting plugin to learn the basics",
     "version": "1.0.0",
     "author": { "name": "Your Name" }
   }
   ```

   - `name`: required. It identifies the plugin and becomes the prefix on every
     skill and agent the plugin provides. No spaces.
   - `description`: the text users see for the plugin in `/plugin`.
   - `version`: optional. Setting it keeps users on that version until you
     change it.
   - `author`: who to credit. `name` is required inside it.

   Only `plugin.json` goes inside `.claude-plugin/`.

3. Add a skill. Each skill is a directory under `skills/` containing a
   `SKILL.md`:

   ````markdown
   ---
   name: hello
   description: Greet the user with a friendly message
   disable-model-invocation: true
   ---

   Greet the user warmly and ask how you can help them today.
   ````

   `disable-model-invocation: true` means Claude does not run the skill on its
   own — only the operator triggers it. Remove that line for a skill Claude runs
   autonomously. The command is `/my-first-plugin:hello`.

4. Validate: `claude plugin validate ./my-first-plugin` prints
   `Validation passed`.
5. Run with the plugin loaded: `claude --plugin-dir ./my-first-plugin`, then
   `/my-first-plugin:hello`.

## Plugin layout

| Location | Contents |
| --- | --- |
| `.claude-plugin/plugin.json` | The manifest |
| `skills/` | One `<name>/SKILL.md` directory per skill |
| `commands/` | Flat Markdown files, the older form of skills |
| `agents/` | One Markdown file per subagent |
| `hooks/hooks.json` | Hook configuration |
| `.mcp.json` | MCP server definitions |

Only `plugin.json` goes inside `.claude-plugin/`. Components saved there do not
load. The plugin root is the plugin's own directory, not `~/.claude/` — a
`.mcp.json` saved at `~/.claude/.mcp.json` does not load.

## Load and test

- `claude --plugin-dir ./my-first-plugin` loads a directory (or `.zip`) for one
  session. Repeat the flag for several.
- `claude --plugin-url https://example.com/my-first-plugin.zip` fetches an
  archive for one session.
- `CLAUDE_CODE_PLUGIN_DIRS` loads plugin paths when a flag cannot be added.
- `claude plugin init my-tool` scaffolds a plugin under `~/.claude/skills/`
  that loads every session.
- In a repo, the same layout at `<project>/.claude/skills/<name>/` loads for
  everyone in that repository.

After edits, run `/reload-plugins` in the session. `/plugin` shows the
**Installed** and **Errors** tabs; `/mcp` shows the server's status.

## Share a plugin

- Send the directory or a `.zip` directly.
- List it in your own marketplace (teammates add the marketplace once).
- Submit to Anthropic's directory (review-gated; reaches Claude Code through
  the account).

Source: https://code.claude.com/docs/en/plugins/create
