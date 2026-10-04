# Hiring-signal scope: finding businesses that need this service

Supersedes the auto-shop framing in `ICP_HIRING_SIGNALS.md`. Follows
`RESEARCH_RULES.md`: no personal contact data, corrections recorded, claims
carry provenance.

## The idea, stated precisely

The target is **not an industry**. A shop is not a prospect because it works on
cars. The target is a business that has just **opened a marketing or growth
role**. That posting is a budget-approved statement that the business needs more
customers than it is getting. The service's job is to turn the business's own
existing customers and leads into booked work through compliant SMS, so the
posting tells us who has the problem the offer solves.

Two separate questions follow, and they need separate evidence:

1. **Does this employer need more business?** Answered by the role and what it
   is told to achieve.
2. **Is SMS to their own contacts the right lever?** Answered by whether they
   have an opted-in contact base, appointment- or repeat-based revenue, and a
   follow-up gap.

A posting proves only (1). Every claim about (2) is a hypothesis to check on the
first call.

## Roles that carry the signal

| Tier | Titles | What the budget owner is trying to do |
| --- | --- | --- |
| A | Growth Marketing Manager, Demand Generation, Customer Acquisition, Lead Generation, Local Marketing Manager | Create more booked demand |
| B | Marketing Coordinator / Manager (single-location or small group), Digital Marketing Specialist, Patient or Client Acquisition | Fill the calendar |
| C | Retention, Lifecycle, CRM Marketing, Customer Loyalty, Reputation or Review Manager | Bring existing customers back |
| D (indirect) | BDC / appointment setter, Front-desk-to-sales, Outbound or Inside Sales Rep | The follow-up gap is already staffed with people |

Tier C and D are the closest fit, since they describe exactly the work the
service automates. Tier A and B qualify the business as growth-minded but need
the description to confirm the lever.

## Reading the description: qualifying signals

Each is a phrase to look for in the posting text. Score a posting by how many
distinct signals it contains, and record which.

| Signal | Example phrasing | Means |
| --- | --- | --- |
| Follow-up gap | "lead follow-up", "speed to lead", "missed calls" | Leads go cold |
| Appointment business | "appointments", "bookings", "no-shows", "patients", "clients" | SMS reminders have direct value |
| Repeat revenue | "recall", "reactivation", "win-back", "retention", "memberships" | A list of past customers exists |
| Reputation | "reviews", "referrals" | Review-request texts apply |
| Tooling | "CRM", "HubSpot", "GoHighLevel", "marketing automation" | They can integrate or already pay for tools |
| Texting named | "SMS", "text messaging" | Best case: already wants it |

## Disqualifiers, checked before any outreach

- No contact base of their own: consumer-brand national marketers, pure
  lead-gen buyers.
- Software or agency companies hiring for their own product marketing. They are
  competitors or partners, not tenants.
- Regulated segments needing a separate review (medical, legal, financial)
  until we have a compliance position.
- A business whose "list" is bought or scraped.

## What the data actually showed (corrections included)

Run on 2026-10-04 via treg `anyapi.linkedin.search.jobs.full` (about $0.027 per
call, 6 successful calls of 8, about $0.17). 150 rows, 44 unique company and
title pairs, descriptions scanned for the signals above.

- **The earlier trade-hiring set was the wrong population.** It used production
  roles (techs, detailers) as a proxy for demand. That is indirect, and the
  earlier claim that those businesses "have full bays" was an inference, not a
  finding. Marketing and growth roles are the direct signal.
- **LinkedIn's marketing-title search returns the wrong employers.** The 44
  results are dominated by software, biotech and national consumer brands
  (examples: Oblq, Ibotta, NexHealth, Navan, Omnicell). None is a local service
  business. NexHealth is software sold to clinics, so it is a possible partner,
  not a tenant. The best-scoring posting hit three signals out of the list.
- **Two queries returned nothing** (med spa and fitness studio). Boolean
  queries with several operators returned zero rows; plain keyword queries work.
- **Conclusion:** the signal logic holds, but LinkedIn plus a title keyword does
  not find small local employers. Their postings sit mainly on Indeed, Google
  Jobs, ZipRecruiter and the businesses' own careers pages.

## Pipeline to find the right businesses

1. **Source** postings from where local employers post: Google Jobs
   (`serpapi.x.google-jobs` or `dataforseo.x.serp-google-jobs-task-post`, both
   cheap in the catalog), Indeed, plus LinkedIn for multi-location groups.
   Queries combine a tier A to D title with a local-service term and a city or
   state.
2. **Fetch descriptions** for each posting. Score signals.
3. **Qualify the employer**: size (1 to 30 locations is the sweet spot),
   service type with appointments or repeat revenue, active site, reviews.
4. **Disqualify** per the list above.
5. **Find the buyer by role** (marketing lead, owner, operations). Contact data
   stays in `private/`.
6. **Scope the first conversation** to the specific need the posting revealed.

## Connection to the offer

| What the role is hired to do | What the service does for it |
| --- | --- |
| Fill the calendar / more bookings | Appointment reminders and no-show recovery to the business's own opted-in clients |
| Reactivate and retain | Recall and win-back sequences, inbox for replies |
| Fix follow-up | Quote and inquiry follow-up inside minutes |
| Build reputation | Review-request message after service |
| Replace a hire | Run the campaigns the new hire would otherwise run by hand |

A hire is expensive and slow. The pitch to a business with an open marketing
role is that a managed SMS programme starts earlier than a new hire can and
covers the repetitive channel work, so the hire spends time on strategy.

## Leads for the tenants' own campaigns

"Find new leads that are willing to go through the process" has two readings,
and the compliance line between them is strict.

- **Finding businesses that will become our customers** (this document). Fine.
  First contact is call, email, or in person, never text.
- **Finding people for those customers to text.** Each tenant texts only its own
  existing customers and inbound inquiries, who have opted in. The service does
  not buy or supply cold consumer lists. Consent evidence is kept per
  contact for four years (see `OPTION_3_TENANT_MODEL.md`).

## Reseller obligations that change onboarding

From `OPTION_3_TENANT_MODEL.md` and Telnyx's ISV guidance:

- Partner-campaign architecture, one brand and campaign per customer. Plan on
  a 3 to 17 business-day critical path per tenant, so no "texting this week"
  promise. The customer's legal name and EIN are required before anything is
  registered.
- Telnyx strongly recommends enhanced vetting for ISV use, about $101.50
  against the $41.50 standard in `COSTS_BY_STATE.md`. Re-price onboarding before
  quoting.
- Verify each customer is a legitimate business before registering a brand under
  their EIN. Keep opt-in records four years. Have a fast per-customer disable.
- Send-time check that each message matches the tenant's registered samples, to
  avoid spam rejections on a shared campaign.
- A rejected partner campaign is re-reviewed through the upstream provider, so
  name that dependency in the Telnyx application.

## Open items

- Choose and test a local job source (Google Jobs first). Cost is small and
  each query is billed per call.
- Define the employer qualification score and run it on a first batch of about
  50 employers before building anything.
- Decide which segments to defer for compliance reasons.
- Re-price onboarding with enhanced vetting.
- Telnyx reseller application, in writing, before any outreach.
