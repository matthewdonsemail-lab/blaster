import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { buildSequenceReport } from "../sequence/report.js";
import { seedSequence, testBackend } from "./harness.support.js";

describe("buildSequenceReport", () => {
  test("attributes a reply to the step before the cursor and computes reply rate", () => {
    const report = buildSequenceReport({
      enrollments: [
        { status: "replied", cursor: 1 },
        { status: "replied", cursor: 2 },
        { status: "active", cursor: 1 },
        { status: "completed", cursor: 2 },
      ],
      sentStepIndexes: [0, 0, 0, 1, 1],
      truncated: false,
    });
    expect(report.enrolled).toBe(4);
    expect(report.byStatus).toEqual({ replied: 2, active: 1, completed: 1 });
    expect(report.steps).toEqual([
      { stepIndex: 0, sent: 3, replied: 1, replyRate: 1 / 3 },
      { stepIndex: 1, sent: 2, replied: 1, replyRate: 0.5 },
    ]);
  });

  test("a reply before any send belongs to no step", () => {
    const report = buildSequenceReport({
      enrollments: [{ status: "replied", cursor: 0 }],
      sentStepIndexes: [],
      truncated: false,
    });
    expect(report.steps).toEqual([]);
    expect(report.byStatus).toEqual({ replied: 1 });
  });
});

describe("sequenceReport query", () => {
  test("counts only stamped messages of that sequence", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const other = await seedSequence(t, { fromNumber: "+15550000001", name: "other" });
    await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        pairKey: "a|b",
        phoneNumber: "+13125550001",
        blasterNumber: "+15550000001",
        createdAt: 1,
      });
      const base = { conversationId, direction: "outbound" as const, body: "x", from: "a", to: "b", status: "sent", sentAt: 1 };
      await ctx.db.insert("messages", { ...base, sequenceId: sequenceId as never, stepIndex: 0 });
      await ctx.db.insert("messages", { ...base, sequenceId: other as never, stepIndex: 0 });
      await ctx.db.insert("messages", { ...base });
    });
    const report = await t.query(
      makeFunctionReference<"query", { sequenceId: string }, { steps: Array<{ stepIndex: number; sent: number }> }>(
        "sequence/queries:sequenceReport",
      ),
      { sequenceId },
    );
    expect(report.steps).toEqual([expect.objectContaining({ stepIndex: 0, sent: 1 })]);
  });
});
