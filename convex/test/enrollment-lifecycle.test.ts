import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { required, seedSequence, testBackend } from "./harness.js";
import { ref } from "./refs.js";

const pauseEnrollment = makeFunctionReference<"mutation", { enrollmentId: string }, { status: string }>(
  "sequence/mutations:pauseEnrollment",
);
const resumeEnrollment = makeFunctionReference<"mutation", { enrollmentId: string }, { status: string }>(
  "sequence/mutations:resumeEnrollment",
);

describe("enrollment dedupe", () => {
  test("enrolling the same prospect twice returns the existing enrollment", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });

    const first = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });
    const second = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });

    expect(second).toBe(first);
    expect(await t.run(async (ctx) => ctx.db.query("sequenceEnrollments").take(10))).toHaveLength(1);
  });

  test("a different prospect, or the same prospect in another sequence, is a new enrollment", async () => {
    const t = testBackend();
    const a = await seedSequence(t, { fromNumber: "+15550000001", name: "a" });
    const b = await seedSequence(t, { fromNumber: "+15550000001", name: "b" });

    const one = await t.mutation(ref.enroll, { sequenceId: a, recipientId: "p1", to: "+13125550001" });
    const two = await t.mutation(ref.enroll, { sequenceId: a, recipientId: "p2", to: "+13125550002" });
    const three = await t.mutation(ref.enroll, { sequenceId: b, recipientId: "p1", to: "+13125550001" });

    expect(new Set([one, two, three]).size).toBe(3);
  });

  test("a finished enrollment does not block a deliberate re-enroll", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const first = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });
    await t.run(async (ctx) => ctx.db.patch("sequenceEnrollments", first as never, { status: "completed" }));

    const again = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });

    expect(again).not.toBe(first);
  });

  test("a paused enrollment still owns the prospect", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const first = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });
    await t.mutation(pauseEnrollment, { enrollmentId: first });

    expect(await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" })).toBe(first);
  });
});

describe("pause and resume", () => {
  test("pause takes the enrollment out of the queue and resume puts it back, cursor kept", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const id = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });
    await t.run(async (ctx) => ctx.db.patch("sequenceEnrollments", id as never, { cursor: 2 }));

    expect(await t.mutation(pauseEnrollment, { enrollmentId: id })).toEqual({ status: "paused" });
    const paused = required(await t.run(async (ctx) => ctx.db.get("sequenceEnrollments", id as never)));
    expect(paused).toMatchObject({ status: "paused", cursor: 2 });
    expect(paused.nextDueAt).toBeUndefined();

    expect(await t.mutation(resumeEnrollment, { enrollmentId: id })).toEqual({ status: "active" });
    const resumed = required(await t.run(async (ctx) => ctx.db.get("sequenceEnrollments", id as never)));
    expect(resumed).toMatchObject({ status: "active", cursor: 2 });
    expect(resumed.nextDueAt).toBeDefined();
  });

  test("a replied enrollment is reported, not overwritten", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    const id = await t.mutation(ref.enroll, { sequenceId, recipientId: "p1", to: "+13125550001" });
    await t.run(async (ctx) => ctx.db.patch("sequenceEnrollments", id as never, { status: "replied" }));

    expect(await t.mutation(pauseEnrollment, { enrollmentId: id })).toEqual({ status: "replied" });
    expect(await t.mutation(resumeEnrollment, { enrollmentId: id })).toEqual({ status: "replied" });
  });
});
