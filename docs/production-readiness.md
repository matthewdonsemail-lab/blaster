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

**Items 1 to 3 are `proven` on the dev deployment (2026-10-04).** Sequence `abel-live-3step`, Convex sequence id `jx7c05cps5t3p8b1yyqq24q87h8fnrcb`, enrollment `jn77vf8kfsjbb587ta5tzqtskx8fn41g`, sending number `+12724470148`, one recipient `+15702355822` enrolled from `agencyProspects` `7b6db9a8-1964-4354-b440-404b968d66e5` via `blaster sequence enroll --filters`. Steps at `0s`, `30s`, `30s`:

| Step | Blaster recorded | Telnyx message id | Telnyx status | Carrier |
| --- | --- | --- | --- | --- |
| 1 | `06:12:31Z sent` | `4031a105-8aef-4c5f-93f8-6460afb3933f` | `delivered` | BOOST SUBSCRIBERCO L.L.C. |
| 2 | `06:13:16Z sent` | `4031a105-8b9a-4e2b-a801-841265e7e724` | `delivered` | BOOST SUBSCRIBERCO L.L.C. |
| 3 | `06:14:01Z sent` | `4031a105-8c49-452d-b2f0-835cd4f81a9a` | `delivered` | BOOST SUBSCRIBERCO L.L.C. |

Cost $0.0085 per message, `traffic_type: A2P`. The first attempt was held by quiet hours (`next 12:10:31Z`, 02:00 America/New_York); the sequence was rebuilt with `--quiet-hours-override`, which is what the recorded run used. The real gap between 30s configured and 45s observed is the dispatcher's cron tick, not the delay.

Items 4 to 6 are `open`: no reply, STOP, or prospect-to-lead promotion has been exercised against a live carrier.

**The 10DLC gate did not block this send, and the readiness table must say why.** `+12724470148` has no messaging campaign attached to its profile (`messaging_campaign_id: null`, empty `messaging_campaigns` on profile `4001a0b6-245d-4e4d-9fdd-bbbf4d6344d9`), and `blaster phones compliance` reports `Brand: none`, `Campaign: none`. All three messages still delivered.

The gate did run, and it let the send through on its one documented bypass rather than because it was absent. `GET /api/phones/+12724470148/compliance` answers:

```json
{"phoneNumber":"+12724470148","messagingProfileId":"4001a0b6-...",
 "brandId":null,"campaignId":null,"assignmentStatus":null,"carrierProvisioningStatus":null,
 "complianceCheckedAt":1791083784465,"complianceSource":"telnyx-api",
 "readiness":{"ready":true}}
```

In `checkSenderReadiness` (`packages/core/src/pipeline/sequence/compliance.ts`) a US long code with no `campaignId` returns `missing-registration` unless `allowUnregistered` is set, which is checked at line 132 and returns `{ready: true}` immediately. `ready: true` with `brandId` and `campaignId` both null is only reachable that way, so this number carries the per-number operator override.

Two consequences, both of which the wording above must respect:

- The rule in section 3 row 1 was enforced and overridden by an operator, on a number with a recorded reason. That is the feature working.
- Telnyx delivered three A2P messages from this number with no campaign on its profile. So a claim that the missing campaign makes sends fail is not supported by this evidence and must not be repeated. Registration is still the right thing to have before a real cold list, and the gate should still refuse to call the number sendable without the override — but the carrier did not enforce it here.

## 6. Documentation

One page per tool in the Internal Tools forum, kept in step with `README.md` and `plugins/blaster/skills/`. Each page states what works, what is proven and how, and what is not. Status wording must match this file.

## Sources

- Claude custom connectors: https://claude.com/docs/connectors/building
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- OpenAI, build an MCP server for ChatGPT/Codex plugins: https://developers.openai.com/plugins/build/mcp-server
- OpenAI plugin auth: https://developers.openai.com/plugins/build/auth.md
- ChatGPT developer mode: https://developers.openai.com/api/docs/guides/developer-mode
