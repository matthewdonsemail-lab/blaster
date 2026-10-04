import { internalMutation, mutation } from "../_generated/server.js";
import { v } from "convex/values";
import {
  MAX_STEP_ATTEMPTS,
  RETRY_BACKOFF_MS,
  validateDraft,
} from "../../packages/core/src/pipeline/sequence/index";
import { applySentOutcome, draftFromArgs } from "./model.js";
import { claimSendCapacity as claimCapacity, type SendCapacity } from "../rateLimit.js";
import { recordOutboundRow } from "../conversations/model.js";
import { enrollArgsValidator, enrollRecipient } from "./enrollment.js";
import {
  applyScheduleArgsValidator,
  claimStepArgsValidator,
  completeEnrollmentArgsValidator,
  sentMessageValidator,
  stepFieldsValidator,
  stepOutcomeValidator,
  type ApplyScheduleResult,
  type ClaimResult,
  type CompleteEnrollmentResult,
  type RecordedStepResult,
} from "./types.js";

/**
 * Sequence writes.
 *
 * Thin wrappers over model.ts, plus the step-outcome transition that applies
 * core's `advance` inside one transaction. See
 * docs/convex-naming-conventions.md (rule R5).
 */

export const createSequence = mutation({
  args: {
    name: v.string(),
    fromNumber: v.string(),
    poolId: v.optional(v.id("pools")),
    numberProfileId: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    options: v.optional(
      v.object({
        stopOnReply: v.boolean(),
        respectDoNotContact: v.boolean(),
        requireProfileForCountry: v.boolean(),
        dailyCapPerRecipient: v.number(),
        pinSender: v.optional(v.boolean()),
        quietHoursOverride: v.optional(v.string()),
      }),
    ),
    steps: v.array(stepFieldsValidator),
  },
  handler: async (ctx, args) => {
    const draft = draftFromArgs(args);
    const problems = validateDraft(draft);
    if (problems.length > 0) {
      throw new Error(`invalid sequence: ${problems.map((p) => `${p.field} ${p.problem}`).join(" ")}`);
    }

    if (args.poolId) {
      const pool = await ctx.db.get("pools", args.poolId);
      if (!pool) throw new Error(`unknown pool ${args.poolId}`);
    }

    const sequenceId = await ctx.db.insert("sequences", {
      name: draft.name,
      status: "draft",
      fromNumber: draft.fromNumber,
      poolId: args.poolId,
      numberProfileId: draft.numberProfileId,
      campaignId: draft.campaignId,
      stepCount: draft.steps.length,
      options: draft.options,
      createdAt: Date.now(),
    });

    for (const [order, step] of draft.steps.entries()) {
      await ctx.db.insert("sequenceSteps", { sequenceId, order, ...step });
    }
    return sequenceId;
  },
});

export const setSequenceStatus = mutation({
  args: {
    sequenceId: v.id("sequences"),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
    ),
  },
  handler: async (ctx, args) => {
    const sequence = await ctx.db.get("sequences", args.sequenceId);
    if (!sequence) throw new Error(`unknown sequence ${args.sequenceId}`);
    if (args.status === "active") {
      if (sequence.stepCount <= 0) {
        throw new Error("cannot activate a sequence with no steps");
      }
      if (sequence.poolId) {
        const pool = await ctx.db.get("pools", sequence.poolId);
        if (!pool || pool.status !== "active") {
          throw new Error("cannot activate sequence: assigned pool is not active");
        }
      }
    }
    await ctx.db.patch("sequences", args.sequenceId, { status: args.status });
    return args.sequenceId;
  },
});

/**
 * Assign a number pool to a sequence, or clear it.
 *
 * This writes `sequences`, so it belongs to the sequence domain even though the
 * thing it names lives in the pool domain. Passing no `poolId` clears the
 * assignment and restores the fixed `fromNumber`. The pool is checked here so a
 * sequence cannot be pointed at a pool that does not exist.
 */
