# Research: executing Option 3 correctly

> Research note. Primary source is Telnyx's own ISV/reseller 10DLC onboarding
> documentation, fetched 2026-10-04. Every factual claim below carries its source
> inline. No personal contact data appears in this file or in any tracked file in
> this directory — see `RESEARCH_RULES.md`.

## What "Option 3" is

Earlier in this project we named three shapes for how Blaster could carry a
customer's messaging:

- **Option 1** — one Blaster-owned brand, high vetting score, maximum throughput.
  Cheapest per message, and every customer receives from the same sender ID.
- **Option 3** — one registered brand **per customer**, under the customer's own
  legal name and EIN, sharing one Blaster platform and one Telnyx account.
- The in-between shapes — shared campaigns, mixed brands — which the docs treat
  as variants with different trade-offs.

Option 1 and Option 3 were argued on throughput, and **Option 1 wins that
argument arithmetically**: Telnyx publishes a throughput table where one brand at
a 75–100 vetting score reaches 200,000 messages/day on T-Mobile, while ten
unvetted brands reach 20,000 combined, for the same $41.50 of standard vetting
(`ISV_LANDSCAPE.md`, `COSTS_BY_STATE.md`).

So Option 3 is not chosen for capacity. It is chosen because carriers vet the
*sender the recipient sees*, so a customer's recipients must see the customer's
brand. That is the entire reason Option 3 exists, and it is the only reason that
survives scrutiny.

## The finding: Option 3 is a documented architecture, not a workaround

Telnyx publishes a dedicated guide for this exact shape, and it is the strongest
single fact in the project:
<https://developers.telnyx.com/docs/messaging/10dlc/isv-reseller-onboarding>

Its own architecture statement, in Telnyx's words:

> A campaign service provider registers a separate brand for each customer under
> its own Telnyx account, with the customer's legal name and EIN, because carriers
> vet the sender the recipient sees.

Two consequences follow that we had wrong or missing before:

1. **This is the ISV/reseller path, and it is a different architecture from
   standard 10DLC.** The guide's opening warning: "If you're an ISV, reseller, or
   SaaS platform sending messages on behalf of your customers, you need a
   **partner campaign** architecture — not a standard 10DLC registration."
   Anything in this repo that assumes the ordinary registration flow is
   incomplete for Option 3.
2. **Telnyx names our shape as the recommended multi-tenant pattern.** Under
   "Managing customers at scale", Pattern 1 — "One brand + campaign per customer
   (recommended)" — "Best for: Agencies, resellers managing distinct businesses."
   Trade-off stated by Telnyx: "More registration overhead, but better
   isolation." That is our exact situation, and it is their recommended answer.

## The unit of work in Option 3: the tenant, not the message

Every customer is one tenant, and a tenant has a fixed, ordered lifecycle. From
the same guide:

| Step | What happens | Time, published | Notes |
| --- | --- | --- | --- |
| 1 | Register the customer's **brand** at TCR via the upstream CSP | minutes (API) | Requires customer legal name, **EIN/tax ID**, business address, website, authorized representative contact, use case |
| 2 | Submit brand for **vetting** | enhanced: 1–7 business days | Telnyx: "For ISV use cases, **enhanced vetting is strongly recommended**" |
| 3 | Create one **campaign** per customer | **5–10 business days** of manual TCR review | "Each campaign undergoes manual review by TCR" |
| 4 | Share the campaign to Telnyx | `PENDING` → `ACCEPTED` | `DECLINED` is possible |
| 5 | Assign 10DLC numbers to the accepted campaign | "typically within minutes" | "A number can only be assigned to **one campaign at a time**" |
| 6 | Check sharing status | — | `PENDING` / `ACCEPTED` / `DECLINED` |
| 7 | Send | — | standard send-message API |

Two published facts change our cost and our promises:

- **The critical path per tenant is 3–17 business days** (enhanced vetting 1–7
  days plus campaign review 5–10 days), before sharing and number assignment.
  An onboarding fee that implies same-week sending is a promise we cannot keep.
  Ten tenants can register in parallel, so *elapsed* time for ten is still
  ~3–17 days, but each tenant's review is on TCR's clock, not ours.
- **Registration is per customer and uses the customer's EIN.** This is a hard
  prerequisite we had not stated: a tenant cannot be onboarded without the
  customer's legal name and EIN. The onboarding checklist in
  `COSTS_BY_STATE.md` assumes we file entities; it must also state that *the
  customer* supplies their EIN, or onboarding stops at step 1.

## What the guide says a reseller must actually build

Telnyx states ISVs carry **additional** compliance responsibilities, "because
you're sending on behalf of customers. TCR and carriers hold you accountable for
your customers' messaging practices." Their checklist, verbatim:

- Customer vetting — verify customers' business legitimacy before registration
- Content monitoring — monitor message content for campaign use-case compliance
- Opt-in verification — ensure customers collect proper consent from end users
- Opt-out processing — STOP/HELP must work across **all** customer traffic
- Volume management — stay inside the vetting score's throughput
- Incident response — a process to disable one customer's messaging fast
- Record retention — keep opt-in records **at least 4 years** (CTIA)
- Sample message accuracy — registered samples must match production messages

That list is the real spec for Option 3, and it is longer than the code gap list
in `CODEBASE_ADOPTION.md`. Three items are not in that doc at all:

