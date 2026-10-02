import { internalMutation, mutation, type MutationCtx } from "../_generated/server.js";
import { v } from "convex/values";
import { phoneInput, type PhoneInput } from "./model.js";

/**
 * Phone-number writes.
 *
 * Thin wrappers over model.ts. See docs/convex-naming-conventions.md (rule R5).
 */

/** Insert or refresh one ledger row, keyed on the E.164 number. */
export const storePhoneNumber = internalMutation({
  args: { phone: phoneInput },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("phoneNumbers")
      .withIndex("phoneNumber", (q) => q.eq("phoneNumber", args.phone.phoneNumber))
      .unique();
    if (existing) {
      await ctx.db.patch("phoneNumbers", existing._id, { ...args.phone });
      return existing._id;
    }
    return ctx.db.insert("phoneNumbers", { ...args.phone });
  },
});

/** Record a messaging-profile assignment made via `PATCH /phone_numbers/:id`. */
export const setMessagingBinding = mutation({
  args: { phoneNumber: v.string(), messagingProfileId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("phoneNumbers")
      .withIndex("phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .unique();
    if (!existing) throw new Error(`unknown phone number ${args.phoneNumber}`);
    await ctx.db.patch("phoneNumbers", existing._id, { messagingProfileId: args.messagingProfileId });
    return existing._id;
  },
});

/**
 * Load numbers from Twenty `agencyPhones` into Convex.
 * Accepts already-read Twenty rows so this mutation needs no Twenty key; the
 * API/CLI/MCP layer reads Twenty and passes the rows in.
 */
export const importTwentyPhones = mutation({
  args: { phones: v.array(phoneInput) },
  handler: async (ctx, args) => {
    let stored = 0;
    for (const phone of args.phones as PhoneInput[]) {
      if (!phone.phoneNumber) continue;
      const existing = await ctx.db
        .query("phoneNumbers")
        .withIndex("phoneNumber", (q) => q.eq("phoneNumber", phone.phoneNumber))
        .unique();
      if (existing) continue;
      await ctx.db.insert("phoneNumbers", { ...phone });
      stored += 1;
    }
    return { stored, skipped: args.phones.length - stored };
  },
});

export const complianceSnapshotArgsValidator = {
  phoneNumber: v.string(),
  brandId: v.optional(v.string()),
  brandStatus: v.optional(v.string()),
  campaignId: v.optional(v.string()),
  campaignStatus: v.optional(v.string()),
  campaignUseCase: v.optional(v.string()),
  assignmentStatus: v.optional(v.string()),
  carrierProvisioningStatus: v.optional(v.string()),
  complianceSource: v.optional(v.string()),
  complianceCheckedAt: v.optional(v.number()),
};

async function recordComplianceSnapshot(
  ctx: MutationCtx,
  args: {
    phoneNumber: string;
    brandId?: string;
    brandStatus?: string;
    campaignId?: string;
    campaignStatus?: string;
    campaignUseCase?: string;
    assignmentStatus?: string;
    carrierProvisioningStatus?: string;
    complianceSource?: string;
    complianceCheckedAt?: number;
  },
) {
  const existing = await ctx.db
    .query("phoneNumbers")
    .withIndex("phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
    .unique();
  const payload = {
    brandId: args.brandId,
    brandStatus: args.brandStatus,
    campaignId: args.campaignId,
    campaignStatus: args.campaignStatus,
    campaignUseCase: args.campaignUseCase,
    assignmentStatus: args.assignmentStatus,
    carrierProvisioningStatus: args.carrierProvisioningStatus,
    complianceSource: args.complianceSource ?? "manual-sync",
    complianceCheckedAt: args.complianceCheckedAt ?? Date.now(),
  };
  if (existing) {
    await ctx.db.patch("phoneNumbers", existing._id, payload);
    return existing._id;
  }
  return ctx.db.insert("phoneNumbers", {
    phoneNumber: args.phoneNumber,
    ...payload,
  });
}

/** Persist a verified 10DLC compliance snapshot for a number. */
export const updateComplianceSnapshot = mutation({
  args: complianceSnapshotArgsValidator,
  handler: async (ctx, args) => recordComplianceSnapshot(ctx, args),
});

/** Internal version for provider sync actions. */
export const updateComplianceSnapshotInternal = internalMutation({
  args: complianceSnapshotArgsValidator,
  handler: async (ctx, args) => recordComplianceSnapshot(ctx, args),
});

