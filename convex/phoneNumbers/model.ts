import { v } from "convex/values";
import { env } from "../_generated/server.js";
import type { MutationCtx } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";

/**
 * Phone-number storage helpers.
 *
 * The Telnyx base URL, the shared input validator, and the deployment-key
 * reader. Actions call the provider; mutations store what it returned.
 */

export const TELNYX_BASE = "https://api.telnyx.com/v2";

export const phoneInput = v.object({
  phoneNumber: v.string(),
  telnyxNumberId: v.optional(v.string()),
  orderId: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  locality: v.optional(v.string()),
  administrativeArea: v.optional(v.string()),
  rateCenter: v.optional(v.string()),
  numberType: v.optional(v.string()),
  features: v.optional(v.array(v.string())),
  reservable: v.optional(v.boolean()),
  quickship: v.optional(v.boolean()),
  upfrontCost: v.optional(v.string()),
  monthlyCost: v.optional(v.string()),
  currency: v.optional(v.string()),
  messagingProfileId: v.optional(v.string()),
  status: v.optional(v.string()),
  purchasedAt: v.optional(v.number()),
  brandId: v.optional(v.string()),
  brandStatus: v.optional(v.string()),
  campaignId: v.optional(v.string()),
  campaignStatus: v.optional(v.string()),
  campaignUseCase: v.optional(v.string()),
  assignmentStatus: v.optional(v.string()),
  carrierProvisioningStatus: v.optional(v.string()),
  tollFreeVerification: v.optional(v.string()),
  accountRef: v.optional(v.string()),
  stateCode: v.optional(v.string()),
  allowUnregistered: v.optional(v.object({ reason: v.string(), setAt: v.number() })),
  complianceCheckedAt: v.optional(v.number()),
  complianceSource: v.optional(v.string()),
});

export type PhoneInput = {
  phoneNumber: string;
  telnyxNumberId?: string;
  orderId?: string;
  countryCode?: string;
  locality?: string;
  administrativeArea?: string;
  rateCenter?: string;
  numberType?: string;
  features?: string[];
  reservable?: boolean;
  quickship?: boolean;
  upfrontCost?: string;
  monthlyCost?: string;
  currency?: string;
  messagingProfileId?: string;
  status?: string;
  purchasedAt?: number;
  brandId?: string;
  brandStatus?: string;
  campaignId?: string;
  campaignStatus?: string;
  campaignUseCase?: string;
  assignmentStatus?: string;
  carrierProvisioningStatus?: string;
  tollFreeVerification?: string;
  accountRef?: string;
  stateCode?: string;
  allowUnregistered?: { reason: string; setAt: number };
  complianceCheckedAt?: number;
  complianceSource?: string;
};

export function telnyxKey(): string {
  return env.TELNYX_API_KEY;
}

/** The ledger row for an E.164 number, or null when it was never recorded. */
export async function findPhoneNumber(
  ctx: MutationCtx,
  phoneNumber: string,
): Promise<Id<"phoneNumbers"> | null> {
  const existing = await ctx.db
    .query("phoneNumbers")
    .withIndex("phoneNumber", (q) => q.eq("phoneNumber", phoneNumber))
    .unique();
  return existing?._id ?? null;
}

/**
 * The ledger row for an E.164 number, created on first reference.
 *
 * A number can reach Convex through a pool assignment before the richer Telnyx
 * metadata has been synced from Twenty. The row is keyed on the E.164 number and
 * every other field is optional, so creating it here loses nothing: a later
 * `storePhoneNumber` patches the same row with the full record. Keeping this in
 * the phone domain is what lets the pool domain reference a number without
 * writing the phone table itself.
 */
export async function ensurePhoneNumber(
  ctx: MutationCtx,
  phoneNumber: string,
): Promise<Id<"phoneNumbers">> {
  const existing = await findPhoneNumber(ctx, phoneNumber);
  if (existing) return existing;
  return ctx.db.insert("phoneNumbers", { phoneNumber });
}
