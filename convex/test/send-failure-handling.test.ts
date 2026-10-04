import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { required, seedSequence, testBackend } from "./harness.js";

const recordStep = makeFunctionReference<
  "mutation",
  {
    enrollmentId: string;
    outcome: "failed";
    steps: Array<{ text: string; delayHours: number; isStop: boolean }>;
    skipReason?: string;
    errorCode?: string;
    retryable?: boolean;
  },
  { status: string; attempts?: number }
>("sequence/mutations:recordStep");

const steps = [{ text: "hi", delayHours: 0, isStop: false }];

async function seedEnrollment(t: ReturnType<typeof testBackend>, to: string) {
  const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
  return t.run(async (ctx) =>
    ctx.db.insert("sequenceEnrollments", {
      sequenceId: sequenceId as never,
      recipientId: `prospect-${to}`,
      to,
      cursor: 0,
      status: "active",
      enrolledAt: 1,
      nextDueAt: 1,
    }),
  );
}

describe("recordStep: failed sends", () => {
  test("a rate-limit rejection stays active, backs off, and records the code", async () => {
    const t = testBackend();
    const enrollmentId = await seedEnrollment(t, "+13125550001");
    const before = Date.now();

    const result = await t.mutation(recordStep, {
      enrollmentId,
      outcome: "failed",
      steps,
      skipReason: "429",
      errorCode: "40011",
      retryable: true,
    });

    expect(result.status).toBe("active");
    const row = required(await t.run(async (ctx) => ctx.db.get("sequenceEnrollments", enrollmentId)));
    expect(row.status).toBe("active");
    expect(row.nextDueAt).toBeGreaterThan(before);
    expect(row.lastErrorCode).toBe("40011");
  });

  test("a permanent rejection fails the enrollment on the first attempt", async () => {
    const t = testBackend();
    const enrollmentId = await seedEnrollment(t, "+13125550002");

    const result = await t.mutation(recordStep, {
      enrollmentId,
      outcome: "failed",
      steps,
      errorCode: "40010",
      retryable: false,
    });

    expect(result.status).toBe("failed");
    const row = required(await t.run(async (ctx) => ctx.db.get("sequenceEnrollments", enrollmentId)));
    expect(row.status).toBe("failed");
    expect(row.nextDueAt).toBeUndefined();
    expect(row.lastErrorCode).toBe("40010");
  });
});
