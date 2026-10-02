import { RateLimiter, SECOND } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api.js";
import type { MutationCtx } from "./_generated/server.js";

/**
 * Outbound send capacity.
 *
 * Telnyx is the only provider Blaster calls from Convex, and it is the only
 * external call here with a throughput ceiling that can be hit by our own
 * behaviour rather than by a bug. Two limits, because there are two separate
 * things to protect:
 *
 *   - `telnyxSend` bounds what the deployment sends in total. This is the
 *     account-level ceiling.
 *   - `telnyxSendPerNumber` bounds what one sending number sends. Telnyx meters
 *     10DLC throughput per campaign, so one busy number must not be able to
 *     spend the whole account's budget; without this, a single number's
 *     enrollment cohort starves every other number on the account.
 *
 * The values are deliberately conservative, and the reason is in this repo's own
 * error handling rather than in Telnyx's documentation: `classifySendResult`
 * treats any 4xx as a definite failure with `retryable: false`, so a provider
 * 429 does not back off, it parks that enrollment for a human. Over-sending
 * therefore does not degrade gracefully, it fails recipients, which is why the
 * cap has to be the thing that prevents the 429 rather than recovering from it.
 * These numbers are the tuning point: raise them once a 429 is classified
 * retryable, and revisit them against the account's real throughput.
 *
 * Token bucket over fixed window because a tick that drains a backlog should be
 * able to burst, and then settle back to the sustained rate, instead of either
 * stalling at a window boundary or sustaining the burst rate forever.
 *
 * Capacity above the rate is what lets an idle number catch up: a number that
 * sent nothing for a minute may spend its accumulated budget at once.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  telnyxSend: { kind: "token bucket", rate: 5, period: SECOND, capacity: 10 },
  telnyxSendPerNumber: { kind: "token bucket", rate: 1, period: SECOND, capacity: 3 },
  telnyxSendCampaign: { kind: "token bucket", rate: 10, period: SECOND, capacity: 20 },
  telnyxSendBrand: { kind: "token bucket", rate: 50, period: SECOND, capacity: 100 },
});

/**
 * The per-number bucket's refill period, in milliseconds.
 *
 * Exported so the number-pool domain paces at the bucket's rate rather than at
 * a rate that competes with it (convex/pool/utils.ts defaults `minSpacingMs` to
 * this). The bucket admits one send per period per number, so a pool spacing
 * shorter than this only earns a refusal from `claimSendCapacity`, and one
 * exactly equal can sit on the refill boundary. Keeping the two derived from one
 * value is what stops them drifting apart; the limiter stays the authority,
 * because the runner defers when this refuses.
 */
export const TELNYX_PER_NUMBER_PERIOD_MS = SECOND;

/** The outcome of asking for send capacity, as the runner needs to read it. */
export interface SendCapacity {
  ok: boolean;
  /** When capacity would next be available, or null when it is available now. */
  retryAfter: number | null;
  scope?: "account" | "number" | "campaign" | "brand";
  reason?: string;
}

export interface ClaimSendCapacityOptions {
  fromNumber: string;
  campaignId?: string;
  brandId?: string;
}

/**
 * Claim capacity for one send, or explain when to come back.
 *
 * Every applicable limit (account, number, campaign, brand) is checked before
 * any token is consumed. Checking first costs extra component calls per send
 * but guarantees atomic evaluation within one transaction: a failed claim
 * consumes nothing at all, which lets the caller treat a refusal as "not yet"
 * without leaking tokens or stranding rate capacity.
 */
export async function claimSendCapacity(
  ctx: MutationCtx,
  options: ClaimSendCapacityOptions,
): Promise<SendCapacity> {
  const account = await rateLimiter.check(ctx, "telnyxSend");
  if (!account.ok) {
    return { ok: false, retryAfter: account.retryAfter, scope: "account", reason: "account-capacity-exhausted" };
  }

  const perNumber = await rateLimiter.check(ctx, "telnyxSendPerNumber", {
    key: options.fromNumber,
  });
  if (!perNumber.ok) {
    return { ok: false, retryAfter: perNumber.retryAfter, scope: "number", reason: "number-rate-limited" };
  }

  if (options.campaignId) {
    const campaign = await rateLimiter.check(ctx, "telnyxSendCampaign", {
      key: options.campaignId,
    });
    if (!campaign.ok) {
      return { ok: false, retryAfter: campaign.retryAfter, scope: "campaign", reason: "campaign-rate-limited" };
    }
  }

  if (options.brandId) {
    const brand = await rateLimiter.check(ctx, "telnyxSendBrand", {
      key: options.brandId,
    });
    if (!brand.ok) {
      return { ok: false, retryAfter: brand.retryAfter, scope: "brand", reason: "brand-rate-limited" };
    }
  }

  await rateLimiter.limit(ctx, "telnyxSend");
  await rateLimiter.limit(ctx, "telnyxSendPerNumber", { key: options.fromNumber });
  if (options.campaignId) {
    await rateLimiter.limit(ctx, "telnyxSendCampaign", { key: options.campaignId });
  }
  if (options.brandId) {
    await rateLimiter.limit(ctx, "telnyxSendBrand", { key: options.brandId });
  }

  return { ok: true, retryAfter: null };
}

