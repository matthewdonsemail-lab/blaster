# Error codes

Every failure the send path and the read path can produce, and what an operator
does about it.

Scope: the sequence runner (`convex/sequence/`), the sender pool
(`convex/pool/`), the compliance checks
(`packages/core/src/pipeline/sequence/compliance.ts`), the send-outcome
classifier (`packages/core/src/telnyx/messaging/helpers/send-outcome.ts`), the
HTTP read surface (`apps/api/src/index.ts`) and `blaster sequence`
(`packages/blaster-cli/src/cli/sequence.ts`). Batch-send and the Twenty prospect
import have their own reasons at the end.

Read the retry column first. **Retried** means the system reschedules by itself
and no human is needed. **Terminal** means the enrollment parks in
`awaiting-human`, `failed` or `ambiguous` and only a `RESUME` or `RECONCILE`
moves it. An operator who sees a terminal reason is looking at a number, an
account or a campaign that needs fixing before anything else moves.

Where a reason is written twice — once by the state machine, once by the runner
— both sites are given. The machine's value is what ends up on the row.

---

## 1. `lastSkipReason` from the state machine

The field is `convex/schema/sequences.ts:129`. The machine is
`packages/core/src/pipeline/sequence/machine.ts`, and the evaluation guards are
in `evaluating.always` at `machine.ts:391-396` in this order:

| Reason | Raised at | Means | Retry | Test |
|---|---|---|---|---|
| `sender-not-ready:<reason>` or `sender-not-ready` | `machine.ts:192-194` | The sender is not allowed to send this recipient. Highest-priority guard (`machine.ts:391`). | **Terminal** — `nextDueAt: null`, status `awaiting-human` | `packages/core/test/sequence-machine.test.ts:352` (asserts `sender-not-ready:missing-registration`) |
| `unplaceable-recipient` | `machine.ts:180` | No quiet-hours window exists for this recipient's locale, so the send can never be scheduled. | **Terminal** — `awaiting-human` | `sequence-machine.test.ts:335` |
| `<SkipReason>` or `unspecified` | `machine.ts:156` | Recipient-side ineligibility. See §5. | **Retried** after `SKIP_RETRY_MS` (1 hour, `types.ts:41`) | `sequence-machine.test.ts:263` (asserts `do-not-contact`) |
| `quiet-hours` | `machine.ts:168` | Outside 08:00–21:00 recipient-local. | **Retried** at `verdict.nextAllowedAt` | `sequence-machine.test.ts:292` |
| `send-failed` | `machine.ts:263` | `SEND_FAILED`, retryable, under `MAX_STEP_ATTEMPTS` (3, `types.ts:19`). | **Retried** with `backoffFor(attempts)` | `sequence-machine.test.ts:209` |
| `<SEND_FAILED reason>` | `machine.ts:273` | `SEND_FAILED` that is not retryable, or the attempt ceiling is reached. The reason is the Telnyx text from §4. | **Terminal** — status `failed` | `sequence-machine.test.ts:221`, `:229` |
| `ambiguous` | `machine.ts:287` | `SEND_AMBIGUOUS` or `CLAIM_HELD_BY_OTHER`. The send may or may not have gone out. | **Terminal, never retried** — status `ambiguous`; there is no `TICK` handler in the `ambiguous` state, only `RECONCILE` (`machine.ts:440`) | `sequence-machine.test.ts:156`-`:173` |
| `reconciled-not-sent` | `machine.ts:297` | `RECONCILE` proved the message never went out. | **Retried immediately** at `event.at` | `sequence-machine.test.ts:192` |
| `null` | `machine.ts:252` | A send succeeded; the previous reason is cleared. | — | `sequence-machine.test.ts:85` |

## 2. `sender-not-ready:*` — the readiness reasons

`SenderReadinessReason` is declared at
`packages/core/src/pipeline/sequence/compliance.ts:19-29`. The value is prefixed
by `machine.ts:192`. Every one of these is terminal.

