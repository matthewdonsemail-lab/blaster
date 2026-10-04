# Goal

<!-- goal
updated: 2026-10-04T08:31:27Z
commit: test: cover the read failures the send-path tables only described
-->

The running scope for the documentation objective: the diagrams, README, and prose
docs must describe how Blaster actually works, and must be kept honest by a
gate rather than by discipline. `scripts/check-goal.mjs` refuses a push unless
this file is a current outline - updated within 20 minutes, naming the commit
message, the files changed, and the task list. Refresh it with
`node scripts/check-goal.mjs --stamp` right before pushing.

## Objective

As more prompts, CLI commands, API routes, and MCP tools are added, the written
description of the system is the only thing telling a new reader which
credential a given route needs and what a diagram is asserting. It has to be
complete, and it has to fail loudly when it goes stale. The work is complete
when every entry surface is drawn, the enrollment and runner state machines are
transcribed from the code rather than summarised, `docs/diagrams/README.md`
points a new reader at the three diagrams that explain the system, and
`pnpm check:diagrams` parses every diagram and asserts the facts they claim -
so a diagram cannot quietly contradict the code.

## Files changed

- README.md
- docs/architecture.md
- docs/call-history.md
- docs/error-codes.md
- docs/diagrams/README.md
- docs/diagrams/data-model.mmd
- docs/diagrams/deployment-and-gates.mmd
- docs/diagrams/entrypoints-and-transports.mmd
- docs/diagrams/enrollment-state-machine.mmd
- docs/diagrams/guidance-and-ai-prompts.mmd
- docs/diagrams/sequence-builder.mmd
- docs/diagrams/sequence-runner-tick.mmd
- docs/diagrams/surfaces-and-core.mmd
- docs/diagrams/system-overview.mmd
- docs/identity.md
- docs/send.md
- docs/sequencer.md
- goal.md
- package.json
- packages/blaster-cli/test/sequence-read-failures.test.ts
- plugins/blaster/.claude-plugin/plugin.json
- pnpm-lock.yaml
- scripts/check-diagrams.mjs

## Task

- [x] `entrypoints-and-transports.mmd`: all four caller-facing surfaces, both MCP transports, the Hono and Convex HTTP routers as non-interchangeable, and the routes that deliberately skip `requireOperator`
- [x] `enrollment-state-machine.mmd`: the statechart transcribed from `machine.ts`, with the states only an operator can leave marked
- [x] `sequence-runner-tick.mmd`: the cron tick, the due queue, every skip and defer reason, and why capacity is claimed before the step
- [x] `guidance-and-ai-prompts.mmd`: the deterministic reply templates, the single LLM call, and why `@clack/prompts` is neither
- [x] Existing diagrams corrected against the code: `system-overview`, `surfaces-and-core`, `data-model` (all 15 tables), `sequence-builder`, `deployment-and-gates`
- [x] `docs/diagrams/README.md` leads with the three diagrams to read first and states the rendering trap
- [x] Embedded diagrams in `README.md` and in `docs/architecture.md`, `docs/send.md`, `docs/sequencer.md`, `docs/identity.md`, `docs/call-history.md` from the same source as the `.mmd` files
- [x] `scripts/check-diagrams.mjs`: parses every `.mmd` and every embedded `mermaid` fence with Mermaid's own parser, and asserts the facts the diagrams claim about the code
- [x] Self-test for the checker (unparseable diagram rejected, contradicted fact rejected, fenced-block extraction), wired into `pnpm check` as gates 14 and 15
- [x] `mermaid` and `jsdom` added as devDependencies via pnpm; lockfile updated
- [x] Full `pnpm check` green with the new gates in the chain
- [x] Audit fixes A-F against `machine.ts`, `actions.ts` and `compliance.ts`: runner-tick redrawn in the real guard order with the account, API-key, `no-number` and `consumeSender` gates, no brand bucket in the capacity claim, generic same-state wording, guidance CLASSIFY is `classifyConversation`, `crons.ts` comment says 15 seconds
- [x] Gate is real: `%%` annotation reader fixed, `run()` owns its violations, the self-test drives `run()` for a wrong fact, a right fact, an unknown fact name and a contradicted drawing, ordering facts anchor on call sites with comments stripped
- [x] `%% edge-chain:` so the gate checks the arrows a diagram draws, not only the prose in its annotation
- [x] `docs/error-codes.md`: every send-path and read-path failure with where it is raised, whether it retries, what the operator sees, and which test covers it
- [x] `sequence-read-failures.test.ts`: `showDraft`/`runDraft` on 404, 502 and 503, and `newDraft` end to end for explicit `--steps`

## Backlog carried forward from the pool objective

