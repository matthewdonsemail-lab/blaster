# Goal

<!-- goal
updated: 2026-10-04T06:32:39Z
commit: fix: stop the sequence read path from reporting steps it does not have
-->

The running scope for the outbound-send correctness objective, opened by the
first proven live 3-step send. `scripts/check-goal.mjs` refuses a push unless
this file is a current outline - updated within 20 minutes, naming the commit
message, the files changed, and the task list. Refresh it with
`node scripts/check-goal.mjs --stamp` right before pushing.

## Objective

What Blaster prints about a sequence is what Blaster stored. The live send of
2026-10-04 proved the send path works end to end and exposed the read path
lying about it: `GET /api/sequences/:id` narrowed the Convex row to four fields
and dropped the steps, so `blaster sequence show` and `blaster sequence run`
fell back to a placeholder sequence, and `blaster sequence new` let a resumed
draft in Convex silently override the steps the operator had just passed. The
work is complete when a sequence read returns its steps, an explicit flag beats
a resumed draft, and a failed read is reported as a failure rather than
described with content nobody wrote.

## Files changed

- apps/api/src/lib/convex/helpers/client.ts
- apps/api/test/convex-get-sequence.test.ts
- apps/api/test/sequence-detail-route.test.ts
- docs/production-readiness.md
- goal.md
- packages/blaster-cli/src/cli/sequence.ts
- packages/blaster-cli/test/sequence-drafts.test.ts
- packages/core/src/blaster/api/helpers/client.ts
- packages/core/src/blaster/api/types.ts
- packages/core/test/blaster-api-client.test.ts

## Task

- [x] Live proof recorded: 3 steps at 0s/30s/30s delivered to one recipient from `+12724470148`, with the Convex and Telnyx ids, in `docs/production-readiness.md` section 5
- [x] The 10DLC claim corrected: the missing messaging campaign did not block delivery, so the readiness doc no longer asserts that it does
- [x] `getSequenceById` returns the full row including `steps`, sorted by `order`
- [x] `SequenceDetail` in `@blaster/core`, and the API client typed against it instead of a four-field summary
- [x] `blaster sequence show` and `blaster sequence run` report a failed read instead of printing `+10000000000` and a fake step
- [x] `blaster sequence new`: an explicit `--steps` overrides a resumed Convex draft, and says so
- [x] Regression tests for all three (`convex-get-sequence`, `sequence-detail-route`, `blaster-api-client`, `sequence-drafts`)
- [x] Full `pnpm check` green: 727 tests, typecheck, lint, secrets, conventions, surfaces

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