export const setSequencePool = mutation({
  args: {
    sequenceId: v.id("sequences"),
    poolId: v.optional(v.id("pools")),
  },
  handler: async (ctx, args) => {
    const sequence = await ctx.db.get("sequences", args.sequenceId);
    if (!sequence) throw new Error(`unknown sequence ${args.sequenceId}`);
    if (args.poolId) {
      const pool = await ctx.db.get("pools", args.poolId);
      if (!pool) throw new Error(`unknown pool ${args.poolId}`);
    }
    await ctx.db.patch("sequences", args.sequenceId, { poolId: args.poolId });
    return args.sequenceId;
  },
});

/**
 * Enroll a prospect.
 *
 * The first step is due immediately, so enrolling does not itself schedule a
 * wait the operator did not ask for.
 */
export const enroll = mutation({
  args: enrollArgsValidator,
  handler: async (ctx, args) => enrollRecipient(ctx, args),
});

/**
 * Stop sending to one enrollment without ending it. The cursor is kept, so
 * `resumeEnrollment` continues at the step that was owed. Only an active
 * enrollment can be paused; anything else is reported, not overwritten.
 */
export const pauseEnrollment = mutation({
  args: { enrollmentId: v.id("sequenceEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);
    if (enrollment.status !== "active") return { status: enrollment.status };
    await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
      status: "paused",
      nextDueAt: undefined,
    });
    return { status: "paused" as const };
  },
});

/** Enrollment states that still own the prospect, so a cancel has something to stop. */
const CANCELLABLE = new Set(["active", "paused", "ambiguous", "awaiting-human"]);

/**
 * Stop one prospect for good. Unlike pause it cannot be resumed and it frees the
 * prospect to be enrolled again. A message already in flight still lands and is
 * recorded, but nothing further is sent.
 */
export const cancelEnrollment = mutation({
  args: { enrollmentId: v.id("sequenceEnrollments"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);
    if (!CANCELLABLE.has(enrollment.status)) return { status: enrollment.status, changed: false };
    await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
      status: "cancelled",
      nextDueAt: undefined,
      lastSkipReason: args.reason ? `cancelled: ${args.reason}` : "cancelled",
    });
    return { status: "cancelled" as const, changed: true };
  },
});

/**
 * Cancel a whole campaign: the sequence stops (the runner skips anything that is
 * not active) and every live enrollment is cancelled. Bounded per call; `more`
 * says whether to call again.
 */
export const cancelSequence = mutation({
  args: { sequenceId: v.id("sequences"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const sequence = await ctx.db.get("sequences", args.sequenceId);
    if (!sequence) throw new Error(`unknown sequence ${args.sequenceId}`);
    if (sequence.status !== "completed") await ctx.db.patch("sequences", args.sequenceId, { status: "completed" });
    const rows = await ctx.db
      .query("sequenceEnrollments")
      .withIndex("sequenceId", (q) => q.eq("sequenceId", args.sequenceId))
      .take(500);
    let cancelled = 0;
    for (const row of rows) {
      if (!CANCELLABLE.has(row.status)) continue;
      await ctx.db.patch("sequenceEnrollments", row._id, {
        status: "cancelled",
        nextDueAt: undefined,
        lastSkipReason: args.reason ? `cancelled: ${args.reason}` : "cancelled",
      });
      cancelled += 1;
    }
    return { sequenceId: args.sequenceId, status: "completed" as const, cancelled, more: rows.length === 500 };
  },
});

/** Put a paused enrollment back in the queue, due now. */
export const resumeEnrollment = mutation({
  args: { enrollmentId: v.id("sequenceEnrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);
    if (enrollment.status !== "paused") return { status: enrollment.status };
    await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
      status: "active",
      nextDueAt: Date.now(),
    });
    return { status: "active" as const };
  },
});

/**
 * Enroll one prospect from inside the backend.
 *
 * The same write as `enroll`, reached by the Twenty enroll seam (an action has
 * no `ctx.db`) and by any future internal caller. Internal because the seam must
 * not call a client-reachable function (rule R8), and because a batch enroll is
 * not something a client should trigger one row at a time.
 */
