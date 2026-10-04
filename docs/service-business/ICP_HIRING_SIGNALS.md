# ICP: 10 businesses, hiring-signal evidence, and the offer

> Named individuals, emails and profile links are deliberately not in this file. They live in `docs/service-business/private/` (gitignored, local only). Do not commit personal contact data.

Fifth document in this set. `FIRST_TEN_CUSTOMERS.md` defines the segment and
the funnel. This one replaces its step 1 ("build the list from Google Maps")
with a sourced list of ten named companies, each with a live job posting as the
intent signal, a named decision-maker, and a verified work email.

Raw tool output: `.scratch/icp2/*.json` (job search) and
`.scratch/contacts/*.json` (people). Those paths are disposable; the findings
that matter are transcribed below.

## The finding that changes the pitch

**No business in this market is hiring for "SMS".** Across 36 state-filtered
job searches — collision center, auto body shop, window tinting, auto
detailing, car dealer, BDC, across PA, IL, GA, TX, FL and OH — the thin
LinkedIn index returned 355 rows / 198 unique companies, and not one posting
asks for an SMS, 10DLC, or TCPA skill. The only literal "SMS/TCPA" hit in the
whole sweep was StocksToTrade, a financial-education company hiring an
in-house compliance lead. Wrong segment, and a compliance role rather than a
buyer.

That kills the obvious version of this motion. Nobody will ever take our call
because they posted a req.

**The signal that does exist is production-side volume hiring.** Every company
on the list below is simultaneously staffing up detailers, body technicians,
PDR techs and tint installers across multiple states. That means one specific
thing: **their bays are full and the demand is outrunning the shop's ability to
answer it.** A shop that cannot get a customer in the door does not need more
production capacity, and it does not need an SMS vendor — but it does need
inbound appointment-setting, and a booked bay is the only thing that pays for
the tech they just hired.

So the offer is not "we send SMS". The offer is **"we fill the bays you just
staffed"**, and SMS to their past customers and quote-seekers is the mechanism.
Read against `COSTS_BY_STATE.md`, that reframes the pitch from a cheap tool to
a revenue-recovery engagement, which is why the $485 onboarding number holds.

**Honest limit:** this signal only works for multi-location groups and
franchises. A 3-bay independent shop posts no jobs and will never appear here.
Those are still the volume market in `FIRST_TEN_CUSTOMERS.md` — they need the
Google Maps / trade-directory path, not this one. Ten here, 160 there.

## The ten, with evidence

All postings were pulled live on 2026-10-04 from `anyapi.linkedin.search.jobs`
via treg ($0.0005/success, 36 state-filtered queries, ~$0.02 total).

| # | Business | Vertical | Live postings in our six states | Decision-maker role |
| --- | --- | --- | --- | --- |
| 1 | Teph Seal Auto Appearance | Auto appearance / detailing | **9** — detailer reqs in GA (Alpharetta, Atlanta), IL (Urbana), PA (Bala Cynwyd, Devon), TX (Plano, Dallas), FL (Cocoa, DeLand) | Area Director |
| 2 | Gerber Collision & Glass | Collision | 6 — body techs in GA (Richmond Hill, Alpharetta), PA (Pittsburgh, Lansdale), TX (Denton), FL (Venice) | Director – Client Performance |
| 3 | Crash Champions | Collision | 2 — auto body tech (Strongsville, OH), Operations Director (Singer Island, FL) | Director of Marketing |
| 4 | Classic Collision | Collision | 3 — body tech (Buford, GA), detailer (Kennesaw, GA), Performance Manager (Orlando, FL) | Director Customer Care |
| 5 | CSN Collision | Collision | 4 — all IL (Arlington Heights, Schaumburg): body tech, detailer, detailer/porter, collision repair tech | Director of Marketing |
| 6 | Tint World | Window tint / PPF / wrap | 3 — Columbus, OH: tint installer x2, tint-PPF-wrap apprentice | VP Operations |
| 7 | Music City Recon | Paintless dent repair / mobile | 3 — PDR techs in FL (DeLand, Naples) and GA (Lithia Springs) | President |
| 8 | All-Pro Auto Reconditioning | Detailing / reconditioning | 3 — detail technicians in TX (Houston) and GA (Lithia Springs x2) | Director of Brand |
| 9 | Ken Garff Automotive Group | Dealer group | 2 — sales consultants in TX (Humble, Baytown) | Director of Digital Marketing |
| 10 | Delray Buick GMC | Dealer (with collision + detail) | 3 — collision tech, detail positions, sales consultant, all Delray Beach, FL | Service Manager |

Every email above was resolved by `treg.people.email.find`, cheapest-provider
routing, $0.00483/success — **10 for 10, no inference, no guessing patterns.**
That is $0.05 for the entire contact layer.

Note CSN Collision's email domain is `1collision.net`, not `csncollision.com`.
Anyone pattern-guessing domains would have bounced this one.

### Coverage against the six states

PA: Gerber, Teph Seal. IL: CSN, Teph Seal. GA: Teph Seal, Gerber, Classic,
Music City Recon, All-Pro. TX: Teph Seal, Gerber, All-Pro, Ken Garff. FL:
Teph Seal, Gerber, Classic, Crash Champions, Music City Recon, Delray. OH:
Tint World, Crash Champions. All six states are represented.

