import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { seedPhoneNumber, seedPool, testBackend } from "./harness.support.js";
import { ref } from "./refs.support.js";

const registerAccount = makeFunctionReference<"mutation", { ref: string }, unknown>("telnyxAccounts/mutations:registerAccount");
const setAccountStatus = makeFunctionReference<"mutation", { ref: string; status: string }, unknown>("telnyxAccounts/mutations:setAccountStatus");
const setNumberAccount = makeFunctionReference<"mutation", { phoneNumber: string; ref?: string }, unknown>("telnyxAccounts/mutations:setNumberAccount");
const getPoolView = makeFunctionReference<
  "query",
  { poolId: string },
  { numbers: Array<{ phoneNumber: string; accountRef?: string; accountStatus: string | null; sendable: boolean; blockedReason?: string }> } | null
>("pool/queries:getPool");

describe("getPool member view", () => {
  test("shows each number's account and why a burned one cannot send", async () => {
    const t = testBackend();
    await t.mutation(registerAccount, { ref: "acct-a" });
    await t.mutation(registerAccount, { ref: "acct-b" });
    await seedPhoneNumber(t, "+15550000001", "prof-1");
    await seedPhoneNumber(t, "+15550000002", "prof-1");
    await seedPhoneNumber(t, "+15550000003", "prof-1");
    const poolId = (await seedPool(t)) as string;
    for (const phoneNumber of ["+15550000001", "+15550000002", "+15550000003"]) {
      await t.mutation(ref.assignNumber, { poolId, phoneNumber });
    }
    await t.mutation(setNumberAccount, { phoneNumber: "+15550000001", ref: "acct-a" });
    await t.mutation(setNumberAccount, { phoneNumber: "+15550000002", ref: "acct-b" });
    await t.mutation(setAccountStatus, { ref: "acct-b", status: "burned" });

    const view = await t.query(getPoolView, { poolId });
    const byNumber = Object.fromEntries((view?.numbers ?? []).map((row) => [row.phoneNumber, row]));
    expect(byNumber["+15550000001"]).toMatchObject({ accountRef: "acct-a", accountStatus: "active", sendable: true });
    expect(byNumber["+15550000002"]).toMatchObject({
      accountRef: "acct-b",
      accountStatus: "burned",
      sendable: false,
      blockedReason: "account-unavailable",
    });
    expect(byNumber["+15550000003"]).toMatchObject({ accountStatus: null, sendable: true });
  });
});
