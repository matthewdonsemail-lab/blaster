import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Tables for owned Telnyx phone numbers. */
export const phoneTables = {
  /**
   * Telnyx accounts the deployment can send through. Holds the reference and
   * health only: the API key is a Convex env var named by `accountKeyEnvName`.
   */
  telnyxAccounts: defineTable({
    ref: v.string(),
    label: v.optional(v.string()),
    /** `burned` and `disabled` accounts are skipped by pool selection. */
    status: v.union(v.literal("active"), v.literal("burned"), v.literal("disabled")),
    note: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("ref", ["ref"]),

  /**
   * Owned Telnyx phone numbers: the purchase ledger Twenty cannot represent.
   *
   * Twenty `agencyPhones` is the operator-visible mirror; this table is the
   * record of what was actually ordered (order id, Telnyx number id, costs,
   * features, and the messaging profile the number was bought with or later
   * assigned to). Sync is keyed on `phoneNumber` in E.164 in both places, so
   * rows can be loaded into Convex from Twenty or pushed from Convex to
   * Twenty without losing the Telnyx metadata stored here.
   */
  phoneNumbers: defineTable({
    /** E.164, the sync key shared with Twenty `agencyPhones`. */
    phoneNumber: v.string(),
    /** Telnyx phone-number id, for `PATCH /phone_numbers/:id` assignment. */
    telnyxNumberId: v.optional(v.string()),
    /** Number-order id from `POST /number_orders`. */
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
    /** Messaging profile bound at purchase or via later assignment. */
    messagingProfileId: v.optional(v.string()),
    /** `pending` / `success` / `failure` from the number order. */
    status: v.optional(v.string()),
    purchasedAt: v.optional(v.number()),
    /** Provider-verified 10DLC facts; null/unknown must never mean ready. */
    brandId: v.optional(v.string()),
    brandStatus: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    campaignStatus: v.optional(v.string()),
    campaignUseCase: v.optional(v.string()),
    assignmentStatus: v.optional(v.string()),
    carrierProvisioningStatus: v.optional(v.string()),
    tollFreeVerification: v.optional(v.string()),
    /** Owning Telnyx account (`telnyxAccounts.ref`). Absent = the default account. */
    accountRef: v.optional(v.string()),
    /** USPS state the number is owned in. Overrides the area code when it does not say. */
    stateCode: v.optional(v.string()),
    /**
     * Operator opt-in to send from this number without carrier registration. Set per
     * number, with a reason and time, never by default. The number may be filtered
     * or blocked by carriers; that risk is the operator's to accept.
     */
    allowUnregistered: v.optional(v.object({ reason: v.string(), setAt: v.number() })),
    complianceCheckedAt: v.optional(v.number()),
    complianceSource: v.optional(v.string()),
  })
    .index("phoneNumber", ["phoneNumber"])
    .index("orderId", ["orderId"])
    .index("status", ["status"]),
};
