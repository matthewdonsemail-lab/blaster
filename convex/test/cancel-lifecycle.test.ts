import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { required, seedSequence, testBackend } from "./harness.support.js";
import { ref } from "./refs.support.js";

type Backend = ReturnType<typeof testBackend>;
const cancelEnrollment = makeFunctionReference<"mutation", { enrollmentId: string; reason?: string }, { status: string; changed: boolean }>("sequence/mutations:cancelEnrollment");
const cancelSequence = makeFunctionReference<"mutation", { sequenceId: string; reason?: string }, { status: string; cancelled: number; more: boolean }>("sequence/mutations:cancelSequence");
const lifecycle = makeFunctionReference<"query", { sequenceId: string }, any>("sequence/queries:sequenceLifecycle");
const recordStep = makeFunctionReference<"mutation", { enrollmentId: string; outcome: string; steps: Array<{ text: string; delayHours: number; isStop: boolean }>; message?: Record<string, unknown> }, { status: string }>("sequence/mutations:recordStep");

const steps = [{ text: "hi", delayHours: 0, isStop: false }, { text: "again", delayHours: 0.01, isStop: false }];

async function enrolled(t: Backend, to: string) {
  const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
  const id = await t.mutation(ref.enroll, { sequenceId, recipientId: `p-${to}`, to });
  return { sequenceId, id };
}

describe("cancel", () => {
  test("cancelling an enrollment stops it for good and frees the prospect to be enrolled again", async () => {
    const t = testBackend();
    const { sequenceId, id } = await enrolled(t, "+13125550001");
    expect(await t.mutation(cancelEnrollment, { enrollmentId: id, reason: "test" })).toEqual({ status: "cancelled", changed: true });
    const row = required(await t.run(async (ctx) => ctx.db.get("sequenceEnrollments", id as never)));
    expect(row).toMatchObject({ status: "cancelled", lastSkipReason: "cancelled: test" });
    expect(row.nextDueAt).toBeUndefined();
    expect(await t.mutation(cancelEnrollment, { enrollmentId: id })).toEqual({ status: "cancelled", changed: false });
    const again = await t.mutation(ref.enroll, { sequenceId, recipientId: "p-+13125550001", to: "+13125550001" });
    expect(again).not.toBe(id);
  });

  test("a finished enrollment is reported, not overwritten", async () => {
    const t = testBackend();
    const { id } = await enrolled(t, "+13125550002");
    await t.run(async (ctx) => ctx.db.patch("sequenceEnrollments", id as never, { status: "replied" }));
    expect(await t.mutation(cancelEnrollment, { enrollmentId: id })).toEqual({ status: "replied", changed: false });
  });

  test("a send that was already in flight is recorded but does not revive a cancelled enrollment", async () => {
    const t = testBackend();
    const { id } = await enrolled(t, "+13125550003");
    await t.mutation(cancelEnrollment, { enrollmentId: id });
    const result = await t.mutation(recordStep, {
      enrollmentId: id,
      outcome: "sent",
      steps,
      message: { to: "+13125550003", from: "+15550000001", text: "hi", telnyxMessageId: "tx-1", sentAt: 1000 },
    });
    expect(result.status).toBe("cancelled");
    const row = required(await t.run(async (ctx) => ctx.db.get("sequenceEnrollments", id as never)));
    expect(row.status).toBe("cancelled");
    const messages = await t.run(async (ctx) => ctx.db.query("messages").take(5));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ enrollmentId: id, stepIndex: 0 });
  });

  test("cancelling a sequence stops the sequence and every live enrollment", async () => {
    const t = testBackend();
    const { sequenceId, id } = await enrolled(t, "+13125550004");
    const second = await t.mutation(ref.enroll, { sequenceId, recipientId: "p-2", to: "+13125550005" });
    const done = await t.mutation(ref.enroll, { sequenceId, recipientId: "p-3", to: "+13125550006" });
    await t.run(async (ctx) => ctx.db.patch("sequenceEnrollments", done as never, { status: "completed" }));

    const result = await t.mutation(cancelSequence, { sequenceId, reason: "stop" });

    expect(result).toEqual({ sequenceId, status: "completed", cancelled: 2, more: false });
    const rows = await t.run(async (ctx) => Promise.all([id, second, done].map((e) => ctx.db.get("sequenceEnrollments", e as never))));
    expect(rows.map((r) => r?.status)).toEqual(["cancelled", "cancelled", "completed"]);
    expect((await t.run(async (ctx) => ctx.db.get("sequences", sequenceId as never)))?.status).toBe("completed");
  });
});

describe("lifecycle view", () => {
  test("shows state, masked numbers and sends in time order", async () => {
    const t = testBackend();
    const { sequenceId, id } = await enrolled(t, "+13125550007");
    for (const [i, at] of [1000, 2000].entries()) {
      await t.mutation(recordStep, {
        enrollmentId: id,
        outcome: "sent",
        steps: [...steps, { text: "third", delayHours: 0.01, isStop: false }],
        message: { to: "+13125550007", from: "+15550000001", text: `m${i}`, telnyxMessageId: `tx-${i}`, sentAt: at },
      });
    }
    const view = await t.query(lifecycle, { sequenceId });
    expect(view.sequence).toMatchObject({ status: "active", stepCount: 1 });
    expect(view.enrollments[0]).toMatchObject({ to: "***0007", cursor: 2 });
    expect(view.sends.map((s: { stepIndex: number }) => s.stepIndex)).toEqual([0, 1]);
    expect(view.report.steps.map((s: { sent: number }) => s.sent)).toEqual([1, 1]);
  });
});
