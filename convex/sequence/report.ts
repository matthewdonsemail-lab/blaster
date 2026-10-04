import type { QueryCtx } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";

/** Row caps keep the read bounded; a report that hits one says so rather than under-count silently. */
export const REPORT_ENROLLMENT_LIMIT = 2000;
export const REPORT_MESSAGE_LIMIT = 5000;

export interface StepReportRow {
  stepIndex: number;
  sent: number;
  /** Enrollments that replied after this step was sent and before the next. */
  replied: number;
  /** replied / sent, or null when nothing was sent. */
  replyRate: number | null;
}

export interface SequenceReport {
  enrolled: number;
  byStatus: Record<string, number>;
  steps: StepReportRow[];
  /** True when a row cap was reached, so the figures are a lower bound. */
  truncated: boolean;
}

/**
 * Pure aggregation, kept apart from the reads so it can be tested without a
 * backend. A reply is attributed to the step whose send advanced the cursor
 * last: an enrollment that replied with cursor `c` replied to step `c - 1`. A
 * reply at cursor 0 came before any send and belongs to no step.
 */
export function buildSequenceReport(input: {
  enrollments: Array<{ status: string; cursor: number }>;
  sentStepIndexes: number[];
  truncated: boolean;
}): SequenceReport {
  const byStatus: Record<string, number> = {};
  const repliedByStep = new Map<number, number>();
  for (const { status, cursor } of input.enrollments) {
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status === "replied" && cursor > 0) {
      repliedByStep.set(cursor - 1, (repliedByStep.get(cursor - 1) ?? 0) + 1);
    }
  }
  const sentByStep = new Map<number, number>();
  for (const index of input.sentStepIndexes) sentByStep.set(index, (sentByStep.get(index) ?? 0) + 1);

  const indexes = [...new Set([...sentByStep.keys(), ...repliedByStep.keys()])].sort((a, b) => a - b);
  const steps = indexes.map((stepIndex) => {
    const sent = sentByStep.get(stepIndex) ?? 0;
    const replied = repliedByStep.get(stepIndex) ?? 0;
    return { stepIndex, sent, replied, replyRate: sent > 0 ? replied / sent : null };
  });
  return { enrolled: input.enrollments.length, byStatus, steps, truncated: input.truncated };
}

/** Read one sequence's enrollments and stamped outbound messages and aggregate them. */
export async function readSequenceReport(ctx: QueryCtx, sequenceId: Id<"sequences">): Promise<SequenceReport> {
  const enrollments = await ctx.db
    .query("sequenceEnrollments")
    .withIndex("sequenceId", (q) => q.eq("sequenceId", sequenceId))
    .take(REPORT_ENROLLMENT_LIMIT + 1);
  const messages = await ctx.db
    .query("messages")
    .withIndex("sequence", (q) => q.eq("sequenceId", sequenceId))
    .take(REPORT_MESSAGE_LIMIT + 1);

  return buildSequenceReport({
    enrollments: enrollments.slice(0, REPORT_ENROLLMENT_LIMIT),
    sentStepIndexes: messages
      .slice(0, REPORT_MESSAGE_LIMIT)
      .flatMap((message) => (message.stepIndex === undefined ? [] : [message.stepIndex])),
    truncated: enrollments.length > REPORT_ENROLLMENT_LIMIT || messages.length > REPORT_MESSAGE_LIMIT,
  });
}