| Suffix | Raised at | Means | Test |
|---|---|---|---|
| `missing-messaging-profile` | `compliance.ts:126` | No messaging profile bound to the number. Checked before every other rule, before `allowUnregistered`. | `packages/core/test/compliance.test.ts:49`, `:149`, `:165` |
| `missing-registration` | `compliance.ts:167` | Number is not assigned to a 10DLC campaign. | `compliance.test.ts:60`; `sequence-machine.test.ts:352` |
| `tollfree-unverified` | `compliance.ts:141` | Toll-free verification is missing or not `pending`/`verified`. | `compliance.test.ts:142` |
| `snapshot-stale` | `compliance.ts:158` | The 10DLC compliance snapshot is absent or older than 7 days (`DEFAULT_MAX_COMPLIANCE_SNAPSHOT_AGE_MS`, `compliance.ts:17`). | `compliance.test.ts:104`, `:149` |
| `campaign-not-active` | `compliance.ts:177` | Campaign status is neither `ACTIVE` nor `APPROVED`. | `compliance.test.ts:71` |
| `assignment-pending` | `compliance.ts:191` | Number-to-campaign assignment is not `ASSIGNED`/`APPROVED`/`COMPLETE`. | `compliance.test.ts:82` |
| `provisioning-pending` | `compliance.ts:207` | Carrier provisioning is not `COMPLETE`/`COMPLETED`/`READY`/`ACTIVE`/`PROVISIONED`. | `compliance.test.ts:93` |
| `account-unavailable` | `convex/pool/helpers.ts:101` | Compliance-ready, but the Telnyx account is not usable. | `convex/test/pool-members-view.test.ts:16`; `packages/blaster-cli/test/pool-accounts.test.ts:29` |
| `state-mismatch` | `convex/sequence/actions.ts:115` (pool-picked sender), `:180` (pinned `fromNumber`) | `checkStateMatch` (`compliance.ts:100-110`) compared the sender's state with the recipient's and they differ. Generic — no state is special-cased. | `packages/core/test/state-match.test.ts`; `convex/test/state-routing.test.ts` |
| `missing-messaging-profile` (whole doc absent) | `convex/phoneNumbers/compliance.ts:21` | The number is not in the ledger at all. | — |
| `unsupported-jurisdiction` | declared `compliance.ts:29` | **Never produced.** No code path returns it. | — |

## 3. Pool and capacity reasons

`blockedReason` is typed at `convex/pool/helpers.ts:33`. The runner writes the
park reasons at `convex/sequence/actions.ts:129-159` (selection) and `:267-357`
(reservation and capacity).

| Reason | Raised at | Means | Retry | Test |
|---|---|---|---|---|
| `pool-empty` | `pool/helpers.ts:164`; written at `actions.ts:156` | The pool is missing, not `active`, or has no active members. | **Terminal** — `awaiting-human` | `convex/test/pool.test.ts:132` (a paused pool reserves nothing, which falls through to this) |
| `no-compliant-sender` | `pool/helpers.ts:179`, `pool/model.ts:220`; written at `actions.ts:138` and `:320` | Members exist but none passes readiness. | **Terminal** — `awaiting-human` both times | `convex/test/pool-members-view.test.ts:16` |
| `no-state-matching-sender` | `pool/helpers.ts:189`; written at `actions.ts:129` | Members exist and are compliant, but none is in the recipient's state. | **Terminal** — `awaiting-human` | `convex/test/state-routing.test.ts:33` |
| `pool-rate-limited` | `pool/helpers.ts:198`; written at `actions.ts:148` and `:329` | Spacing or daily cap would be exceeded. | **Retried** — `nextDueAt = soonestNextAvailableAt`, else `now + 60_000` (`actions.ts:329-330`) | `convex/test/pool.test.ts:98`, `:117` |
| `sender:unknown-account:<ref>` | `actions.ts:267`, reason from `convex/telnyxAccounts/model.ts:40` | The Telnyx account is not in the ledger. | **Terminal** — `awaiting-human` | `convex/test/telnyx-accounts.test.ts` |
| `sender:account-<status>:<ref>` (`burned`, `disabled`) | `actions.ts:267`, reason from `convex/telnyxAccounts/model.ts:41` | The account exists but is burned or disabled. | **Terminal** — `awaiting-human` | `convex/test/telnyx-accounts.test.ts` |
| `missing-telnyx-api-key:<ref>` | `actions.ts:281` | No API key for the chosen account. Recorded as `outcome: "failed"`, `retryable: false`, so it burns through the machine's retry ceiling. | **Retried** then terminal | — |
| `no-number` | `actions.ts:292` | The enrollment has no `to`. Recorded as `outcome: "skipped"`; the step is still owed. | Step stays owed | — |
| `send-capacity-exhausted` | `actions.ts:357` | `claimSendCapacity` refused. `nextDueAt = capacity.retryAfter ?? now + 60_000`. | **Retried** | — |

