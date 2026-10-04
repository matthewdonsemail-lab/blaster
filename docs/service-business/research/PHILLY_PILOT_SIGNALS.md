# Pilot: service businesses hiring customer-facing growth roles, Philadelphia area

Follows `HIRING_SIGNAL_SCOPE.md` and `RESEARCH_RULES.md`. Businesses, roles and
posting sources only: no named individuals, emails or profile links.

Method: treg `serpapi.x.google-jobs` ($0.015 per call), 10 queries on
2026-10-04, location "Philadelphia, Pennsylvania", each query pairing a
marketing or coordinator title with a service type. About $0.15 total. 2 of 10
queries returned nothing (auto repair/collision, chiropractic/PT). Results
include PA, South NJ and DE, so "area" here means the Philadelphia commuter
region.

This is a first read from titles and snippets. I have not read the full
descriptions, confirmed any posting is still open, or checked that these are
real, in-good-standing businesses. Treat each row as a candidate.

## Ten candidates

| # | Business | Type | Role posted | Where | Source | Why it fits the old-customer reactivation offer |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Veterans Roofing | Roofing | Lead Pipeline & Conversion Manager | Ventnor City, NJ | LinkedIn | Strongest: the role is literally lead conversion, and roofing quotes go cold |
| 2 | Grand View Roofing & Exteriors | Roofing | Marketing Coordinator/Assistant | Gloucester Twp, NJ | BeBee | Past quotes and completed jobs make a reactivation list |
| 3 | Honest Roofing | Roofing | Roofing Sales Pro, "warm leads" | Spring City, PA | JobLeads | Advertises warm leads, so a lead base exists |
| 4 | Binsky Home Service | HVAC | Retail HVAC Lead Generator | New Jersey | LinkedIn | Seasonal maintenance recall |
| 5 | Delaware Valley Paving | Paving/exterior | Marketing Coordinator | Audubon, PA | LinkedIn | Repeat and referral work, past estimates |
| 6 | Gfedaleroof | Roofing | Brand Marketing Lead: Local Growth & Loyalty | Wilmington, DE | Talents By Vaia | "Loyalty" is a retention signal. Company name needs checking |
| 7 | Edge Fitness | Gym | Membership Growth Manager | Deptford, NJ | BeBee | Lapsed-member win-back |
| 8 | Union Mill Oral Surgery & Dental Implant Center | Dental | Relations & Marketing Coordinator | Mt Laurel, NJ | Indeed | Recall and treatment follow-up |
| 9 | Altera Orthodontics | Dental | Community Marketing & Outreach Lead | Limerick, PA | Talents By Vaia | Consult follow-up, recall |
| 10 | Elders Choice | Med spa (per title) | Med Spa Marketing Coordinator | Willow Grove, PA | Digitalhire | Rebooking. Company type needs checking |

Also surfaced but not picked: Smile Doctors affiliates (dental support
organisation, several offices), Erie Home (field marketer, Exton PA), Orangetheory
and 24 Hour Fitness (franchise or chain), and a large set of national and
software employers.

## What this shows

- **Google Jobs finds the right population.** Unlike LinkedIn title search (see
  `HIRING_SIGNAL_SCOPE.md`), results are mostly small local service employers
  posting through BeBee, Indeed and LinkedIn.
- **Roofing and home services are the clearest fit.** Three of the strongest
  rows. Their revenue depends on quotes that go cold and jobs that bring
  referrals and repeat work.
- **Dental and med spa are included but flagged.** They have the best recall
  case, but patient messaging adds health-privacy duties. `HIRING_SIGNAL_SCOPE.md`
  defers regulated segments until there is a compliance position, so I put
  these last in the order of approach.
- **Two sources of noise:** results spill outside the area (the search is
  fuzzy on location), and some employers are chains or staffing agencies.

## Before any outreach

1. Read each full posting and confirm it is open and local.
2. Confirm the business exists and is in good standing, and the type in column 3.
3. Look for a recorded consent base: a CRM, a booking system, or online forms.
4. Contact by call, email or in person. Never text first.
5. Contact details go in `docs/service-business/private/` only.

## Next

- Run the same ten queries in the other target metros (Chicago, Atlanta,
  Houston/Dallas, Miami/Orlando, Columbus) and keep the same output shape.
- Fetch full descriptions for the ten above to score the signals in
  `HIRING_SIGNAL_SCOPE.md`.
- Use the company-first lookup from `SIGNAL_SOURCES.md` to see what else each
  of these ten is hiring for.
