# Reply classification: what is positive, and what happens next

Status: proposal. The definitions in "The outline" are for the owner to confirm before any code follows them.

## Why this exists

Promotion of an `agencyProspect` to an `agencyLead` fires on `classifyMessageRules(...).state === "positive"`.
That is a regex list (`packages/core/src/conversation/classification/helpers/classify.ts`), capped at
confidence 0.8, and it misses "y", a thumbs-up, "okay", "I'm in", "let's talk", "sounds great".
`buildJevQuestions` already builds the TypeSafe Jev request (`message_state`, `requested_resolution`,
`tone`) but nothing calls it: there is no `@typesafe-ai/sdk` dependency and no `TYPESAFE_API_KEY` wiring.
The positive/not-positive definition is what is not written down, and Jev can only be as good as its criteria.

## Division of labour

| Layer | Decides | Never decides |
| --- | --- | --- |
| Rules (`classifyMessageRules`) | `opt_out`, always, at confidence 1 | anything probabilistic |
| Jev (`systemOne`, Choice) | `message_state`, `requested_resolution`, `tone`, with confidence | opt-out (rules win first) |
| Code gate (`CONFIDENCE_FLOOR` 0.6, `HIGH_STAKES_THRESHOLD` 0.85) | whether to act on the answer | the label |
| Human | everything below the floor, and high-stakes steps | |

Follows `docs/typesafe/patterns/confidence-routing.md`: the answer says what, confidence says whether to act.

## The outline (to confirm)

`message_state` options and the criteria text sent to Jev. This text is the definition; edit it here, not in code.

| State | Definition | Promotes to lead? | Next step |
| --- | --- | --- | --- |
| `positive` | Clear interest or agreement to move forward: yes, interested, sure, "tell me more", "call me", "sounds good", "I'm in", "let's talk", a thumbs-up in reply to an offer | Yes | Create lead, notify owner, stop sequence (already happens on any reply) |
| `question` | Asks about price, timing, process or who we are, without agreeing | No | Answer, then re-classify the next reply |
| `objection` | Pushback on price, need, timing or trust; includes "not interested" | No | Handle objection once, then close |
| `deferral` | Wants to talk later | No, but keep warm | Rebook; keep thread open |
| `greeting` | A hello with no content | No | Qualify |
| `opt_out` | Stop all contact | No | Suppress (rules, not Jev) |
| `irrelevant` | Wrong number, gibberish, unrelated | No | Escalate or close |
| `other` | None fit | No | Human |

Open definition questions for the owner:
1. Is a reply that agrees AND asks a question ("yes, how much?") positive or a question? Proposal: positive, since agreement is the stronger signal; the question is answered by the next step.
2. Is a bare "ok"/"k"/"👍" positive when the last outbound was not an offer? Proposal: only with confidence at or above the high-stakes line, otherwise a human confirms.
3. Does a deferral ("call me tomorrow") create a lead? Proposal: no; it creates a task on the prospect and stays a prospect.

## Confidence gating for promotion

Promotion is a write to Twenty, so it takes the stricter gate:

- `positive` and confidence >= 0.85: promote automatically.
- `positive` and 0.6 to 0.85: promote with `status: NEW` and a `note` flagging "needs human confirm"; notify.
- Below 0.6, or `other`: no promotion; escalate to a human.
- `opt_out` from the rules always suppresses, regardless of what Jev says.

The Jev call is evaluated against the whole thread as `state`, because "ok sounds good" after an objection means something different than after a greeting. That is what `buildJevQuestions` already does.

## Wiring plan

1. Add `@typesafe-ai/sdk` and `TYPESAFE_API_KEY` to the env manifest (`pnpm check:env`).
2. A Jev-backed `classifyOne` in `apps/api/src/lib` (I/O stays out of core), using `choice(...)` with the criteria above.
3. Webhook: rules first (opt-out), then Jev for the rest, then the gate above, then `promoteOnPositiveReply`. On a Jev error or timeout, fall back to `classifyMessageRules` and never fail the webhook.
4. Store the label, confidence and `reason` on the message row in Convex so the decision is auditable. This needs a schema addition (optional fields on `messages`).
5. Table-test: about 30 realistic replies against the rules baseline, and the same set as a recorded-fixture test for the Jev path, so a criteria edit shows what moved.

## Not decided here

- Per-call Jev cost and latency against the two-second Telnyx acknowledgement budget. The webhook may need to ack first and classify asynchronously (a Convex action scheduled from the inbound mutation).
- Which sequence step follows each state. The `requested_resolution` question exists for this; mapping it to sequence actions is a separate change.
