import { describe, expect, it } from "vitest";
import type { PoolNumberRow } from "@blaster/core";
import { accountMix, describeSender } from "../src/cli/pools.ts";

const base: PoolNumberRow = {
  phoneNumberId: "n1",
  phoneNumber: "+15550000001",
  order: 0,
  status: "active",
  sentToday: 0,
  nextAvailableAt: 0,
  lastSentAt: null,
  assignedAt: 0,
  removedAt: null,
};

describe("pool sender display", () => {
  it("says nothing when the API sent no detail", () => {
    expect(describeSender(base)).toBe("");
  });

  it("shows the account and that the number can send", () => {
    expect(describeSender({ ...base, accountRef: "acct-a", accountStatus: "active", sendable: true })).toBe(
      "acct=acct-a ok",
    );
    expect(describeSender({ ...base, accountStatus: null, sendable: true })).toBe("acct=default ok");
  });

  it("flags a burned account and the reason a number is blocked", () => {
    expect(
      describeSender({
        ...base,
        accountRef: "acct-b",
        accountStatus: "burned",
        sendable: false,
        blockedReason: "account-unavailable",
      }),
    ).toBe("acct=acct-b (burned) BLOCKED (account-unavailable)");
  });

  it("summarises the account mix over active members only", () => {
    expect(
      accountMix([
        { ...base, accountRef: "acct-a", sendable: true },
        { ...base, phoneNumber: "+15550000002", accountRef: "acct-a", sendable: true },
        { ...base, phoneNumber: "+15550000003", sendable: true },
        { ...base, phoneNumber: "+15550000004", accountRef: "acct-z", sendable: true, status: "removed" },
      ]),
    ).toBe("acct-a x2, default x1");
  });
});
