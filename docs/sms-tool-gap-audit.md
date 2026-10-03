# SMS blasting and sequencing tool: what exists and what is missing

Audited by the analyser agent from `docs/rate-limits-and-compliance` (head 1d19deb), read-only, 2026-10-04. PR #4 (conversation/lead link) and PR #5 (opt-out keywords) were not in the checkout; where they change a finding it says so.

| Area | Exists | Missing |
| --- | --- | --- |
| Sequence builder | Prompt-driven CLI wizard (`packages/blaster-cli/src/cli/sequence.ts`), Convex drafts (`convex/sequence/drafts.ts`), CRUD and activation (`mutations.ts`) | No A/B variants (steps are linear `{text, delayHours, isStop}`). `updateSequence` rewrites steps with no validation and orphans live cursors. `deleteSequence` orphans enrollments and send claims. |
| Enrollment | One write path `enrollRecipient` with suppression gate; due queue on `(status, nextDueAt)`; reply stops all active rows for the peer | Same prospect can be enrolled twice. No pause or cancel. `ambiguous` rows have no reconcile exit. Pinned sender is never revalidated against pool membership. Non-E.164 `to` is never stopped by a reply. |
| Pool | `selectSender`, `consumeSender` with `minSpacingMs` and `dailyCapPerNumber`, pinned-first runner, soft removal | Sequential strategy only. No per-pool or per-campaign cap. Pinned sends bypass `consumeSender`, so pool daily caps do not apply to them. |
| Send path | Cron `runDueEnrollments` to `runEnrollmentStep` to Telnyx to `recordStep` to `recordOutboundRow` | Stored messages carry no `sequenceId` / `enrollmentId` / `stepIndex`. Claim can strand a step. `attempts` not reset after a good send. |
| Suppression / opt-out | Opt-out stored, enrollments stopped and peer suppressed in one transaction; checked at enroll and send | No START/UNSTOP resubscribe. Compliance snapshot goes stale after 7 days with no refresh. (PR #5 adds STOPALL/END/QUIT/CANCEL.) |
| Delivery status | DLR webhook to `applyOutboundStatus` with monotone rank | No handling of 40014 or 429; all 4xx are non-retryable `failed`. Telnyx `error_code` is not stored. Unknown states are dropped. |
| Replies / threads | Inbound webhook, pair-key threads, stop and notify | Notification carries no classification. `peerHasReplied` does a full collect per conversation per tick. (PR #4 adds prospect/lead links.) |
| Classification | Rules classifier, state machine, confidence floor 0.6 and high-stakes 0.85 | `buildJevQuestions` has no callers; no SDK dependency; no API key config. Rules cap at 0.8, so autonomy is capped below 0.85 until Jev lands. A bare "ok"/"yes" is positive at 0.8 with no review. |
| Reporting | Raw tables and raw-row reads | No per-step reply rates, no positive/negative aggregates, no per-sequence or per-number stats. Campaign-filtered inbox does a lookup per row. |
| Campaign creation | `sequences.campaignId` (Twenty id); `phoneNumbers.campaignId` (10DLC id) | Two namespaces with no mapping. Nothing creates a campaign in Twenty or on 10DLC. No rule that pool members share one 10DLC campaign. `updateSequence` can change sender, pool or campaign mid-flight. |
| Twenty sync | Enroll reads, `markProspectOutbound`, `upsertAgencyPhone` | Nothing writes conversations or messages to Twenty. (PR #4 adds lead creation from a reply.) |
| Rate limits | See `docs/rate-limits-and-compliance.md` | Confirmed there. Also: N Twenty campaigns on one 10DLC campaign each get their own 10/s against one shared AT&T budget; `claimSendCapacity` checks then consumes, so it is not atomic in the way its comment says; `goal.md` line 85 claims a brand daily cap that does not exist. |

## Build order

1. Merge PR #4 and PR #5.
2. Toll-free verification gap (silent queue-expiry failure).
3. Stamp `sequenceId`, `enrollmentId`, `stepIndex` on outbound messages (additive; unblocks attribution and reporting).
4. Re-enroll dedupe, cancel, and reconcile paths.
5. Persist Telnyx `error_code`, handle 40014, back off on 429 instead of parking.
6. Wire Jev (needs `TYPESAFE_API_KEY` and the three definitions in `docs/reply-classification.md`).
7. Reporting aggregates.
8. Campaign namespace mapping (Twenty id to 10DLC id).
