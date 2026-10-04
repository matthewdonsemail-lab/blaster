import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { accountKeyEnvName, resolveAccountKey } from "../telnyxAccounts/model.js";
import { seedPhoneNumber, seedPool, testBackend } from "./harness.support.js";
import { ref } from "./refs.support.js";

const registerAccount = makeFunctionReference<"mutation", { ref: string; label?: string }, { keyEnvName: string }>(
  "telnyxAccounts/mutations:registerAccount",
);
const setAccountStatus = makeFunctionReference<"mutation", { ref: string; status: string }, unknown>(
  "telnyxAccounts/mutations:setAccountStatus",
);
const setNumberAccount = makeFunctionReference<"mutation", { phoneNumber: string; ref?: string }, unknown>(
  "telnyxAccounts/mutations:setNumberAccount",
);

describe("account keys", () => {
  test("a ref maps to a stable env var name and resolves its own key", () => {
    expect(accountKeyEnvName("acct-a")).toBe("TELNYX_API_KEY__ACCT_A");
    const env = { TELNYX_API_KEY: "default", TELNYX_API_KEY__ACCT_A: "a" };
    expect(resolveAccountKey(env, "acct-a")).toBe("a");
    expect(resolveAccountKey(env, undefined)).toBe("default");
  });

  test("an account with no key set does not fall back to the default key", () => {
    expect(resolveAccountKey({ TELNYX_API_KEY: "default" }, "acct-b")).toBeUndefined();
  });
});

describe("pool selection across accounts", () => {
  test("a burned account's numbers are skipped and the pool uses the other account", async () => {
    const t = testBackend();
    await t.mutation(registerAccount, { ref: "acct-a" });
    await t.mutation(registerAccount, { ref: "acct-b" });
    await seedPhoneNumber(t, "+15550000001", "prof-1");
    await seedPhoneNumber(t, "+15550000002", "prof-1");
    const poolId = (await seedPool(t)) as string;
    await t.mutation(ref.assignNumber, { poolId, phoneNumber: "+15550000001" });
    await t.mutation(ref.assignNumber, { poolId, phoneNumber: "+15550000002" });
    await t.mutation(setNumberAccount, { phoneNumber: "+15550000001", ref: "acct-a" });
    await t.mutation(setNumberAccount, { phoneNumber: "+15550000002", ref: "acct-b" });

    await t.mutation(setAccountStatus, { ref: "acct-a", status: "burned" });
    const chosen = await t.query(ref.availableSender, { poolId });
    expect(chosen.sender?.phoneNumber).toBe("+15550000002");

    await t.mutation(setAccountStatus, { ref: "acct-b", status: "disabled" });
    const none = await t.query(ref.availableSender, { poolId });
    expect(none.sender).toBeNull();
  });

  test("a number pointing at an unregistered account is unusable, not defaulted", async () => {
    const t = testBackend();
    await seedPhoneNumber(t, "+15550000003", "prof-1");
    await t.run(async (ctx) => {
      const row = await ctx.db.query("phoneNumbers").first();
      if (row) await ctx.db.patch("phoneNumbers", row._id, { accountRef: "typo" });
    });
    const poolId = (await seedPool(t)) as string;
    await t.mutation(ref.assignNumber, { poolId, phoneNumber: "+15550000003" });
    expect((await t.query(ref.availableSender, { poolId })).sender).toBeNull();
  });
});
