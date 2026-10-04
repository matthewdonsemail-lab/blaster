import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { seedPhoneNumber, seedPool, testBackend } from "./harness.support.js";

type AttachResult = {
  phoneNumber: string;
  accountRef: string | null;
  stateCode: string | null;
  poolId: string | null;
  sendable: boolean;
  needs: string[];
};
const attach = makeFunctionReference<"mutation", Record<string, unknown>, AttachResult>("phoneNumbers/mutations:attach");
const registerAccount = makeFunctionReference<"mutation", { ref: string }, unknown>("telnyxAccounts/mutations:registerAccount");
const setAccountStatus = makeFunctionReference<"mutation", { ref: string; status: string }, unknown>("telnyxAccounts/mutations:setAccountStatus");

describe("attach", () => {
  test("a newly bought US long code is recorded but reports it is not registered", async () => {
    const t = testBackend();
    const result = await t.mutation(attach, {
      phoneNumber: "+12155550101",
      messagingProfileId: "prof-1",
      numberType: "local",
      countryCode: "US",
    });
    expect(result.sendable).toBe(false);
    expect(result.needs.length).toBeGreaterThan(0);
    expect(result.stateCode).toBe("PA");
    const rows = await t.run(async (ctx) => ctx.db.query("phoneNumbers").take(5));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phoneNumber: "+12155550101", messagingProfileId: "prof-1" });
  });

  test("attaches account, state and pool, and a registered number is sendable", async () => {
    const t = testBackend();
    await t.mutation(registerAccount, { ref: "acct-a" });
    await seedPhoneNumber(t, "+13125550102", "prof-1"); // seeded with a full compliance snapshot
    const poolId = (await seedPool(t)) as string;

    const result = await t.mutation(attach, { phoneNumber: "+13125550102", accountRef: "acct-a", stateCode: "il", poolId });

    expect(result).toMatchObject({ accountRef: "acct-a", stateCode: "IL", poolId, sendable: true, needs: [] });
    const members = await t.run(async (ctx) => ctx.db.query("poolNumbers").take(5));
    expect(members).toHaveLength(1);
  });

  test("a burned account shows as not sendable with the reason", async () => {
    const t = testBackend();
    await t.mutation(registerAccount, { ref: "acct-b" });
    await t.mutation(setAccountStatus, { ref: "acct-b", status: "burned" });
    await seedPhoneNumber(t, "+13125550103", "prof-1");
    const result = await t.mutation(attach, { phoneNumber: "+13125550103", accountRef: "acct-b" });
    expect(result.sendable).toBe(false);
    expect(result.needs).toContain("account-burned:acct-b");
  });

  test("refuses an unregistered account, a bad state and an unknown pool", async () => {
    const t = testBackend();
    await expect(t.mutation(attach, { phoneNumber: "+13125550104", accountRef: "nope" })).rejects.toThrow(/register it first/);
    await expect(t.mutation(attach, { phoneNumber: "+13125550104", stateCode: "Illinois" })).rejects.toThrow(/2-letter/);
  });
});
