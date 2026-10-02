import { mutation, query } from "../_generated/server.js";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel.js";
import { DEFAULT_OPTIONS, type SequenceDraft, validateDraft } from "../../packages/core/src/pipeline/sequence/index.js";

export const draftStepValidator = v.object({
  text: v.string(),
  delayHours: v.number(),
  isStop: v.boolean(),
});

export const draftOptionsValidator = v.object({
  stopOnReply: v.optional(v.boolean()),
  respectDoNotContact: v.optional(v.boolean()),
  requireProfileForCountry: v.optional(v.boolean()),
  dailyCapPerRecipient: v.optional(v.number()),
  pinSender: v.optional(v.boolean()),
});

/**
 * List unfinished builder drafts.
 *
 * Scoped by ownerMemberId when provided to respect operator ownership.
 * Ordered by most recently updated first.
 */
export const listSequenceDrafts = query({
  args: {
    ownerMemberId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    if (args.ownerMemberId) {
      return ctx.db
        .query("sequenceDrafts")
        .withIndex("ownerMemberId", (q) => q.eq("ownerMemberId", args.ownerMemberId))
        .take(limit);
    }
    const rows = await ctx.db
      .query("sequenceDrafts")
      .withIndex("updatedAt")
      .order("desc")
      .take(limit);
    return rows;
  },
});

/** Get one builder draft by ID. */
export const getSequenceDraft = query({
  args: {
    draftId: v.id("sequenceDrafts"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get("sequenceDrafts", args.draftId);
  },
});

/**
 * Checkpoint a builder draft during interactive wizard progress.
 *
 * Creates or patches the row in sequenceDrafts. When draftId is omitted,
 * it looks for an existing draft with the same name and owner, or inserts a new one.
 */
export const saveSequenceDraft = mutation({
  args: {
    draftId: v.optional(v.id("sequenceDrafts")),
    name: v.string(),
    fromNumber: v.optional(v.string()),
    poolId: v.optional(v.id("pools")),
    campaignId: v.optional(v.string()),
    numberProfileId: v.optional(v.string()),
    currentStep: v.optional(v.string()),
    steps: v.optional(v.array(draftStepValidator)),
    options: v.optional(draftOptionsValidator),
    ownerMemberId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"sequenceDrafts">> => {
    const now = Date.now();

    if (args.draftId) {
      const existing = await ctx.db.get("sequenceDrafts", args.draftId);
      if (!existing) throw new Error(`unknown sequence draft ${args.draftId}`);
      await ctx.db.patch("sequenceDrafts", args.draftId, {
        name: args.name.trim(),
        fromNumber: args.fromNumber,
        poolId: args.poolId,
        campaignId: args.campaignId,
        numberProfileId: args.numberProfileId,
        currentStep: args.currentStep,
        ...(args.steps !== undefined ? { steps: args.steps } : {}),
        ...(args.options !== undefined ? { options: args.options } : {}),
        ...(args.ownerMemberId ? { ownerMemberId: args.ownerMemberId } : {}),
        updatedAt: now,
      });
      return args.draftId;
    }

    // Check by name and owner to avoid duplicating uncommitted drafts with the same name
    const trimmed = args.name.trim();
    const existing = await ctx.db
      .query("sequenceDrafts")
      .withIndex("name", (q) => q.eq("name", trimmed))
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => (args.ownerMemberId ? q.eq(q.field("ownerMemberId"), args.ownerMemberId) : q.eq(q.field("name"), trimmed)))
      .first();

    if (existing) {
      await ctx.db.patch("sequenceDrafts", existing._id, {
        name: trimmed,
        fromNumber: args.fromNumber,
        poolId: args.poolId,
        campaignId: args.campaignId,
        numberProfileId: args.numberProfileId,
        currentStep: args.currentStep,
        ...(args.steps !== undefined ? { steps: args.steps } : {}),
        ...(args.options !== undefined ? { options: args.options } : {}),
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("sequenceDrafts", {
      name: trimmed,
      fromNumber: args.fromNumber,
      poolId: args.poolId,
      campaignId: args.campaignId,
      numberProfileId: args.numberProfileId,
      currentStep: args.currentStep ?? "name",
      steps: args.steps ?? [],
      options: args.options,
      ownerMemberId: args.ownerMemberId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Discard an unfinished builder draft. */
export const discardSequenceDraft = mutation({
  args: {
    draftId: v.id("sequenceDrafts"),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get("sequenceDrafts", args.draftId);
    if (!draft) return false;
    await ctx.db.delete("sequenceDrafts", args.draftId);
    return true;
  },
});

/**
 * Commit an unfinished builder draft into a completed sequence.
 *
 * Validates the draft against domain rules, inserts it into sequences + sequenceSteps,
 * and deletes the builder draft row upon successful creation.
 */
export const commitSequenceDraft = mutation({
  args: {
    draftId: v.id("sequenceDrafts"),
  },
  handler: async (ctx, args): Promise<Id<"sequences">> => {
    const draft = await ctx.db.get("sequenceDrafts", args.draftId);
    if (!draft) throw new Error(`unknown sequence draft ${args.draftId}`);

    const completeDraft: SequenceDraft = {
      name: draft.name,
      fromNumber: draft.fromNumber ?? "",
      poolId: draft.poolId,
      numberProfileId: draft.numberProfileId,
      campaignId: draft.campaignId,
      options: {
        ...DEFAULT_OPTIONS,
        ...(draft.options ?? {}),
      },
      steps: draft.steps.map((s) => ({
        text: s.text,
        delayHours: s.delayHours,
        isStop: s.isStop,
      })),
    };

    const problems = validateDraft(completeDraft);
    if (problems.length > 0) {
      throw new Error(`cannot commit invalid draft: ${problems.map((p) => `${p.field} ${p.problem}`).join(" ")}`);
    }

    if (draft.poolId) {
      const pool = await ctx.db.get("pools", draft.poolId);
      if (!pool) throw new Error(`unknown pool ${draft.poolId}`);
    }

    const now = Date.now();
    const sequenceId = await ctx.db.insert("sequences", {
      name: completeDraft.name,
      status: "draft",
      fromNumber: completeDraft.fromNumber,
      poolId: draft.poolId,
      numberProfileId: draft.numberProfileId,
      campaignId: draft.campaignId,
      stepCount: completeDraft.steps.length,
      options: completeDraft.options,
      createdAt: now,
    });

    for (const [order, step] of completeDraft.steps.entries()) {
      await ctx.db.insert("sequenceSteps", { sequenceId, order, ...step });
    }

    // Builder draft fulfilled: remove the draft row
    await ctx.db.delete("sequenceDrafts", args.draftId);

    return sequenceId;
  },
});
