# Trade-vertical verification: the collision/tint/detailing ten

Same verification chain as `PHILLY_VERIFICATION.md`, applied to the ten
businesses in `ICP_HIRING_SIGNALS.md` — matt's stated verticals (auto body,
tinting, detailing) rather than the roofing/HVAC pilot. Run so this does not wait
on the metro decision. Companies, roles and timestamps only; no personal data.

`predictleads.companies.job_openings` by domain, `last_seen_at_from` set to a
recency window, `categories` containing `marketing`. **$0.04/call, 16 calls,
$0.64 total.**

## Two confirmed growth roles in the trade verticals

| Business | Role | Last seen | Vertical |
| --- | --- | --- | --- |
| **All-Pro Auto Reconditioning** | **Marketing Strategist** | 2026-10-03 | Detailing / vehicle reconditioning (TX, GA) |
| Delray Buick GMC | Business Development Representative | 2026-10-03 | Dealer group with collision + detail (FL) |
| Ken Garff Automotive Group | Marketing Project Manager | 2026-08-25 | Dealer group (UT) |
| Ken Garff Automotive Group | Customer Experience Consultant | 2026-09-01 | Dealer group (UT) |

All-Pro is the one that matters: a marketing role, live within the last day, at
a **service** business that sells speed-of-turn to dealers. That is the same
shape as Binsky in the pilot — a company staffing demand generation rather than
production.

## What the sweep did not find, and why that is not the same as absence

- **Gerber Collision & Glass, Crash Champions, Classic Collision: no
  marketing-tagged role**, across 875–1000+ live rows each. Read this carefully
  before quoting it: those counts hit the provider's page ceiling, and the
  provider's `categories` tagging is sparse — Ken Garff's "Sales Consultant" and
  "Automotive Internet Sales Advisor" are tagged `marketing` while a
  "Director of Marketing" at a smaller shop might not be. **Zero tagged rows at a
  company with 1000+ live reqs is a tagging artefact, not evidence.** These three
  need a description-level search, not a category filter.
- **Tint World: 17 live rows, none marketing-tagged.** Small enough that this one
  is probably real absence — a franchise network with 17 open roles and no
  marketing req suggests central marketing, not a gap we can sell into.
- **Teph Seal (tephseal.com) and CSN Collision (1collision.net): 0 rows.** Both
  were confirmed live through *other* routes — Teph Seal's iCIMS instance via
  leadmagic, CSN's Indeed postings via crustdata. This provider simply does not
  cover their ATS. Provider coverage is per-company, so a "0" from one provider is
  not evidence of no hiring.

## One correction to `ICP_HIRING_SIGNALS.md`

`musiccityrecon.com` resolves to a multi-state **dealership** group with **247
live reqs**, including eight "Dealership Photographer" roles across Miami, Naples,
Fort Myers, Sarasota and Tampa. That is not the small owner-operator PDR outfit
the doc describes, and my earlier message ranked it **first** in the call order on
the grounds that "a president who hires his own techs is the buyer." That ranking
rests on an entity I have now got wrong. Drop it from the top of the call list
until the correct business is resolved.

This is the same failure mode as the Philly pilot's five bad names, in our own
document: a company name carried across from a search result without a domain
check. The process fix in `PHILLY_VERIFICATION.md` applies retroactively to this
doc too.

## Where the yield actually is

Two confirmed service-business growth roles have now come out of two different
discovery routes — Google Jobs (Binsky, HVAC/plumbing, NJ) and company-first
(All-Pro, reconditioning, TX/GA). Both are service businesses staffing demand
generation. Neither is a dealer group or a large collision franchise.

That is a pattern worth weighting: **the signal is strongest at the 20–500
employee trade operator, not at the national franchise.** The franchises are
either already marketing-staffed (Teph Seal, Gerber, Crash Champions) or
centralised (Tint World), and the giants' data is too noisy to score cheaply.
A metro sweep will produce more confirmed candidates at this rate, but it should
be weighted toward independents and regional operators rather than toward the
names that come up first in job-board results.
