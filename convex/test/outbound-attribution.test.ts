import { describe, expect, test } from "vitest";
import { applySentOutcome } from "../sequence/model.js";
import { required, seedSequence, testBackend } from "./harness.js";

/**
 * Outbound messages carry the sequence, enrollment and step that sent them, so
 * reporting does not have to reconstruct attribution from a phone match.
 */
describe("outbound message attribution", () => {
  test("a sequence send stamps sequenceId, enrollmentId and the step that was sent", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const enrollmentId = await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-1",
        to: "+13125550001",
        cursor: 1,
        status: "active",
        enrolledAt: 1,
        nextDueAt: 1,
      }),
    );
    const steps = [
      { text: "first", delayHours: 0, isStop: false },
      { text: "second", delayHours: 24, isStop: false },
      { text: "third", delayHours: 24, isStop: false },
    ];

    await t.run(async (ctx) => {
      const enrollment = required(await ctx.db.get("sequenceEnrollments", enrollmentId));
      await applySentOutcome(ctx, enrollment, steps, 1000, {
        to: "+13125550001",
        from: "+15550000001",
        text: "second",
        telnyxMessageId: "tx-1",
        sentAt: 1000,
      });
    });

    const [message] = await t.run(async (ctx) => ctx.db.query("messages").take(10));
    expect(required(message)).toMatchObject({
      direction: "outbound",
      sequenceId,
      enrollmentId,
      stepIndex: 1,
    });
  });

  test("a reconcile with no message writes no row", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const enrollmentId = await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-2",
        to: "+13125550002",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
        nextDueAt: 1,
      }),
    );
    await t.run(async (ctx) => {
      const enrollment = required(await ctx.db.get("sequenceEnrollments", enrollmentId));
      await applySentOutcome(ctx, enrollment, [{ text: "only", delayHours: 0, isStop: false }], 1000);
    });
    expect(await t.run(async (ctx) => ctx.db.query("messages").take(10))).toHaveLength(0);
  });
});
