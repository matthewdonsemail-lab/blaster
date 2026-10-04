# Production readiness: what "works" has to mean

Written 2026-10-04 after a claim of "it works" turned out to cover only part of the system. Nothing below is marked done unless a named test or a live run on the deployment proves it. Update the **Evidence** column as each item is proven; an item without evidence is not done.

Status key: `proven` (test or live run, linked), `built` (code exists, not proven live), `open` (not built).

## 1. Distribution: MCP server and plugin

Goal: people use Blaster as a connector in ChatGPT and Claude, and as a plugin in Codex and Claude Code.

What the vendors require (sources at the end):

| Surface | Requirement | Blaster today |
| --- | --- | --- |
| Claude Code, Codex (local) | Stdio MCP server plus plugin manifest | `built`: `plugins/blaster/`, `blaster-mcp` over stdio. Not installed and exercised end to end from a clean machine. |
| Claude Code, Codex (remote, bearer header) | Streamable HTTP MCP at a URL, `Authorization: Bearer` | `proven` 2026-10-04: `POST /mcp` on `https://blaster.listeningkit.com` (the only documented entry point; first proven on the Vercel hostname). No token gives 401; with the operator token `tools/list` returns the tool table and `blaster_list_accounts`, `blaster_list_pools`, `blaster_list_suppressions` return real answers as the caller. Route test: `apps/api/test/mcp-route.test.ts`. Needed a `vercel.json` rewrite (#27). |
| Claude (claude.ai connector) | Remote MCP over Streamable HTTP at a public HTTPS URL; OAuth with redirect `https://claude.ai/api/mcp/auth_callback` | `built`: remote endpoint live at `https://blaster.listeningkit.com/mcp`; connector OAuth (authorization-server metadata / dynamic registration via Twenty) still `open` |
| ChatGPT (developer mode / app) | Remote MCP, Streamable HTTP recommended; OAuth 2.1 with protected-resource metadata at `/.well-known/oauth-protected-resource`; per-tool `securitySchemes` | `built`: remote endpoint live; OAuth shim still `open` |

Work: (1) done: `blaster-mcp` served as a Streamable HTTP server sharing the stdio tool table, behind the operator gate (#25, #27). (2) remaining: publish authorization-server metadata pointing at Twenty (Twenty accepts dynamic client registration at `/oauth/register`, proven during the login move in #30 — the shim is small). (3) install the plugin on a clean machine in Claude Code and Codex and record the run; (4) connect it from ChatGPT developer mode and from claude.ai and record the run. Auth today is `Authorization: Bearer <operator token>`; no `TWENTY_OAUTH_CLIENT_SECRET` is needed for this path (login moved to a public PKCE client in #30).

## 2. Parity: CLI, Clack menus, MCP, HTTP

Every capability exists on every surface it is meant for, and the Clack wizards ask for the same inputs the MCP tool takes. `blaster capabilities` and `check:surfaces` enforce command/tool/route parity for the capability registry (`proven`: pre-push check). Wizard-to-tool input parity is enforced by `packages/blaster-cli/test/wizard-mcp-parity.test.ts` (#24): each command's flags are paired with its MCP tool against real help text and tool schemas in both directions — adding an input on one side only fails the test. Cancel/lifecycle surfaces (`sequence cancel|status`, `enrollments cancel|pause|resume`, 5 MCP tools) are covered the same way (#32, #33).

## 3. Sender rules (what a number may send to)

Rules that must be enforced before a send, not discovered after:

| Rule | Today |
| --- | --- |
| Number registered for the traffic (10DLC campaign, or toll-free verified), unless an operator override with a reason is set | `proven` (gate, #6, #14) |
| Sender and recipient in the same state / area-code region: a number owned in Philadelphia does not text Chicago | `built`: `checkStateMatch` (core), pool selection filters by recipient state, fixed/pinned senders park as `state-mismatch`; per-number `stateCode` override. Hard block, no fallback (pending Matt). Tests: `state-match.test.ts`, `state-routing.test.ts`. Not yet proven on a live send. |
| Quiet hours in the recipient's time zone | `proven` live on dev (send deferred overnight) |
| Suppression (STOP) across all numbers | `proven` (tests) |
| Messaging profile bound for the country | `proven` (#15) |
| Per-number and per-campaign rate limits | partly: constants, not per-registration ceilings (`docs/rate-limits-and-compliance.md`) |
| Account health (burned/disabled account skipped) | `proven` (#16, #19) |

Work for the state rule: store each owned number's state (from its area code, overridable), derive the recipient's state, and in the readiness check and pool selection prefer, and by policy require, a match. Policy is hard block, no fallback (confirmed; a per-campaign opt-in fallback is not built). A pool with numbers in several states picks the matching one automatically; with no match the enrollment parks (`pool-no-state-matching-sender` / `state-mismatch`).

## 4. Buying numbers inside the wizard flow

Buying a number records it in the Convex ledger and reports what it still needs before it can send (#22). The buy flow (CLI wizard and MCP tool) takes account state, profile and pool (`--state`, `--pool`; MCP `stateCode`, `poolId`); `numbers attach` / `blaster_attach_number` / `POST /api/numbers/attach` applies the same for numbers bought elsewhere. A bought number is never assumed sendable. Not built: buying under a non-default account from Blaster (buy uses the default key), and assigning the number to a 10DLC campaign (reported as a `needs` gap).

## 5. Live test with the test account (Abel)

The test recipient is a team member's prospect record in Twenty. Success criteria, each recorded with the Convex ids and Telnyx message ids:

1. A 3-step sequence with 30-second waits sends step 1 from the intended number at an allowed hour.
2. Step 2 and 3 follow at the configured spacing, each stamped with sequence, enrollment and step.
3. Telnyx reports delivery status and Blaster records it.
4. A reply from the test phone stops the sequence, is stored on the same conversation, and (once built) is classified.
5. A STOP suppresses the person and nothing further sends.
6. The prospect-to-lead promotion keeps the same conversation.

Status: the earlier queued test enrollment was cancelled (replaced-by-lifecycle-demo path, #32); a fresh 3-step short-interval run is `open` until executed. Campaign lifecycle tooling is `built`: `sequence cancel|status`, `enrollments cancel|pause|resume` on CLI/API/MCP with a masked lifecycle view, per-sequence `quietHoursOverride` (reason required, default off, consenting test recipient only), 15s runner cron (#32, #33). Items 1 to 6 remain `open` until a live run records Convex ids and Telnyx message ids. Item 6 (prospect-to-lead promotion keeps the conversation) belongs to the dialer/conversation work, not Blaster readiness — tracked there.

## 6. Documentation

One page per tool in the Internal Tools forum, kept in step with `README.md` and `plugins/blaster/skills/`. Each page states what works, what is proven and how, and what is not. Status wording must match this file.

## Sources

- Claude custom connectors: https://claude.com/docs/connectors/building
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- OpenAI, build an MCP server for ChatGPT/Codex plugins: https://developers.openai.com/plugins/build/mcp-server
- OpenAI plugin auth: https://developers.openai.com/plugins/build/auth.md
- ChatGPT developer mode: https://developers.openai.com/api/docs/guides/developer-mode
