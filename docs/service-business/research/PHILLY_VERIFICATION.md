# Philly pilot: verification pass on the ten candidates

Verification of `PHILLY_PILOT_SIGNALS.md` (matt-claude), run the same day. No
personal contact data, per `RESEARCH_RULES.md`: companies, job titles, public
posting URLs and `first_seen` / `last_seen` timestamps only.

Method, in three steps:

1. `crustdata.companies.identify` — **free**, 100% observed over 246,699 calls —
   resolves a company name to its domain and confidence score. Note the input
   key is `names` (array), not `name`.
2. `treg.companies.jobs.search` by name — $0.009/result, routed to crustdata.
3. `predictleads.companies.job_openings` by domain — **$0.04/call flat**, up to
   1,000 records per credit, and the rows come *from the company's own careers
   site* with O*NET codes, categories and first/last-seen timestamps. This is the
   step that can prove a req is live.

Step 3 was run twice per domain: once unbounded, once with
`last_seen_at_from=2026-09-01`. **That filter is the whole verification.** An
unbounded call returns the company's entire posting history — Delaware Valley
Paving returns 61 rows going back to 2025-02 and Binsky returns 49 rows from
2020. Without a recency filter, row count is a vanity metric, not a signal.

## Result: 1 of 10 confirmed, 3 partially, 5 unverifiable or wrong

| # | Business | Domain resolved | Live reqs (last 30d) | The marketing/growth role matt-claude cited | Verdict |
| --- | --- | --- | --- | --- | --- |
| 4 | Binsky Home Service | `binskyhome.com` (1.0) | **9**, incl. **Retail HVAC Lead Generator**, last seen today | confirmed live | **Confirmed. Strongest in the set.** |
| 5 | Delaware Valley Paving | `delawarevalleypaving.com` (1.0) | 17 | not in their feed; growth reqs are all DFW/Austin TX | **Partial — and see the geography problem** |
| 2 | Grand View Roofing & Exteriors | `gvexteriors.com` (0.6) | 2 | **not live**; feed shows Sales Rep + CSR only | **Unconfirmed** |
| 1 | Veterans Roofing | `veteransroofingnj.com` (1.0) | **0** | not in their feed at all | **Stale or misattributed** |
| 3 | Honest Roofing | none in crustdata (LinkedIn profile only) | — | unverified | **Unverified** |
| 6 | Gfedaleroof | **no match** | — | — | **Drop it.** Not a resolvable business. |
| 7 | Edge Fitness | `edgeonfit.com`, but LinkedIn resolves to **Edge Fitness Qatar** | — | — | **Wrong company.** Name collision across countries. |
| 8 | Union Mill Oral Surgery | matched **Jay Platt, DDS** (`jplattdds.com`, 0.6) | — | — | **Wrong company.** Cincinnati practice. |
| 9 | Altera Orthodontics | record returned, **every field null** | — | — | **Unverified** |
| 10 | Elders Choice | matched **ELDERS CHOICE FI LLC** | — | — | **Wrong company.** Florida entity, not a Willow Grove med spa. |

Four of the five unresolved names resolved to a *different real company with a
similar name*, and one resolved to nothing. That is a name-collision rate of 40%
on a list built from job-board snippets, and it is the argument for resolving a
domain before a business enters a call list at all.

## Three findings that matter more than the table

**1. Binsky is the one clean example of the signal working.** Nine live reqs, a
**Retail HVAC Lead Generator** role last seen today, and a marketing function
that has existed as a function: `Director of Marketing- Home Services` (2025-11),
`Marketing Manager` and `Marketing Specialist`, `Residential Business Development
Manager`, plus a `Home Services Call Center Manager` and `Customer Experience
Manager`. That is a company with a staffed demand-generation problem, in HVAC and
plumbing, in New Jersey. It is the pitch in one data row: they are hiring people
to answer the phone.

**2. Delaware Valley Paving is a geography problem, not just a staleness
problem.** It resolves to a real company whose live growth reqs are all **DFW and
Austin, TX** markets — "Sales Director: DFW Market", "Account Manager: DFW
Market", "Business Development Representative" — and it separately operates
Florida Coastal Paving. Its own careers feed carries no Audubon PA marketing
role. If we treat it as a Philadelphia-area pilot target we may be chasing a
mis-attributed posting. It needs a human eye on the careers page before it goes
anywhere near a call list.

**3. My earlier claim in `SIGNAL_SOURCES.md` needs narrowing, and I am
correcting it rather than leaving it.** I said company-first beats keyword
search. It does — but the *name* route is not equivalent to the *domain* route.
Every row the name route returned came back with a `linkedin.com/jobs/view/...`
URL, i.e. crustdata-by-name degrades to LinkedIn coverage, which is the coverage
matt-claude already showed does not reach these shops. The Indeed-hosted CSN
Collision rows only appeared when I passed a **domain**. So:

- name → domain → company careers feed is the chain that reaches local shops;
- skipping the middle step silently puts you back on LinkedIn.

That makes the free `crustdata.companies.identify` step load-bearing rather than
optional, and it means his Google Jobs pilot and my company-first route are
complementary: Google Jobs found the businesses, company-first is what proves the
req is live.

## What this does to the pilot

- **One confirmed candidate** (Binsky) is enough to run the conversation on. It
  is service-based, in the area, hiring a lead-gen role today, with a marketing
  function already staffed.
- **Five of the ten need a human check** before they are real: Gfedaleroof,
  Edge Fitness, Union Mill, Altera, Elders Choice. All five failed a free domain
  resolution, so they cost nothing to clear.
- **Roofing/home services is confirmed as the right first vertical** on the one
  candidate we could verify, which is worth more than a 10-row list of unverified
  rows.
- **Scope discipline:** 4 of these 10 are in NJ or DE, outside the six states in
  `COSTS_BY_STATE.md`. That is fine if the pilot is scoped by metro area, which is
  what matt asked for. It is not fine if entity cost is quoted per state from that
  document while the customer sits in Camden or Gloucester.

## Recommended next three steps, in order

1. Re-run the remaining five metros through **Google Jobs** (his route, ~$0.15 per
   metro) rather than company-first, because company-first needs a company and we
   do not have the company list yet. His pilot is the correct route for discovery.
2. For every candidate, resolve the domain (**$0**) and pull their own careers
   feed (**$0.04**). Two calls per candidate clears the entire table above and is
   the difference between a lead and a guess.
3. Pull the **description**, not the title, for the confirmed growth roles only.
   Binsky's Retail HVAC Lead Generator req is the one posting in this pilot whose
   actual duties we have not read, and it is the one we would lead with.

## Provenance

| Step | Endpoint | Cost |
| --- | --- | --- |
| Domain resolution, 10 names | `crustdata.companies.identify` | free |
| Name-route job check, 10 names | `treg.companies.jobs.search` → crustdata | ~$0.32 |
| Careers-feed verification, 4 domains x2 | `predictleads.companies.job_openings` | $0.32 |
| **Total** | | **~$0.64** |

Unverified and do not assume: that any posting is still open beyond its
`last_seen_at` timestamp (which means "the provider saw it on its own careers
site", not "the employer will accept applications"); the standing of any business
in good order; and whether Delaware Valley Paving has a Pennsylvania marketing
function at all. `first_seen` dates on the unbounded calls are historical record,
not current openings.
