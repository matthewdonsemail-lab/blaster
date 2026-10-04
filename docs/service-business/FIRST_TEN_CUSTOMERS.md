# Plan: first 10+ service-business customers

Offer: Blaster as a managed SMS service for local service businesses. Each
customer is the sender of record, registered under its own legal name and EIN,
sending to its own opted-in contacts. We run campaigns, compliance and the inbox.

Fees to quote come from Telnyx's own fee page (support.telnyx.com article
5634625), not from this document. Re-check before every quote.

## Who to sell to

Segment by how much opted-in contact data they already hold. SMS only works for
customers with a list they are allowed to text.

| Segment | Natural list | Campaign types |
| --- | --- | --- |
| Auto body and collision | Past customers, insurance-claim customers | Estimate follow-up, ready-for-pickup, review request |
| Window tint | Past installs, quote requesters | Quote follow-up, seasonal promo, referral ask |
| Detailing | Recurring and one-off clients | Rebooking reminders, membership upsell |
| Mobile services (wash, glass, PDR) | Booking history | Appointment reminders, review request |
| Wraps, ceramic coating, car audio | Inquiry and install lists | Quote follow-up, care reminders |
| Other service trades (HVAC, plumbing, landscaping, pest) | Job history | Seasonal recalls, maintenance reminders |

Qualify out any business whose "list" is bought, scraped or from unrelated
inquiries. We will not onboard them. Say so on the first call.

## Funnel to 10 signed

Working back from 10 signed at an assumed 20% call-to-close and 30%
reply-to-call: roughly 170 contacted, 50 calls, 10 signed. These rates are
assumptions to replace with measured numbers after the first 30 contacts.

1. **Build the list (days 1-3).** 150-200 shops across the states in
   `COSTS_BY_STATE.md`, from Google Maps and Yelp categories plus trade
   directories. Capture business name, owner or manager, phone, site, and Google
   review count (a proxy for an active customer list).
2. **Contact them by non-SMS first.** Calls, email, in-person visits and their
   web forms. Do not cold-text them from a Blaster number: that is the behaviour
   this product exists to prevent. Our own marketing consent rules apply to us.
3. **Offer (days 3-5).** A fixed-price pilot: onboarding (brand, vetting,
   campaign) plus one month, with a 30-day review. Lead with a specific outcome,
   such as "text your last 12 months of customers a rebooking reminder", not
   "SMS platform".
4. **Proof first.** Run one pilot customer by hand, free or discounted, and
   record results (reply rate, rebookings, opt-outs). Use it in every pitch.
5. **Partners.** Approach agencies and software vendors that already serve these
   shops (shop-management software, local marketing agencies, review tools) for
   referral deals. Use `ISV_LANDSCAPE.md` for who sells to whom, and keep them
   separate from the customer pitch since some are competitors.
6. **Onboard in batches of three.** Registration review is the slow step, and
   resubmissions are normal. Budget two or three submissions per tenant.

## Deal terms to bring

- Customer owns the legal entity and the Telnyx account (or a sub-account under
  our ISV arrangement, once Telnyx confirms it in writing).
- Customer warrants consent for every contact and supplies evidence on request;
  we may suspend for violations.
- One-time onboarding covering registration fees, vetting, resubmissions and our
  time. Monthly platform fee per tenant. Optional per-segment markup. Telnyx
  fees pass through at cost, as Telnyx itself does.
- Month-to-month after the pilot.

## Prerequisites before the first call

1. Telnyx Reseller Partner application submitted and written confirmation of
   the tenant structure received.
2. A contract template reviewed by counsel (services agreement, data processing
   addendum, consent warranty, acceptable use).
3. Consent gate and cross-tenant pool block built (`CODEBASE_ADOPTION.md`
   items 2 and 4).
4. One internal tenant run end to end.

## Measures

Contacted, calls booked, pilots started, registrations approved on first
submission, messages delivered, opt-out rate, reply rate, signed, monthly
revenue per tenant.

## Risks

- Customers with thin or poor-quality lists churn fast. Screen hard.
- Registration rejections drive support cost. Standardise campaign language per
  vertical and reuse what gets approved.
- Medical, legal and financial verticals add rules. Defer them.