## Ranked by who to call first

1. **Music City Recon.** Owner-operator, three states, PDR is
   mobile and appointment-driven, and his own job posts are per-city tech
   hires. A president who hires his own techs is the buyer. Small enough that a
   $485 onboarding fee is a rounding error against one extra bay.
2. **All-Pro Auto Reconditioning.** "Director of Brand" at a
   recond operation means marketing is already a line item and already staffed.
   Reconditioners sell to dealers on speed-of-turn, so speed of lead response
   is literally their product.
3. **Teph Seal.** Nine open detailer reqs across five states is
   the single loudest signal in the set. Caveat: they are a *supplier* to dealers
   as well as a retail chain, so the retail-side pitch and the B2B pitch are
   different conversations. Ask which one first.
4. **CSN Collision.** All-IL footprint, Director of Marketing
   title, and collision centers have the highest review-request/repeat-repair
   rate of any vertical. Cleanest fit for appointment-setting campaigns.
5. **Gerber.** "Client Performance" is an insurer/dealer-relations
   job, not marketing. Approach carefully: they are likely to ask about claim
   status messaging, which is a carrier-compliance minefield. Say you don't do
   claim messaging rather than improvising.
6. **Tint World.** Franchise network, so one conversation can
   open dozens of locations. Highest leverage per call of anyone on the list.
7. **Crash Champions.** Director of Marketing, but a 1,000+
   employee organization with its own marketing function and procurement.
   Longest cycle, highest budget. A pilot, not a close.
8. **Classic Collision.** "Director Customer Care" is status-notification
   territory, which is adjacent to our lane but a different product.
9. **Ken Garff.** Dealer-group digital marketing. Real budget, but
   dealers are the most competed-over segment in the list.
10. **Delray Buick GMC.** Service manager, single site, no LinkedIn
    profile found. The most traditional buyer here and the least likely to have
    considered this at all. Good practice run, not a flagship.

## How to make contact — and how not to

**Do not cold-text any of these.** They are the exact businesses our product
exists to protect from unwanted SMS, and several of them are carriers' own
fraud-screening targets. Every first touch is email or phone. Per
`FIRST_TEN_CUSTOMERS.md`, and per our own consent obligations, that is not
optional.

1. **Email first, from a named human, no tracking links.** Nine of the ten
   contacts are Directors, VPs, owners or presidents. A Director of Marketing
   deletes a vendor blast without reading it. Three sentences, one question,
   their city named from their own job post.
2. **Ask the question the signal implies.** "I saw you're hiring detailers in
   Lithia Springs and Dallas — are you turning away work, or waiting on bays?"
   That question is impossible to answer "not interested" to, because it is
   about their own hiring.
3. **Phone the main line for the shop-level accounts** (Music City Recon, Delray)
   and the direct number only where the enrichment returned one.
4. **Physical visit for the franchise and multi-site accounts.** Tint World and
   Teph Seal both have physical locations. Walking in converts at a rate email
   does not.
5. **Never mention a competitor by name**, and never claim we are the only
   multi-brand option — `ISV_LANDSCAPE.md` shows six better-funded vendors
   already do this.

## The offer, per business

Priced off `COSTS_BY_STATE.md`, not invented per deal:

| Line | Amount | Note |
|---|---|---|
| Onboarding | **$485** | Covers the ~$107 per-tenant 10DLC registration, vetting queue, and 2–3 campaign resubmission risk. Not optional and not negotiable — it is real cost plus margin. |
| Platform fee | **$250–$500/mo** | Tier on contact volume and number of sending numbers. |
| Campaign ops | included | We build and send; they approve every message. |
| Optional | status/notification messaging | Quoted separately. Requires the tenant isolation work in `CODEBASE_ADOPTION.md` first. |

What we explicitly do **not** sell them: sending without opt-in, purchased
lists, or carrier-prohibited claim-status messaging.

## What still has to happen before any of this is outreach

The blocker has not moved. **The Telnyx Reseller Partner application must come
back in writing, confirming that a separate brand per customer under our
account is permitted**, before a single one of these ten gets a pitch. Without
it, the $485 onboarding fee is a promise we cannot keep, and these are
multi-location operators who will check.

Second, `CODEBASE_ADOPTION.md` gates the product: no tenant entity exists,
suppressions are global, there is no consent gate. We can sell a pilot today;
we cannot yet run ten brands correctly.

Third, and it should not be skipped: these are all real companies with real
staff. The enrichment above tells us who to talk to. It does not tell us
anything about their business we could not have learned by asking them.

## Provenance

| Layer | Tool | Cost |
|---|---|---|
| Job search, 36 state-filtered queries | `anyapi.linkedin.search.jobs` via treg | ~$0.02 |
| Company domains | `parallel-cli search` | ~$0.01 |
| Decision-maker identification | `quickenrich.people.search` via treg | ~$0 (quickenrich key) |
| Work email, 10 people | `treg.people.email.find` | ~$0.05 |
| **Total** | | **~$0.15** |

Not verified, do not assume: whether any of these shops currently lacks
appointment-setting, whether the postings were still open at time of writing
(the index carries no posting-expiry data), and the size of each chain.
Verify each business by reading its actual careers page before the call.
