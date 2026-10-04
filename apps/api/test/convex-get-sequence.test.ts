/**
 * `getSequenceById`, the Convex read behind `GET /api/sequences/:id`.
 *
 * This is where the steps were dropped. The Convex query already returns the
 * full row plus its `sequenceSteps`, and this function used to narrow the
 * answer to `{_id, name, status, poolId}`. Everything downstream then had to
 * invent placeholder steps to have something to show. The tests below pin the
 * full row. `convex/sequence/queries.ts:82` already sorts by `order`; the sort
 * in `client.ts:387` is defence in depth for any other caller of the query, so
 * the ordering test stays - it is not relying on the index being unsorted.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const ROW = {
  _id: "jx7c05cps5t3p8b1yyqq24q87h8fnrcb",
  name: "abel-live-3step",
  status: "active",
  poolId: null,
  fromNumber: "+12724470148",
  stepCount: 3,
  options: { stopOnReply: true },
  steps: [
    { _id: "s3", order: 2, text: "Step 3", delayHours: 0.00833, isStop: false },
    { _id: "s1", order: 0, text: "Step 1", delayHours: 0, isStop: false },
    { _id: "s2", order: 1, text: "Step 2", delayHours: 0.00833, isStop: false },
  ],
};

const query = vi.fn(async () => ROW);

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = query;
  },
}));

let client: typeof import("../src/lib/convex/helpers/client.ts");

beforeEach(async () => {
  query.mockClear();
  process.env.CONVEX_URL = "https://convex.example";
  client = await import("../src/lib/convex/helpers/client.ts");
});

afterEach(() => {
  delete process.env.CONVEX_URL;
});

describe("getSequenceById", () => {
  test("returns the row with its steps in order, not a four-field summary", async () => {
    const result = await client.getSequenceById(ROW._id);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.value?.fromNumber).toBe("+12724470148");
    expect(result.value?.steps.map((step) => step.text)).toEqual(["Step 1", "Step 2", "Step 3"]);
  });

  test("steps come back as plain step fields, not Convex rows", async () => {
    const result = await client.getSequenceById(ROW._id);
    if (result.status !== "ok" || !result.value) throw new Error("expected a row");
    for (const step of result.value.steps) {
      expect(Object.keys(step).sort()).toEqual(["delayHours", "isStop", "text"]);
    }
  });

  test("an unknown sequence is null, so the route can answer 404", async () => {
    query.mockImplementationOnce(async () => null);
    const result = await client.getSequenceById("jx-missing");
    expect(result).toEqual({ status: "ok", value: null });
  });

  test("no CONVEX_URL reads as not-configured rather than throwing", async () => {
    delete process.env.CONVEX_URL;
    await expect(client.getSequenceById(ROW._id)).resolves.toEqual({ status: "not-configured" });
  });
});