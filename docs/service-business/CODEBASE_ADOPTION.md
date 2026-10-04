# Codebase adoption: Blaster as a multi-tenant managed SMS service

Scope: what has to change in this repo to run several customer businesses (tenants)
from one Blaster deployment, each sending only through its own Telnyx account,
brand, campaign, numbers and contacts. This is a gap list read from the schema and
sender path as of `main` (073acb3). Nothing here is built yet.

Governing rules (from the Telnyx ISV doc and the 10DLC fee page, quoted in the
thread): a separate brand per customer under that customer's legal name and EIN;
each sending number belongs to one campaign; throughput is set per brand by
vetting score, so tenants are for isolation, never for capacity.

## What already exists and can be reused

| Capability | Where | Use for tenancy |
| --- | --- | --- |
| Per-account registry | `telnyxAccounts` (`convex/schema/phone.ts`), keys in env as `TELNYX_API_KEY__<REF>` | One entry per customer account |
| Number to account link | `phoneNumbers.accountRef` | A number belongs to one tenant account |
| Burn-aware pool selection | `convex/pool/helpers.ts` (`accountUsability`) | A burned tenant account pauses that tenant |
| Brand and campaign facts per number | `phoneNumbers.brandId/campaignId/...` | Per-tenant registration state |
| Send readiness gate | `convex/phoneNumbers/compliance.ts`, `packages/core/src/pipeline/sequence/compliance.ts` | Fail-closed per number |
| Brand limiter | `telnyxSendBrand` in `convex/rateLimit.ts:105-120`, `brandId` never passed | Per-tenant brand ceiling once wired |
| Operator ownership | `ownerMemberId` on sequences and drafts | Seed for tenant ownership |

## Gaps, in build order

1. **No tenant entity.** `telnyxAccounts` holds only ref/label/status. Add a
   `tenants` table (legal name, EIN last-4 only, brandId, status, contract and
   consent-warranty date) and a `tenantId` on `telnyxAccounts`, `pools`,
   `sequences`, `suppressions`, `conversations`. Everything below keys on it.
2. **Pools can mix accounts.** `pools` has no account or tenant field, and
   `poolNumbers` joins any `phoneNumbers` row. Enforce in `addNumber`
   (`convex/pool/mutations.ts`): every member must share the pool's `tenantId`
   and `accountRef`, and a number may be an active member of only one pool per
   campaign. Reject cross-tenant adds, and add a test.
3. **Suppressions are global.** `suppressions` is keyed on `peer` only. Key on
   `(tenantId, peer)` so one customer's STOP does not silence another customer's
   own list, and make the global carrier-STOP rule an explicit decision. Check
   both at enroll and send (`convex/suppressions/`).
4. **No consent gate.** Nothing records opt-in. Add `consent` on the prospect
   record (source, timestamp, wording version, optional evidence ref) in the
   Twenty model and mirror it into enrollments. Add `consentRequired` to
   `checkSenderReadiness` so an enrollment without consent parks as
   `awaiting-human` with reason `no-consent`. Fail closed.
5. **Brand limiter is unwired.** Pass the tenant's `brandId` to
   `claimSendCapacity` (`convex/rateLimit.ts`) and model the T-Mobile daily cap
   from the stored vetting score (2,000 / 10,000 / 40,000 / 200,000 per day) so
   a tenant cannot be sent into a 429. `goal.md` already lists this as open.
6. **Rotation after a block.** Auto-burn is on the goal list. For tenants it must
   pause the tenant and open a review, never reroute to another tenant's account
   or number. Keep pool failover inside one tenant and one campaign.
7. **`allowUnregistered` override.** Disable for US long-code numbers on tenant
   accounts (policy flag on the tenant). Keep it only for explicit internal tests.
8. **Secrets.** Per-tenant API keys must not live in repo-level env. Use
   `TELNYX_API_KEY__<REF>` in the Convex env or a vault. Never store in tables.
9. **Surfaces.** Every item above needs CLI, MCP and HTTP parity or
   `check:surfaces` fails the build: `blaster tenants add|list|pause`, matching
   MCP tools, and `/api/tenants` routes mirrored on the Convex router, plus an
   OpenAPI refresh (`pnpm openapi`).
10. **Operator authorization.** Operator routes currently trust any operator
    token. Add tenant scoping so a customer-facing login sees only its own
    tenant (reuse the Twenty OAuth identity from `docs/identity.md`).
11. **Docs.** Write `docs/rate-limits-and-compliance.md` (referenced by
    `goal.md` but not on `main`; a branch of that name exists) and a tenant
    onboarding runbook (registration checklist, vetting, resubmission handling).

## Not in scope, deliberately

- A way to spread one sender's list across tenants. The pool-membership rule in
  item 2 exists to make that impossible.
- Any mechanism that registers brands under an entity other than the sending
  business.

## Test plan

Unit: cross-tenant pool add rejected; suppression scoped by tenant; missing
consent parks the enrollment; brand cap defers rather than 429s. Live: one
internal test tenant end to end per `docs/production-readiness.md` section 5
before any customer is onboarded.
