# Rate limits per number: what the carriers allow, and what Blaster applies

Status: research plus audit, 2026-10-04. Carrier figures are from Telnyx and Twilio documentation (sources at the end); verify against the live account before relying on them. The audit half is read from the code at `main`.

## 1. What each kind of sender is allowed

Every number in a pool has a type and a registration state. Those two facts fix its ceiling, so the ceiling can be computed instead of discovered by a 429.

| Sender | State | Ceiling | If exceeded |
| --- | --- | --- | --- |
| US 10DLC long code | not registered to an approved campaign | **0 - blocked** (Telnyx 40010) | message rejected, no throughput |
| US 10DLC long code | registered, brand vetting 75-100 | AT&T 4,500 msgs/min per campaign (~75/s); T-Mobile 200,000/day per brand | 40011 / 40016 |
| US 10DLC long code | registered, vetting 50-74 | AT&T 2,400/min; T-Mobile 40,000/day | |
| US 10DLC long code | registered, vetting 1-49 or unvetted | AT&T 240/min (4/s); T-Mobile 10,000/day (25-49) or 2,000/day (1-24, unvetted) | |
| US 10DLC | low-volume mixed campaign | AT&T 75/min (1.25/s) | |
| US 10DLC | sole proprietor | AT&T 15/min; T-Mobile 1,000/day; 1 number | |
| US toll-free | unverified | ~0.25 /s, heavy filtering (Telnyx 40329) | queue then 40014 |
| US toll-free | verification pending | ~1 /s | |
| US toll-free | verified | up to 20 /s | |
| Non-US long code | n/a | 0.1 /s per number (Telnyx default) | |

Three scoping rules that matter more than the numbers:
1. **AT&T limits are per campaign** (shared by every number on that campaign), in messages per minute.
2. **T-Mobile limits are per brand per day** and are shared by every campaign under the brand. Resets at midnight Pacific.
3. **Toll-free and long code are limited per number**, not per brand.

So inside one pool, a registered 10DLC number and an unverified toll-free number have limits that differ by a factor of ten or more, and the unregistered one has none because it cannot send.

## 2. What Blaster applies today

| Piece | Where | What it does |
| --- | --- | --- |
| Readiness gate | `packages/core/src/pipeline/sequence/compliance.ts`, used by `convex/pool/helpers.ts` | Blocks US long codes unless profile, active campaign, assignment, provisioning and a snapshot under 7 days old are all present. Binary: ready or not. |
| Account limiter | `convex/rateLimit.ts` `telnyxSend` | 5/s, burst 10, for the whole deployment |
| Per-number limiter | `telnyxSendPerNumber` | 1/s, burst 3, same for every number |
| Campaign limiter | `telnyxSendCampaign` | 10/s, burst 20, keyed on the sequence's `campaignId` |
| Brand limiter | `telnyxSendBrand` | 50/s, burst 100 |
| Pool spacing and daily cap | `convex/pool` | `minSpacingMs` (default 1s) and `dailyCapPerNumber` set by hand per pool |

## 3. Gaps (verified in code)

1. **Non-compliant US 10DLC is correctly blocked** by the gate, so "is non-compliant being rate limited" is answered: it is not rate limited, it is not sent at all. Good.
2. **Toll-free is treated as ready with no verification check.** `requires10DlcRegistration` returns false for toll-free, so `checkSenderReadiness` returns ready as soon as a messaging profile exists. An unverified toll-free number would send at the app's 1/s into a carrier ceiling of ~0.25/s and expire in the queue (40014). There is no field that stores toll-free verification status.
3. **The limits are constants, not per-number facts.** Every number gets 1/s whatever its registration, so a vetted number is throttled far below its ceiling and a low-vetting number is allowed more than AT&T gives it (4/s per campaign, shared).
4. **The brand limiter is never used.** `claimSendCapacity` accepts `brandId`, but the runner (`convex/sequence/actions.ts`) passes only `fromNumber` and `campaignId`. `telnyxSendBrand` therefore never runs.
5. **The "campaign" limiter keys on the wrong campaign.** `sequence.campaignId` is the Twenty campaign, not the 10DLC campaign on the number (`phoneNumbers.campaignId`). AT&T throughput belongs to the 10DLC campaign.
6. **T-Mobile's daily brand cap is not modelled.** The brand limiter is per-second; the real limit is a daily count per brand. Hitting it produces 40016 and there is no counter that predicts it.
7. **No vetting score is stored.** `phoneNumbers` has `brandStatus` and `campaignStatus` but nothing from which a throughput tier can be derived, so no per-number ceiling can be computed.
8. **A 429 is not retried** (existing comment in `rateLimit.ts`), so over-sending fails recipients instead of slowing down.

## 4. Making it deterministic

Store the facts per number, derive the limit from them, and flag nothing at send time.

1. Add to `phoneNumbers` (all optional, additive): `vettingScore`, `useCaseClass` (AT&T message class), `tollFreeVerification` (`unverified` | `pending` | `verified`), refreshed by the same compliance snapshot job.
2. A pure function `ceilingFor(number)` in core returns `{ perSecond, perMinuteCampaign, perDayBrand }` from the table in section 1. Unregistered returns zero, which is the gate's existing behaviour.
3. Replace the constant per-number bucket with a per-number rate taken from `ceilingFor`. Key the campaign limit on the 10DLC `campaignId` and the daily brand limit on `brandId` with a daily window.
4. The pool's `selectSender` already skips numbers that are not ready; make it also skip numbers whose daily or per-minute budget is spent, so the pool spreads load across numbers by their real capacity.
5. Make a provider 429 or 40011 retryable with backoff, with the limiter as the primary guard.
6. Surface the computed ceiling per number in the pool status view, so the operator sees "this number can send N/min and M/day" before launching a campaign.

## Sources
- Telnyx, 10DLC Rate Limits and Throughput: https://developers.telnyx.com/docs/messaging/10dlc/10dlc-rate-limits
- Telnyx, SMS messaging rate limits: https://developers.telnyx.com/docs/messaging/messages/rate-limiting
- Telnyx, Toll-free verification troubleshooting (throughput by status): https://developers.telnyx.com/docs/messaging/toll-free-verification/troubleshooting
- Telnyx messaging error codes (40010, 40011, 40014, 40016, 40329): https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes
- Twilio, MPS and Trust Scores for A2P 10DLC (cross-check): https://help.twilio.com/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US
