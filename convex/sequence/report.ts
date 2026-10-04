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

export interface LifecycleView {
  sequence: { id: string; name: string; status: string; stepCount: number };
  /** One row per prospect. Numbers are masked to the last four digits. */
  enrollments: Array<{
    id: string;
    to: string | null;
    status: string;
    cursor: number;
    nextDueAt: number | null;
    lastSentAt: number | null;
    attempts: number;
    note: string | null;
    errorCode: string | null;
  }>;
  /** Outbound messages this sequence sent, oldest first. */
  sends: Array<{ stepIndex: number | null; enrollmentId: string | null; sentAt: number; status: string; telnyxMessageId: string | null }>;
  report: SequenceReport;
}

const maskNumber = (value: string | undefined): string | null => (value ? `***${value.slice(-4)}` : null);

/** Everything needed to watch one campaign run: its state, who is where, and what went out when. */
export async function readSequenceLifecycle(ctx: QueryCtx, sequenceId: Id<"sequences">): Promise<LifecycleView | null> {
  const sequence = await ctx.db.get("sequences", sequenceId);
  if (!sequence) return null;
  const enrollments = await ctx.db
    .query("sequenceEnrollments")
    .withIndex("sequenceId", (q) => q.eq("sequenceId", sequenceId))
    .take(REPORT_ENROLLMENT_LIMIT);
  const messages = await ctx.db
    .query("messages")
    .withIndex("sequence", (q) => q.eq("sequenceId", sequenceId))
    .order("asc")
    .take(REPORT_MESSAGE_LIMIT);
  return {
    sequence: { id: sequence._id, name: sequence.name, status: sequence.status, stepCount: sequence.stepCount },
    enrollments: enrollments.map((row) => ({
      id: row._id,
      to: maskNumber(row.to),
      status: row.status,
      cursor: row.cursor,
      nextDueAt: row.nextDueAt ?? null,
      lastSentAt: row.lastSentAt ?? null,
      attempts: row.attempts ?? 0,
      note: row.lastSkipReason ?? null,
      errorCode: row.lastErrorCode ?? null,
    })),
    sends: messages.map((message) => ({
      stepIndex: message.stepIndex ?? null,
      enrollmentId: message.enrollmentId ?? null,
      sentAt: message.sentAt,
      status: message.status,
      telnyxMessageId: message.telnyxMessageId ?? null,
    })),
    report: buildSequenceReport({
      enrollments,
      sentStepIndexes: messages.flatMap((message) => (message.stepIndex === undefined ? [] : [message.stepIndex])),
      truncated: false,
    }),
  };
}