export const enrollInternal = internalMutation({
  args: enrollArgsValidator,
  handler: async (ctx, args) => enrollRecipient(ctx, args),
});

/**
 * Claim one step for sending, or lose the race.
 *
 * The key is `enrollmentId:cursor`, derived rather than generated, so two runs
 * of the same step collide by construction. The compound index plus the
 * read-then-insert inside this single transaction is the uniqueness
 * constraint: a second claim for the same step finds the existing row and
 * loses, and the loser must not send. Only the runner may claim, hence
 * internal.
 */
export const claimStep = internalMutation({
  args: claimStepArgsValidator,
  handler: async (ctx, args): Promise<ClaimResult> => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);
    if (enrollment.status !== "active") {
      // A reply (or opt-out, pause, or completion) landed between the due-query
      // and this claim. Claiming a step nobody owes would send into a stopped
      // sequence, so the claim loses without writing anything.
      return { claimed: false, reason: "no-longer-active" };
    }
    if (enrollment.cursor !== args.cursor) {
      // The enrollment moved on since this run was planned: the claim is for a
      // step nobody owes any more, so it loses without writing anything.
      return { claimed: false, reason: "cursor-moved" };
    }
    const existing = await ctx.db
      .query("sequenceSendClaims")
      .withIndex("enrollmentCursor", (q) =>
        q.eq("enrollmentId", args.enrollmentId).eq("cursor", args.cursor),
      )
      .unique();
    if (existing) return { claimed: false, reason: "already-claimed" };
    await ctx.db.insert("sequenceSendClaims", {
      enrollmentId: args.enrollmentId,
      cursor: args.cursor,
      claimedAt: Date.now(),
    });
    return { claimed: true, reason: null };
  },
});

/**
 * Record the outcome of one step: sent, skipped, replied, opted out,
 * ambiguous, or failed.
 *
 * Keeping the transition in one place is what makes the sequence resumable
 * after a failure without double-sending. The argument shapes come from the
 * domain's types, so this file states no field type of its own.
 */
