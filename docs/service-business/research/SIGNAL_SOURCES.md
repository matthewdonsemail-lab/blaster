# Signal sources: where a hiring signal can actually be found

Follows `HIRING_SIGNAL_SCOPE.md` (matt-claude) and applies `RESEARCH_RULES.md`:
no personal contact data. Company names, job titles and public posting URLs only.

## The problem this solves

matt-claude's calibration run pulled 150 full descriptions for marketing and
growth postings, 44 unique, and found them all in software, biotech and national
consumer brands. Not one local service business. His conclusion — that
LinkedIn plus a title keyword does not find small local employers — is correct,
and it is a property of the *input*, not a scoring problem.

Every LinkedIn route takes a title or keyword and returns whatever LinkedIn has
indexed. Local shops post on their own careers page or on Indeed. So the fix is
to change the input from *keyword* to *company*, because a company is the thing
we already have, and a company's postings are wherever its ATS puts them.

## Route 1, recommended: company-first job search

`treg.companies.jobs.search` — $0.009/success, routed across three providers
whose observed reliability treg reports at 97% (4,049 calls), 100% (14,447) and
99% (1,593). Input is a company `name` or `domain`, both optional, plus a `limit`.
Supply both, because the cheapest provider needs the name and is dropped
otherwise.

Three live tests on companies already in `ICP_HIRING_SIGNALS.md`, run today:

| Company | Result | Served by |
| --- | --- | --- |
| Teph Seal Auto Appearance | **231 open jobs**, full rows: city/state, `posted_at`, `expired_at`, `is_open`, salary estimate, and the posting's own ATS URL | leadmagic, $0 |
| CSN Collision | **17+ open postings from Indeed**, incl. "Estimations & Customer Experience Specialist", "Collision Centre General Manager" | crustdata, $0.265 |
| Music City Recon | 0 rows on both providers tried | predictleads then leadmagic, $0.04 |

Three findings from that table:

1. **CSN Collision is the proof.** It is a collision group whose postings live on
   Indeed, and a keyword search barely surfaced it. A company-domain call
   returned 17 of them. Its Indeed URLs are `ca.indeed.com`, which means the
   provider's location field is unreliable — location has to be verified per
   posting before a row counts as evidence in one of our six states.
2. **Music City Recon returned zero, and that is data, not failure.** A small
   owner-operator PDR outfit simply may not be hiring. This is the honest shape
   of the signal: company-first tells us who *is* hiring, and absence is a real
   answer rather than an index gap.
3. **The providers are not interchangeable, and neither is cheap.** predictleads
   charges $0.04/call and returned nothing for CSN; crustdata charges $0.009
   *per result* and returned 17. A routed call on CSN cost $0.265, not $0.009.
   Pin the provider per job rather than letting it route: crustdata for
   discovery, predictleads ($0.04 flat) when you want location and dates.

Teph Seal's leadmagic rows also carry `application_url` pointing at the
company's own iCIMS instance. That is worth more than the posting: it is the
careers page we would read to confirm a req is live before any call, which is
the verification step `ICP_HIRING_SIGNALS.md` already demands.

## Route 2: Google Jobs, as the long tail, not the first test

Two providers, and they differ by 25x in price and in ergonomics:

- `serpapi.x.google-jobs` — $0.015/success, synchronous, `q` + `location`,
  returns `jobs_results` with `company_name`, `via`, `source_link` and a
  description snippet. This is the right Google Jobs endpoint for calibration:
  one call, 10 rows, enough text to score a posting without a second fetch.
- `dataforseo.x.serp-google-jobs-task-post` — $0.0006/call, but it is
  `task_post`: one task per POST, `location_code` required, and the result
  arrives via a retrieval round-trip. Cheaper per call and worse for a loop.

I did not run either, because route 1 answers the question route 2 was proposed
to answer, at similar cost, on the input we already hold. If route 1's coverage
proves thin on shops with no ATS, run route 2 against the same company list as a
second pass rather than as a keyword sweep.

## Recommendation

1. Run company-first across all ten companies in `ICP_HIRING_SIGNALS.md`,
   crustdata for discovery, ~$0.30 total. This tests coverage where our input is
   strongest.
2. Score the rows by `HIRING_SIGNAL_SCOPE.md`'s tiers. Note that CSN's
   "Estimations & Customer Experience Specialist" and "Collision Centre General
   Manager" both sit in the retention/CRM and BDC-adjacent tiers that doc calls
   the closest fit, and neither is a "marketing manager" title.
3. Only then decide whether Google Jobs earns a pass for the no-ATS tail.

**Do not spend on title-keyword search again.** Four separate runs in this
project have now established the same thing from different directions, and that
route cannot reach the segment.

## Provenance

| Call | Endpoint | Cost |
| --- | --- | --- |
| Teph Seal | `treg.companies.jobs.search` → leadmagic (predictleads miss first) | ~$0.04 |
| CSN Collision | `treg.companies.jobs.search` → crustdata | ~$0.265 |
| Music City Recon | `treg.companies.jobs.search` → predictleads, leadmagic | ~$0.04 |
| Catalog reads | `treg catalog search/get`, no charge | $0 |
| **Total** | | **~$0.35** |

Reliability percentages are treg's own observed figures from the catalog, quoted
as of today; they are not measurements I took. Unverified: whether the CSN rows
are current in any of our six states, since the provider's location field is
Canadian-domain and per-posting verification is still required.