- [x] `convex/pool/` domain: the `poolNumbers` relation, per-number rate state, internal `consumeSender`, cursor remap
- [x] `packages/core/src/pipeline/pool/`: pure selection and cursor math, unit-tested
- [x] Sequencer runner: sender chosen from the pool, capacity claimed before the step claim, deferrals retry
- [x] Reconcile with `main`'s send rate limiter: pool paces, `convex/rateLimit.ts` admits, one source for the period
- [x] API routes, MCP tools, CLI commands, and the interactive `blaster pool` wizard (login gate via `ensureLiveSession`)
- [x] Capability registry kept honest by the new `scripts/check-surfaces.mjs` gate
- [x] `campaignFor` attributes pool-backed threads; TOCTOU closed by reserving the proposed order
- [x] Inbound ownership reads the Convex ledger; the reply re-check is peer-wide
- [x] `docs/pools.md` describes the relation, rates, surfaces, and the inbound path
- [x] Wayfinder map charted at `.scratch/reliable-pooled-outbound/` (destination, fog, decisions, tickets)
- [x] Suppression model decided (ticket 01): a durable per-person `suppressions` row keyed on the E.164 peer, written by inbound STOP only, checked at enroll and send, lifted by an explicit human resolve
- [x] Durable per-person suppression implemented (ticket 01): `convex/suppressions/`, enroll + send checks, API/CLI/MCP surfaces
- [x] `convex/crons.ts` + `convex.json`: the runner is woken on a schedule (it never ran before)
- [x] Convex integration-test harness (`convex/test/`): pool, conversations, suppressions against a real runtime
- [x] Decided how a contact from several pool numbers appears in the inbox (ticket 02): per-number threads stay, the inbox gains a person-level grouping
- [x] Decided the limiter/pool budget contract (ticket 03): limiter is the hard ceiling, pool paces at or under it
- [x] Convex-Twenty seam: `sequence/actions.enrollRecipients` walks `agencyProspects` with the send filter DSL, enrolls, and mirrors `outboundState`; API/CLI/MCP surfaces
- [x] Person-level inbox view (ticket 02 implementation): `groupBy: "person"` on `listConversations` folds one row per person over their pool numbers; `GET /api/conversations?groupBy=person`, core client `listConversationPersons`, `blaster inbox list --person`, MCP `blaster_list_conversation_persons`; integration tests
- [x] Convex codegen, not hand-edited `_generated`: `scripts/convex-codegen.mjs` regenerates `api.d.ts`/`server.d.ts` from the local tree (no deployment login needed); `check:generated` keeps them current; `check:convex` exempts the `convex/http/` router from R8 with a documented note
- [x] Operator routes mirrored on the Convex HTTP router: `convex/http/` registers pools, sequences, suppressions, and conversations routes so a site with no Hono in front still answers them; `check:surfaces` now verifies the mirror and rejects drift in both directions
- [x] OpenAPI spec at `openapi.yaml` generated from the deployment by the official `convex-helpers open-api-spec` CLI (`pnpm openapi` to refresh); documents the Convex function surface including internal actions
- [x] Open the PR and get the pool branch merged to `main` (ticket 05) — merged 2026-10-02, `9b70ac3`
- [x] 10DLC compliance verification snapshot and send gate: `checkSenderReadiness` (7 gates, snapshot freshness limit), `checkDocReadiness`, hard send gate excluding unverified US long-codes
- [ ] Multi-scope token bucket rate limiting: account ceiling, per-number bucket and a campaign bucket are applied; the brand limiter is never run (`brandId` is not passed) and T-Mobile's daily brand cap is not modelled (see `docs/rate-limits-and-compliance.md`)
- [x] Stable sender identity: per-enrollment sender pinning (`pinnedSenderPhoneNumber`, `pinnedSenderNumberId`) from active pools
- [x] State machine sender-readiness gate: `senderNotReady` guard parks unverified senders to `awaiting_human`
- [x] Parity across operator surfaces: CLI (`blaster phones compliance`, `blaster sequence activate`), MCP (`blaster_check_phone_compliance`, `blaster_activate_sequence`, `blaster_register_sequence`), and HTTP API (`/api/phones/:number/compliance`, `/api/sequences/:id/activate`, `/api/sequences`)
- [x] Recipient timezone derivation: synchronous area-code to USPS state mapping via `lookupAreaCodeState` in `timeZoneForNumber` prevents valid US numbers without explicit state codes from parking as unplaceable
- [x] Telnyx 10DLC provider sync action: `phoneNumbers:refreshComplianceSnapshot` queries live carrier/campaign provisioning and updates the compliance snapshot
- [x] Convex-only sequence draft/resume lifecycle and atomic pool creation: eliminate local sequence storage (.blaster/sequences.json), add resumable sequenceDrafts table in Convex with checkpointing, derive ownership server-side, atomic createPool with phoneNumbers array, and surface parity across CLI, API, MCP, and Convex HTTP router
- [x] Toll-free verification gate (`tollFreeVerification`, fail closed), outbound attribution (`sequenceId`/`enrollmentId`/`stepIndex` on messages), Telnyx error codes + 429 backoff, enrollment dedupe + pause/resume, per-step `sequenceReport` (PRs #6-#10)
- [x] Convex push and runtime fixes found on the dev deployment: test support files renamed `*.support.ts` (#11), dynamic `import()` removed from Convex functions (#12), fixed-number sequences use the number's bound profile (#15)
- [x] Per-number operator override `allowUnregistered` (reason required, default strict) (#14)
- [x] Telnyx accounts: `telnyxAccounts` registry, `TELNYX_API_KEY__<REF>` env keys, `phoneNumbers.accountRef`, burn-aware pool selection (#16); `blaster accounts`, `GET|POST /api/accounts`, `POST /api/accounts/assign`, MCP `blaster_list_accounts`/`blaster_set_account`/`blaster_assign_number_account`
- [ ] Campaign to pool mapping derived from Twenty, one sender-orchestration layer for CLI/API/MCP/sequences, per-account webhooks and compliance refresh, auto-burn on carrier blocks
- [ ] Clack wizards (`sequence new`, `pool`) show account and burned state on number pick lists; not yet verified in a real terminal
- [ ] README reflects only live, relay-contracted CLI and MCP tools; `check:surfaces` enforces it as a pre-push gate
- [ ] Authored docs aligned to current state: docs/sequencer.md delivery step, docs/architecture.md gates table, docs/README.md authored index, docs/deployment.md rewritten for Railcode
- [ ] Dual-host plugin tree: `plugins/blaster/` carries both Claude Code (`.claude-plugin/` + `.mcp.json`) and Codex (root `plugin.json` + `mcp.json` + `.agents/plugins/marketplace.json`) from one source; five skills drawn from the as-built docs; vendor pages committed under `docs/plugins/`