export const recordStep = internalMutation({
  args: {
    enrollmentId: v.id("sequenceEnrollments"),
    outcome: stepOutcomeValidator,
    /** Why a send was skipped or failed, so an operator can see the reason. */
    skipReason: v.optional(v.string()),
    /** Telnyx error code of a rejected send. */
    errorCode: v.optional(v.string()),
    /** On a failed send, false means retrying cannot help. Absent keeps the old retry behaviour. */
    retryable: v.optional(v.boolean()),
    steps: v.array(stepFieldsValidator),
    /**
     * What the provider confirmed, present only when the send is known to have
     * gone out. Recorded alongside the cursor advance so the daily cap and the
     * thread never disagree about what was sent.
     */
    message: v.optional(sentMessageValidator),
  },
  handler: async (ctx, args): Promise<RecordedStepResult> => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);

    // Cancelled while a send was in flight: that message did go out, so it is still
    // recorded, but nothing may move the enrollment out of "cancelled".
    if (enrollment.status === "cancelled") {
      if (args.outcome === "sent" && args.message) {
        await recordOutboundRow(ctx, {
          ...args.message,
          sequenceId: enrollment.sequenceId,
          enrollmentId: enrollment._id,
          stepIndex: enrollment.cursor,
        });
      }
      return { status: "cancelled" as const };
    }

    if (args.outcome === "ambiguous") {
      // The send may or may not have gone out, so the enrollment is parked with
      // no due time: resuming it automatically is what produces the duplicate.
      // Only RECONCILE — a human decision about an unobservable fact — moves it.
      await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
        status: "ambiguous",
        nextDueAt: undefined,
        lastSkipReason: args.skipReason ?? "unknown-outcome",
      });
      return { status: "ambiguous" };
    }
    if (args.outcome === "failed") {
      // A rejection is a definite "nothing went out", so it is safe to retry —
      // but only up to the ceiling, and only for the attempts the machine
      // considers retryable. The counter is persisted because an in-memory one
      // would reset every tick and retry forever.
      const attempts = (enrollment.attempts ?? 0) + 1;
      // A permanent rejection (bad number, unregistered, filtered) fails the same
      // way every time, so retrying it only spends attempts and carrier calls.
      const exhausted = args.retryable === false || attempts >= MAX_STEP_ATTEMPTS;
      const lastBackoff = RETRY_BACKOFF_MS.length - 1;
      const backoff =
        RETRY_BACKOFF_MS[Math.min(attempts - 1, lastBackoff)] ??
        RETRY_BACKOFF_MS[lastBackoff] ??
        60 * 60_000;
      await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
        attempts,
        status: exhausted ? "failed" : "active",
        nextDueAt: exhausted ? undefined : Date.now() + backoff,
        lastSkipReason: args.skipReason ?? "send-failed",
        lastErrorCode: args.errorCode,
      });
      return { status: exhausted ? ("failed" as const) : ("active" as const), attempts };
    }
    if (args.outcome === "replied") {
      await ctx.db.patch("sequenceEnrollments", args.enrollmentId, { status: "replied", nextDueAt: undefined });
      return { status: "replied" };
    }
    if (args.outcome === "opted-out") {
      await ctx.db.patch("sequenceEnrollments", args.enrollmentId, { status: "opted-out", nextDueAt: undefined });
      return { status: "opted-out" };
    }
    if (args.outcome === "skipped") {
      // A skip does not advance the cursor: the step is still owed, and the
      // reason is recorded so a human can decide whether to fix or pause.
      await ctx.db.patch("sequenceEnrollments", args.enrollmentId, { lastSkipReason: args.skipReason ?? "unspecified" });
      return { status: "skipped" };
    }

    // The Convex doc carries `_id` where core's Enrollment expects `id`,
    // so map it explicitly rather than passing the doc straight through. The
    // shared helper keeps this and reconcile from disagreeing about "sent".
    return applySentOutcome(ctx, enrollment, args.steps, Date.now(), args.message);
  },
});

/**
 * Persist the schedule the machine chose when nothing was owed.
 *
 * A skip, a quiet-hours defer, and an unplaceable park all produce "no send"
 * but differ in what happens next, and those differences are the machine's to
 * make. This records its answer verbatim; it does not decide a due time of its
 * own, because a second scheduling policy here is how a defer silently becomes
 * a drop.
 */
export const applySchedule = internalMutation({
  args: applyScheduleArgsValidator,
  handler: async (ctx, args): Promise<ApplyScheduleResult> => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);
    await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
      status: args.status,
      // Cleared rather than left in the past when the machine parked it: a row
      // with a due time in the past is a row `dueEnrollments` keeps returning.
      nextDueAt: args.status === "active" ? args.nextDueAt : undefined,
      ...(args.lastSkipReason ? { lastSkipReason: args.lastSkipReason } : {}),
      ...(args.attempts === undefined ? {} : { attempts: args.attempts }),
    });
    return { status: args.status };
  },
});

/**
 * Close an enrollment whose cursor reached the stop step or the end.
 *
 * Separate from `recordStep` because no send happened: claiming completion as a
 * send outcome would put a message row and a cursor advance in the record for
 * a message that was never sent.
 */
export const completeEnrollment = internalMutation({
  args: completeEnrollmentArgsValidator,
  handler: async (ctx, args): Promise<CompleteEnrollmentResult> => {
    const enrollment = await ctx.db.get("sequenceEnrollments", args.enrollmentId);
    if (!enrollment) throw new Error(`unknown enrollment ${args.enrollmentId}`);
    // Already finished by something else: report what it actually is rather
    // than overwriting it. A reply that landed first must stay "replied".
    if (enrollment.status !== "active") return { status: enrollment.status };
    await ctx.db.patch("sequenceEnrollments", args.enrollmentId, {
      status: "completed",
      nextDueAt: undefined,
      lastSkipReason: undefined,
    });
    return { status: "completed" };
  },
});