- **Customer vetting as a product feature.** Onboarding has to include verifying
  the business before we register a brand with their EIN on it. Registering a
  brand for a business we have not verified is the single largest reputational
  and carrier-risk action in this business.
- **4-year opt-in record retention.** A consent gate that stores a boolean is not
  enough; the record behind the boolean has to be retained and exportable for
  four years.
- **Per-tenant kill switch.** Incident response "to quickly disable a customer's
  messaging" is a first-class capability, not an ops procedure. It pairs with the
  auto-burn behavior in `CODEBASE_ADOPTION.md`: auto-burn must *pause a tenant*,
  and the pause must be expressible without touching other tenants.

## The two failure modes the docs are unusually specific about

Both are quoted from the same guide, and both are avoidable only by design.

**Content that drifts from the registered samples.** Telnyx's troubleshooting
section: messages failing with `40002 (spam)` on a shared campaign are caused by
"Message content doesn't match registered campaign samples, or throughput exceeds
campaign limits." So a tenant's campaign registration is effectively a
*contract on message shape*. Any tenant-facing template or AI-generated message
must be checked against that tenant's registered samples. This is a hard
constraint on the "rotate multiple brands of content" product idea: templates
cannot be freely rotated across tenants, because each tenant's samples were
registered separately.

**Approvals through the wrong channel.** For partner campaigns, "the nudge
mechanism is **only available for partner campaigns**" — a rejected campaign is
re-reviewed only when the upstream CSP sends a `CAMPAIGN_NUDGE`. Native campaigns
use a direct appeal API. So under Option 3 we do not own the appeal path; we
depend on our upstream CSP's nudge. That is a real dependency to name in the
reseller application rather than discover later.

Also published and worth not re-deriving: enhanced vetting is what the docs
recommend for ISV use, and vetting scores above 75 are what unlock throughput.
Our $41.50 standard-vetting line in `COSTS_BY_STATE.md` is therefore probably the
wrong default for a reseller, and the enhanced figure from Telnyx's fee page
applies instead. Re-price onboarding before quoting it.

## What we still do not know, and must ask in writing

The guide answers *how* Option 3 works. It does not answer whether *we* qualify
for it. These go into the Telnyx Reseller Partner application verbatim, and the
blocker does not move until they come back answered:

1. Are we classified as a **reseller/agency** (one brand + campaign per client,
   Telnyx as downstream CSP) or an **ISV** (white-label, partner campaign with
   downstream CSPs)? The guide treats these as different architectures and
   different compliance obligations.
2. Is Telnyx acceptable as **our upstream CSP**, so we register natively, or must
   we register at a third-party CSP and share campaigns in?
3. Which vetting class applies to us per tenant — standard or enhanced — and at
   what per-brand fee.
4. What is the per-tenant fee schedule Telnyx will actually invoice for a
   reseller, versus the published direct-registration fees in
   `COSTS_BY_STATE.md`.
5. Account requirements: the guide lists a **Level 2 verified** Telnyx account
   with messaging enabled. Where are we against that today?
6. Who is the **upstream CSP** for campaign sharing, and what is the target
   turnaround on `PENDING` → `ACCEPTED`?
7. Is there a contractual expectation on customer vetting standards, opt-in
   record retention, or content monitoring that we would be signing up to.

## Sequencing this against the code

`CODEBASE_ADOPTION.md` stays the build order; this note adds the requirements it
did not know about. Folded in order:

1. **Tenant entity** (already gap 1) gains `legalName`, `ein`, `address`,
   `website`, `brandVertical` — because step 1 of the Telnyx flow is exactly
   those fields.
2. **Registration lifecycle states** matching Telnyx's own vocabulary — brand
   submitted / vetting / campaign in review / shared pending / shared accepted /
   rejected — so the 3–17 business-day critical path is visible to the customer
   rather than a blank screen.
3. **Consent record retention** (new, from the CTIA 4-year line), which changes
   what the consent gate must store.
4. **Per-tenant kill switch** (new, from incident response), which is the correct
   home for auto-burn pause behavior.
5. **Template-to-sample conformance check** (new, from the `40002` failure mode):
   refuse to send a tenant's message that does not match that tenant's registered
   samples.
6. Only then the isolation work already listed — pools that mix accounts, global
   suppressions, the unwired brand limiter.

## Two things this research does *not* do

- It does not verify our account state. Level 2 verification, our current brand
  status, our vetting class: none of that was checked, and none of it can be
  checked from public docs.
- It does not change the commercial conclusion in `ISV_LANDSCAPE.md`: there is no
  moat in the control plane, and SkySwitch-class vendors already publish this
  whole feature list. Option 3 is table stakes for selling this segment, not a
  differentiator. The pitch stays the segment and the price.

## Sources

| Claim area | Source |
| --- | --- |
| ISV/reseller architecture, partner campaigns, 7-step flow, patterns, compliance checklist, troubleshooting, sharing statuses | <https://developers.telnyx.com/docs/messaging/10dlc/isv-reseller-onboarding> (retrieved 2026-10-04) |
| Vetting-score throughput tiers, 5 campaigns per brand, number-pool threshold, pass-through fees | <https://telnyx.com/resources/what-is-10dlc> (quoted in this doc set) |
| Brand, vetting, campaign and per-part fee lines | <https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges> (quoted in this doc set) |

All three are Telnyx-operated pages. Where this note says something Telnyx does
not say — pricing conclusions, sequencing, the commercial read — it is our
judgement, not a citation.