### What `claimSendCapacity` actually checks

`convex/rateLimit.ts`. **The runner passes only `fromNumber` and `campaignId`**
(`actions.ts:348`), so only two of these four can fire from the runner:

| Reason | Line | Scope | Reachable from the runner |
|---|---|---|---|
| `account-capacity-exhausted` | `rateLimit.ts:86` | account | yes, via `fromNumber` |
| `number-rate-limited` | `rateLimit.ts:93` | number | yes, via `fromNumber` |
| `campaign-rate-limited` | `rateLimit.ts:101` | campaign | yes, via `campaignId` |
| `brand-rate-limited` | `rateLimit.ts:110` | brand | **no.** `rateLimit.ts:105` only checks the brand when `options.brandId` is set, and nothing in the runner sets it. `goal.md:90` records this as deliberate. |

The runner collapses all four into the single `send-capacity-exhausted`
reason, so an operator reading the row cannot tell which bucket bit. That is a
known reporting gap, not a designed behaviour.

## 4. Send outcomes and Telnyx codes

`SendOutcome` is
`packages/core/src/telnyx/messaging/helpers/send-outcome.ts:19-22`.
Classification is `:57-73`, error classification `:83-86`. The runner maps the
outcome onto the row at `convex/sequence/actions.ts:420-455`.

| Input | Outcome | Reason | Retry | Test |
|---|---|---|---|---|
| `ok: true` | `sent` | — (records `attempt.messageId`) | — | — |
| 4xx, not a rate limit | `failed`, `retryable: false` | `attempt.detail ?? "rejected with status <n>"` | **Terminal** | `packages/core/test/send-outcome.test.ts:21` |
| status `429` (`RATE_LIMIT_STATUS`, `:40`) | `failed`, `retryable: true` | as above | **Retried** | `send-outcome.test.ts:6` |
| Telnyx code `40011` (`RATE_LIMIT_ERROR_CODES`, `:41`) | `failed`, `retryable: true`, whatever the status | as above | **Retried** | `send-outcome.test.ts:13` |
| 5xx | `ambiguous` | `attempt.detail ?? "no definitive outcome (status <n>)"` | **Terminal, never retried** — parks as `ambiguous` | `send-outcome.test.ts:30` |
| status `0` (no response read) | `ambiguous` | `no definitive outcome (status 0)` | **Terminal** | — |
| thrown non-`TelnyxError` (e.g. a read timeout) | `ambiguous` | `error.message`, sliced to 300 chars | **Terminal** | `sequence-machine.test.ts:165` |
| thrown `TelnyxError` | re-classified by status | `Telnyx <status>: <detail>` (`packages/core/src/telnyx/messaging/helpers/client.ts:26`) | per status | `convex/test/send-failure-handling.test.ts:36` |

`TelnyxError` carries `status` and `code`
(`client.ts:18-30`); `telnyxErrorCodeOf` is `:38-50`, and a throw with no status
is treated as `500` (`client.ts:62`).

## 5. Recipient-side skip reasons

`SkipReason` is declared at
`packages/core/src/pipeline/sequence/helpers/builder.ts:146-152` and raised by
`evaluateEligibility` in the order given.

| Reason | Raised at | Means | Test |
|---|---|---|---|
| `do-not-contact` | `builder.ts:175` | Prospect is marked do-not-contact. Outranks everything. | `packages/core/test/sequence.test.ts:119`; `sequence-machine.test.ts:263` |
| `already-replied` | `builder.ts:178` | `options.stopOnReply` and the recipient has replied. | `sequence.test.ts:129`; `packages/blaster-cli/test/sequence-drafts.test.ts:148` |
| `no-number` | `builder.ts:181` | Prospect has no phone number. | `sequence.test.ts:163` |
| `no-profile-for-country` | `builder.ts:194` | No profile registered for this country; the default profile was being used and the carrier would reject it. | `sequence.test.ts:143`, `:153` |
| `no-profile-for-country` | `builder.ts:202` | No messaging profile at all, so nothing can be sent. | `sequence.test.ts:180` |
| `daily-cap-reached` | `builder.ts:212` | Recipient has already had `cap` messages in the last day. | `sequence.test.ts:167` |
| `no-step-due` | declared `builder.ts:152` | **Never produced.** | — |
| `replied-before-send` | `convex/sequence/actions.ts:387-394` | The recipient replied between enrollment and this tick. Recorded as `outcome: "replied"`. | — |
| `unspecified` | `machine.ts:156` | The verdict carried no reason. | — |
| `unknown-outcome` | `convex/sequence/mutations.ts:340` | `recordStep` was called with `outcome: "ambiguous"` and no `skipReason`. | — |
| `cancelled: <reason>` / `cancelled` | `convex/sequence/mutations.ts:184` (`cancelEnrollment`), `:211` (`cancelSequence`) | A human cancelled it. | `convex/test/cancel-lifecycle.test.ts:21`, `:58` |