/**
 * Ask for permission to send one message, consuming provider capacity if granted.
 *
 * Exists as its own internal mutation because the rate limiter reads and writes
 * the database and `runEnrollmentStep` is an action, which has no `ctx.db`. The
 * claim therefore has to be its own transaction, reached by `ctx.runMutation`.
 *
 * Splitting it this way also keeps the check and the consumption together: if
 * either limit refuses, nothing is consumed, so a refusal means "not yet" rather
 * than "attempted". See convex/rateLimit.ts for the limits and why they are set
 * where they are.
 */
export const claimSendCapacity = internalMutation({
  args: {
    fromNumber: v.string(),
    campaignId: v.optional(v.string()),
    brandId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SendCapacity> => {
    return await claimCapacity(ctx, {
      fromNumber: args.fromNumber,
      campaignId: args.campaignId,
      brandId: args.brandId,
    });
  },
});

/**
 * Update an existing sequence: its name, options, and steps.
 */
export const updateSequence = mutation({
  args: {
    sequenceId: v.id("sequences"),
    name: v.optional(v.string()),
    fromNumber: v.optional(v.string()),
    poolId: v.optional(v.id("pools")),
    campaignId: v.optional(v.string()),
    numberProfileId: v.optional(v.string()),
    options: v.optional(
      v.object({
        stopOnReply: v.optional(v.boolean()),
        respectDoNotContact: v.optional(v.boolean()),
        requireProfileForCountry: v.optional(v.boolean()),
        dailyCapPerRecipient: v.optional(v.number()),
        pinSender: v.optional(v.boolean()),
        quietHoursOverride: v.optional(v.string()),
      }),
    ),
    steps: v.optional(
      v.array(
        v.object({
          text: v.string(),
          delayHours: v.number(),
          isStop: v.boolean(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const sequence = await ctx.db.get("sequences", args.sequenceId);
    if (!sequence) throw new Error(`unknown sequence ${args.sequenceId}`);

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.fromNumber !== undefined) patch.fromNumber = args.fromNumber;
    if (args.poolId !== undefined) patch.poolId = args.poolId;
    if (args.campaignId !== undefined) patch.campaignId = args.campaignId;
    if (args.numberProfileId !== undefined) patch.numberProfileId = args.numberProfileId;
    if (args.options !== undefined) {
      patch.options = { ...sequence.options, ...args.options };
    }

    if (args.steps !== undefined) {
      // Delete old steps
      // eslint-disable-next-line @convex-dev/no-collect-in-query
      const oldSteps = await ctx.db
        .query("sequenceSteps")
        .withIndex("sequenceId", (q) => q.eq("sequenceId", args.sequenceId))
        .collect();
      for (const step of oldSteps) {
        await ctx.db.delete("sequenceSteps", step._id);
      }
      // Insert new steps
      for (const [order, step] of args.steps.entries()) {
        await ctx.db.insert("sequenceSteps", { sequenceId: args.sequenceId, order, ...step });
      }
      patch.stepCount = args.steps.length;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("sequences", args.sequenceId, patch);
    }
    return args.sequenceId;
  },
});

/**
 * Delete a sequence and all its steps.
 */
export const deleteSequence = mutation({
  args: {
    sequenceId: v.id("sequences"),
  },
  handler: async (ctx, args) => {
    const sequence = await ctx.db.get("sequences", args.sequenceId);
    if (!sequence) throw new Error(`unknown sequence ${args.sequenceId}`);

    // eslint-disable-next-line @convex-dev/no-collect-in-query
    const steps = await ctx.db
      .query("sequenceSteps")
      .withIndex("sequenceId", (q) => q.eq("sequenceId", args.sequenceId))
      .collect();
    for (const step of steps) {
      await ctx.db.delete("sequenceSteps", step._id);
    }
    await ctx.db.delete("sequences", args.sequenceId);
    return true;
  },
});


