# ISV Landscape — Who Else Rotates Multiple Brands From One Tool

**Owner:** negotiator | **Status:** draft — researched 2026-10-04 via `parallel-web-search`, URLs and docs cited per row
**Scope:** vendors who register and operate **more than one 10DLC brand** (usually one per customer) inside a single platform. These are the companies whose product is, structurally, the thing Blaster is proposing to build.

---

## Read this first: what "ISV" means in this context

matt said "IVRs." Two readings were possible. The one that matters here is **ISV / CSP — Internet Service Provider / Campaign Service Provider**: a software platform that sends A2P 10DLC messages *on behalf of* other businesses, so each end customer's traffic rides its own brand and campaign under the platform's account.

This is not a naming preference. Carriers vet the sender the recipient sees, so a platform that sends for many customers must register a **separate brand per customer** under that customer's own legal name and EIN. Telnyx states this explicitly:

> "A campaign service provider registers a separate brand for each customer under its own Telnyx account, with the customer's legal name and EIN, because carriers vet the sender the recipient sees."
> — [What is 10DLC](https://telnyx.com/resources/what-is-10dlc)

Vonage uses the same vocabulary and adds a term Blaster should borrow: each one is a **"reseller brand."**

> "A 10DLC reseller is a legal entity that needs to create multiple 10DLC brands on behalf of their customers. Each of these 'reseller brands'…"
> — [10DLC guide to resellers and partners, Vonage](https://api.support.vonage.com/hc/en-us/articles/5952653619868-10DLC-Guide-to-resellers-and-partners)

**So: no phone-menu IVR vendors in this document.** If matt did mean interactive voice response, this is the wrong file and I'll rebuild it — say the word.

---

## Why every one of these companies exists

Because the alternative does not scale. Vonage's own guide is titled *10DLC — Guide to resellers and partners* and its table of contents is: register reseller brands and campaigns, become a 10DLC partner, import partner campaigns into Vonage. Plivo draws the same line in its registration docs: *"Direct customers are those who send messages for their own business… Resellers provide communication services to other businesses and use Plivo's messaging APIs on behalf of their customers."*

Twilio makes the same point structurally rather than in prose — its ISV onboarding doc opens by saying the organization of your accounts and campaigns **determines which onboarding steps apply**. The carrier's compliance model forces multi-brand architecture into any platform that serves business customers. Blaster is not inventing this shape; it is a shape every serious provider already has.

---

## The table

| Vendor | What they actually do | Why it's in this list |
|---|---|---|
| **Telnyx (partner campaign APIs)** | Runs 10DLC brands and campaigns on a customer's behalf via a dedicated partner-campaign API, not the standard registration path. Publishes a full ISV/reseller onboarding guide. | The reference implementation of the exact model. Blaster already buys transport here, so this is the cheapest path. |
| **Twilio** | ISV A2P 10DLC onboarding; account/campaign organization is part of the contract with compliance. | Proves the multi-brand ISV model is the industry default, not an edge case. |
| **Vonage** | Publishes reseller-specific 10DLC guidance, including importing *partner* campaigns into the Vonage account. | Has the most explicit published language on "reseller brand" — the term to steal. |
| **Sinch** | Publishes "Understanding 10DLC for Resellers," aimed squarely at the reseller case. | Second carrier-side confirmation that resellers are a planned, supported customer class. |
| **Plivo** | Separate 10DLC registration path for resellers vs. direct customers. | Confirms carrier-side separation: your resellers do not share your compliance posture. |
| **Textmunication** | White-label SMS/MMS marketing sold to resellers under the buyer's brand. | Direct competitor to Blaster's sales motion — one of the companies you would be bidding against. |
| **TextSpot** | Rebrandable texting for agencies and SaaS products; SMS under your own brand. | Same motion, smaller. Useful for reading how they pitch the margin. |
| **SmsTools** | White-label SMS platform with a published reseller program. | Another direct competitor in the reseller channel. |
| **SkySwitch** | White-label SMS for MSPs; publishes 10DLC compliance automation as a headline feature. | Their feature list is effectively a requirements doc for Blaster — see below. |
| **Infobip** | Partnered with White Label Communications to resell CPaaS/SaaS messaging into regional enterprises under partner brands. | Enterprise-scale analogue: the same model one layer up the market. |
| **Trumpia, Mobiniti, SlickText** | Explicit white-label / reseller programs where the partner sets its own resale rate. | From the earlier landscape pass. Prove buyers already pay for managed SMS. |
| **SystemLaunch** | Telnyx-backed agency running real-estate AI texting with number lookup. | Closest live analogue to Blaster as an *operator*, not a vendor. |

---

## The feature list we are competing against

SkySwitch published "7 White-Label SMS Platform Features to Consider." Two entries are the entire Blaster backlog, written by a competitor:

1. **10DLC compliance automation** — "streamlined brand and campaign registration with Authentication+ support."
2. **TCPA compliance tools** — "one-to-one consent management, flexible opt-out processing, and quiet hours enforcement."

That maps one-to-one onto the gaps `CODEBASE_ADOPTION.md` found: no tenant entity, global suppressions keyed on the phone number alone, no consent gate, limiter never wired. **We are not differentiating on features. We are differentiating on the fact that we exist.** That is worth saying plainly before the first sales call rather than after the first loss.

---

## What this changes about the plan

**1. There is no moat in the control plane.** Every major carrier vendor and a dozen white-label shops already ship multi-brand, multi-tenant, consent-gated messaging. If the pitch is "we built multi-brand rotation," a prospect will find six better-funded versions of it. The pitch has to be the **segment** (auto body / tint / detailing, with pre-written sequences and vertical-specific compliance) or the **price**, not the architecture.

**2. Transport choice is a procurement decision, not a differentiator.** Telnyx, Twilio, Vonage, Sinch and Plivo all support the ISV model. Blaster is on Telnyx because it is already integrated and the fee table is published and quotable. Switching costs are a rebuild of one adapter.

**3. The real moat is the registration pipeline, and that is operational.** Vetting ($41.50) takes time and can be rejected. Campaign review ($15) is per submission. A vendor that has done 40 registrations knows which sample messages get rejected and which websites pass — and that knowledge is not on any of these doc pages. Speed and hit-rate on registration is the sellable thing.

**4. The white-label vendors are competitors *and* potential buyers.** Textmunication, TextSpot, SmsTools, Trumpia, Mobiniti, SlickText and SkySwitch sell the same thing we are proposing. Approaching them as vendors gets a different conversation than approaching them as tenants, and conflating the two is the fastest way to lose both. Pick one per company and do not mix.

---

## The gaps in this document

Stated plainly so nobody quotes it as more than it is:

- **This is a URL list, not a contact list.** No named decision-makers, no emails, no published partner-program pricing. Nothing here was inferred — where a field was unknown it was left out rather than filled in.
- **No revenue, customer-count or funding figures** for any of these vendors. None were sourced, so none are claimed.
- **Twilio, Vonage, Sinch and Plivo appear as carrier-side references**, not as competitors. Their ISV programs are the route to becoming a reseller *of them* — a different expansion path from building on Telnyx, and one worth evaluating only after the Telnyx Reseller application comes back in writing.
- **Ten of the rows come from the earlier landscape pass** (`RESEARCH/SMS_RESELLER_LANDSCAPE.md`) rather than this run. Where those rows carry `telnyx_status: not established`, that is still true: we have no evidence any of them sit on a Telnyx contract, so do not tell a prospect what carrier is underneath.

---

## Sources

- [ISV & Reseller 10DLC Onboarding — Telnyx](https://developers.telnyx.com/docs/messaging/10dlc/isv-reseller-onboarding)
- [ISVs & 10DLC — Telnyx Help Center](https://support.telnyx.com/en/articles/5593977-isvs-10dlc)
- [What is 10DLC — Telnyx](https://telnyx.com/resources/what-is-10dlc) (the ISV brand-per-customer sentence and the throughput tier table)
- [ISV SMS Choice: 10DLC or Toll Free Messaging — Telnyx](https://telnyx.com/resources/10dlc-vs-toll-free-isvs)
- [Messaging llms.txt — Telnyx developer docs index](https://developers.telnyx.com/development/llms/messaging-llms-txt) (rate limits by vetting score, phone-number-to-campaign assignment)
- [ISV A2P 10DLC Onboarding Overview — Twilio](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv)
- [10DLC Guide to resellers and partners — Vonage](https://api.support.vonage.com/hc/en-us/articles/5952653619868-10DLC-Guide-to-resellers-and-partners)
- [Understanding 10DLC for Resellers — Sinch](https://support.sinch.com/hc/en-us/articles/56014343734035-Understanding-10DLC-for-Resellers)
- [What is 10DLC Messaging? — Sinch](https://sinch.com/blog/what-is-10dlc)
- [10DLC Registration Process for Plivo Customers](https://www.plivo.com/docs/messaging/a2p-10dlc/registration-process)
- [White Label SMS/MMS Marketing — Textmunication](https://www.textmunication.com/reseller-whitelabel)
- [White Label SMS — TextSpot](https://textspot.io/white-label-sms/)
- [White Label SMS Platform & Reseller Program — SmsTools](https://www.smstools.com/en/sms-reseller)
- [7 White-Label SMS Platform Features to Consider — SkySwitch](https://skyswitch.com/blog/7-features-to-look-for-in-a-white-label-sms-platform)
- [White Label SMS: Brand & Sell Without Dev Headaches — Telecom Reseller](https://telecomreseller.com/2025/10/09/white-label-sms-reseller-solution)
- [Infobip partners with White Label Communications — Businesswire](https://www.businesswire.com/news/home/20250211028693/en/Global-Communications-Platform-Infobip-Partners-with-White-Label-Communications-to-Provide-CPaaS-and-SaaS-Solutions-to-Regional-Enterprises/)
- [Infobip Partnership Program](https://partners.infobip.com/partner)

Research output: `.scratch/llc-fees-a.json`, `llc-fees-b.json`, `llc-fees-c.json`, `llc-fees-d.json`, `isv-landscape.json`, `isv-landscape2.json` (2026-10-04).