## 6. Read path: HTTP status codes

`BlasterApiError` and `classifyStatus` are in
`packages/core/src/blaster/api/types.ts:517-536`. The client that throws
is `packages/core/src/blaster/api/helpers/client.ts:192-256`, and it throws on
**any** non-2xx — `:210`, `:231`, `:252`. The message is always
`detail?.error ?? "The Blaster API answered <status>"`.

`apps/api/src/lib/convex/helpers/client.ts` is a different client: it never
throws. It returns `{status:"not-configured"}` or `{status:"failed", error}`, and
the routes translate that into the statuses below.

| Status | `kind` | Where the API raises it | Operator sees | Test |
|---|---|---|---|---|
| 0 (transport failure) | `unavailable` | `packages/core/.../client.ts:192-196` — `Could not reach the Blaster API at <url>` | CLI prints `blaster sequence <action>: <message>` and exits 1 | `packages/core/test/blaster-api-client.test.ts:57` |
| 400 | `malformed` | `apps/api/src/index.ts:281`, `:407`-`:491`, `:527`, `:637`-`:763`, `:872`-`:982`, `:1020`-`:1086`, `:1181`-`:1191`, `:1246`-`:1370`, `:1477`-`:1546`, `:1741` | the literal error, e.g. `from is required: Blaster will not guess a sending number` | `apps/api/test/prospects-routes.test.ts:132`, `:198`; `send-route.test.ts:223`-`:231` |
| 401 | `unauthorized` | `index.ts:1063` (`Bearer token required`), `:1395`-`:1398`, `:1729` (webhook signature) | `Token is not active` / `Bearer token is required` | `conversations-routes.test.ts:137`; `send-route.test.ts:122`; `telnyx-webhook.test.ts:217` |
| 403 | `unauthorized` | `index.ts:861`, `:876`, `:881`, `:911`, `:923`, `:938`; operator middleware `apps/api/src/lib/auth/operator/middleware.ts:121-127` | `Access denied: you do not own this sequence draft` | `apps/api/test/sequence-drafts-route.test.ts:198`-`:226` |
| 404 | `not-found` | `index.ts:320`/`:331` (unknown conversation), `:458`/`:510` (unknown sending number), `:657` (unknown pool), **`:721` (unknown sequence)**, `:806`, `:834`, `:909` | `Unknown sequence` | `sequence-detail-route.test.ts:95`; `prospects-routes.test.ts:182` |
| 409 | `malformed` | `index.ts:512`-`:519`, `:1203`-`:1210` | `<number> has no messaging profile in Twenty` | `send-route.test.ts:169`, `:175` |
| 500 | `server` | `index.ts:503`, `:1143`, `:1158`, `:1185`, `:1216`-`:1221`, `:1327`-`:1392`, `:1444`-`:1587`, `:1781`, `:1826` | `TELNYX_API_KEY is not configured`, `No messaging profile is configured`, `could not store the message` | `telnyx-webhook.test.ts:243` |
| 502 | `server` | `fail()` at `index.ts:130` rewrites any `TelnyxError` with `status >= 500` to 502, plus every Convex/Twenty read failure at `:297`-`:1561` | `Failed to read the sequence`, `Failed to read messages`, … | `sequence-detail-route.test.ts` (502 path); `send-route.test.ts:218`; `conversations-routes.test.ts:184`, `:213` |
| 503 | `unavailable` | `index.ts:294`, `:325`, `:500`, and every Convex-backed route (`:624`-`:1829`) — `CONVEX_URL is not configured` or `Twenty is not configured`; `:1734`, `:1755` for webhook verification | `CONVEX_URL is not configured` | `conversations-routes.test.ts:151`, `:176`; `telnyx-webhook.test.ts:236`, `:251` |
| 202 | — | `index.ts:1760` — `{ok:true, stored:false, reason:"destination is not a number we own"}` | Deliberate non-error: ack so Telnyx stops retrying | `telnyx-webhook.test.ts:225` |

