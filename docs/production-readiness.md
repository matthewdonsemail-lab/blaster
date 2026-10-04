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
| Claude (claude.ai connector) | Remote MCP over Streamable HTTP at a public HTTPS URL; OAuth with redirect `https://claude.ai/api/mcp/auth_callback` | `open`: no remote endpoint |
| ChatGPT (developer mode / app) | Remote MCP, Streamable HTTP recommended; OAuth 2.1 with protected-resource metadata at `/.well-known/oauth-protected-resource`; per-tool `securitySchemes` | `open`: no remote endpoint |

Work: (1) host `blaster-mcp` as a Streamable HTTP server (same tool list as stdio, one code path); (2) put operator auth in front of it (OAuth 2.1 metadata, per-tool security schemes) reusing the Twenty OAuth identity the HTTP API already uses; (3) install the plugin on a clean machine in Claude Code and Codex and record the run; (4) connect it from ChatGPT developer mode and from claude.ai and record the run. Blocker: `TWENTY_OAUTH_CLIENT_SECRET` is not set anywhere.

## 2. Parity: CLI, Clack menus, MCP, HTTP

Every capability exists on every surface it is meant for, and the Clack wizards ask for the same inputs the MCP tool takes. `blaster capabilities` and `check:surfaces` already enforce command/tool/route parity for the capability registry (`proven`: pre-push check). Not enforced yet: **wizard-to-tool input parity** (the prompts `sequence new` and `pool` ask versus the arguments of the MCP tools). Work: a test that lists each wizard's prompted fields and asserts each is an input of the matching tool, and the reverse.

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

Work for the state rule: store each owned number's state (from its area code, overridable), derive the recipient's state, and in the readiness check and pool selection prefer, and by policy require, a match. Needs a decision from Matt: hard block, or prefer-then-fall-back with a warning. A pool with numbers in several states then picks the matching one automatically.

## 4. Buying numbers inside the wizard flow

Buying a number must end with the number attached to what lets it send: Telnyx account, messaging profile, 10DLC campaign (or toll-free verification), and pool. Today `numbers buy` orders the number and the purchase action stores it; account assignment, campaign assignment and pool membership are separate manual steps. Work: make the buy flow (CLI wizard and MCP tool) take and apply account, profile and campaign, show the resulting readiness, and refuse to call the number sendable until it is.

## 5. Live test with the test account (Abel)

The test recipient is a team member's prospect record in Twenty. Success criteria, each recorded with the Convex ids and Telnyx message ids:

1. A 3-step sequence with 30-second waits sends step 1 from the intended number at an allowed hour.
2. Step 2 and 3 follow at the configured spacing, each stamped with sequence, enrollment and step.
3. Telnyx reports delivery status and Blaster records it.
4. A reply from the test phone stops the sequence, is stored on the same conversation, and (once built) is classified.
5. A STOP suppresses the person and nothing further sends.
6. The prospect-to-lead promotion keeps the same conversation.

Status: enrolled and queued on the dev deployment; waiting for the next allowed send window. Items 1 to 6 are `open` until run.

## 6. Documentation

One page per tool in the Internal Tools forum, kept in step with `README.md` and `plugins/blaster/skills/`. Each page states what works, what is proven and how, and what is not. Status wording must match this file.

## Sources

- Claude custom connectors: https://claude.com/docs/connectors/building
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- OpenAI, build an MCP server for ChatGPT/Codex plugins: https://developers.openai.com/plugins/build/mcp-server
- OpenAI plugin auth: https://developers.openai.com/plugins/build/auth.md
- ChatGPT developer mode: https://developers.openai.com/api/docs/guides/developer-mode
