import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { seedPhoneNumber, seedPool, testBackend } from "./harness.support.js";
import { ref } from "./refs.support.js";

const availableSenderFor = makeFunctionReference<
  "query",
  { poolId: string; to?: string },
  { sender: { phoneNumber: string } | null; blockedReason?: string | null }
>("pool/queries:availableSender");
const setNumberState = makeFunctionReference<"mutation", { phoneNumber: string; stateCode?: string }, unknown>(
  "telnyxAccounts/mutations:setNumberState",
);

async function twoStatePool(t: ReturnType<typeof testBackend>) {
  await seedPhoneNumber(t, "+12155550101", "prof-1"); // Philadelphia, PA
  await seedPhoneNumber(t, "+13125550102", "prof-1"); // Chicago, IL
  const poolId = (await seedPool(t)) as string;
  for (const phoneNumber of ["+12155550101", "+13125550102"]) {
    await t.mutation(ref.assignNumber, { poolId, phoneNumber });
  }
  return poolId;
}

describe("same-state routing in pool selection", () => {
  test("a Chicago recipient gets the Chicago number, a Philadelphia recipient the Philadelphia one", async () => {
    const t = testBackend();
    const poolId = await twoStatePool(t);
    expect((await t.query(availableSenderFor, { poolId, to: "+13125559999" })).sender?.phoneNumber).toBe("+13125550102");
    expect((await t.query(availableSenderFor, { poolId, to: "+12675559999" })).sender?.phoneNumber).toBe("+12155550101");
  });

  test("no number in the recipient's state means no sender, not a wrong-state one", async () => {
    const t = testBackend();
    const poolId = await twoStatePool(t);
    const result = await t.query(availableSenderFor, { poolId, to: "+12125559999" }); // New York
    expect(result.sender).toBeNull();
    expect(result.blockedReason).toBe("no-state-matching-sender");
  });

  test("a recorded state overrides the area code", async () => {
    const t = testBackend();
    const poolId = await twoStatePool(t);
    await t.mutation(setNumberState, { phoneNumber: "+12155550101", stateCode: "ny" });
    expect((await t.query(availableSenderFor, { poolId, to: "+12125559999" })).sender?.phoneNumber).toBe("+12155550101");
  });

  test("with no recipient given, selection is unchanged", async () => {
    const t = testBackend();
    const poolId = await twoStatePool(t);
    expect((await t.query(availableSenderFor, { poolId })).sender?.phoneNumber).toBe("+12155550101");
  });
});