### How the CLI turns those into an exit code

`blaster sequence` exits `1` on every failure and `0` otherwise
(`packages/blaster-cli/src/cli/index.ts:1225`). The read-path messages are:

| Message | Raised at |
|---|---|
| `blaster sequence show: could not read the steps of "<name>": <detail>` | `sequence.ts:621` (throw path: 404/502/503/0) |
| `blaster sequence show: could not read the steps of "<name>".` | `sequence.ts:629` (null or zero steps) |
| `blaster sequence run: could not read the steps of "<name>": <detail>` | `sequence.ts:668` |
| `blaster sequence run: could not read the steps of "<name>".` | `sequence.ts:673` |
| `No sequence named "<name>".` | `sequence.ts:609`, `:659`, `:713` |
| `blaster sequence: no signed-in API. Run "blaster login" first, or pass --api-url.` | `sequence.ts:251` |
| `blaster sequence <action>: <message>` — any other `BlasterApiError` | `sequence.ts:874` |

Covered by `packages/blaster-cli/test/sequence-read-failures.test.ts`, which
drives `showDraft` and `runDraft` for 404, 502 and 503.

## 7. Twenty-side eligibility (batch send and prospect import)

`packages/core/src/twenty/agencyProspect/helpers/prospects.ts`. These are
per-prospect rejections at the import surface, not enrollment skips.

| Reason | Raised at | Test |
|---|---|---|
| `opted out` | `prospects.ts:315` (`outboundState === "OPTED_OUT"`) | — |
| `sending paused` | `prospects.ts:316` | — |
| `already replied` | `prospects.ts:317` | — |
| `already qualified` | `prospects.ts:318` | — |
| `already booked` | `prospects.ts:319` | — |
| `already completed` | `prospects.ts:320` | — |
| `no sendable phone number` | `prospects.ts:347` | — |
| `enrolled, but outboundState could not be mirrored to Twenty` | `convex/sequence/actions.ts:631` — enrollment still succeeds | — |

Enroll-time throws, surfaced per prospect at `actions.ts:604-613`:

| Message | Raised at | Test |
|---|---|---|
| `unknown sequence <id>` | `convex/sequence/enrollment.ts:32` | — |
| `sequence <id> is <status>, so nothing can be enrolled` | `enrollment.ts:34` | — |
| `<number> is suppressed, so nothing can be enrolled` | `enrollment.ts:55` | `convex/test/suppressions.test.ts` |
| `Twenty is not configured (TWENTY_BASE_URL, TWENTY_API_KEY)` | `actions.ts:564` | — |
| `invalid prospect filters: <problems>` | `actions.ts:570` | — |

---

## Gaps: reasons with no test

Rows in the tables above marked "—" have no test asserting the value. These are
the ones worth closing, roughly in order of how expensive they are to get wrong:

1. `send-capacity-exhausted` — the four `claimSendCapacity` reasons collapse
   into one row with no way to tell which bucket bit. Nothing tests the
   collapse, and nothing tests that `brand-rate-limited` is unreachable.
2. `sender:unknown-account:<ref>` and `sender:account-<status>:<ref>` as a
   `lastSkipReason`. `convex/test/telnyx-accounts.test.ts` covers the model, not
   the park.
3. `missing-telnyx-api-key:<ref>` — the one failure that burns a retry ceiling
   without ever taking a claim.
4. `no-number` and `no-step-due` — `no-number` is tested as a
   `SkipReason` (`sequence.test.ts:163`) but never as the runner's
   `actions.ts:292` skip.
5. `unspecified`, `unknown-outcome`, `reconciled-not-sent` outside the machine
   test, and the bare `sender-not-ready` with no suffix.
6. `pool-empty`, `pool-rate-limited`, `no-compliant-sender` as
   `lastSkipReason` values rather than as `blockedReason` values.
7. Every 400 in §6 except the two route families already tested. The table is
   long because the routes each raise their own literal; a single shared
   assertion over the route list would cover most of them.

The live test is the one place these get exercised against a real number rather
than a mock. It has not been run. When it runs, the cases worth forcing are
`quiet-hours` (send outside the window), `no-compliant-sender` (point a pool at
a number with no campaign), `send-capacity-exhausted` (burst one number past its
per-number cap) and the 404 read (`blaster sequence show` against a deleted
sequence id).