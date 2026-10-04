import { describe, expect, it } from "vitest";
import { ACCOUNTS_USAGE, formatAccounts } from "../src/cli/accounts.ts";

describe("blaster accounts", () => {
  it("shows state and a missing key with the env var to set", () => {
    const text = formatAccounts([
      { ref: "acct-a", label: "Main", status: "active", keyEnvName: "TELNYX_API_KEY__ACCT_A", keyConfigured: true },
      {
        ref: "acct-b",
        status: "burned",
        note: "carrier blocks",
        keyEnvName: "TELNYX_API_KEY__ACCT_B",
        keyConfigured: false,
      },
    ]);
    expect(text).toContain("acct-a  [active]  key set  Main");
    expect(text).toContain("acct-b  [burned]  key MISSING (TELNYX_API_KEY__ACCT_B)  - carrier blocks");
  });

  it("says so when no accounts are registered", () => {
    expect(formatAccounts([])).toMatch(/default key/);
  });

  it("never asks for a key on the command line", () => {
    expect(ACCOUNTS_USAGE).toContain("npx convex env set TELNYX_API_KEY__<REF>");
    expect(ACCOUNTS_USAGE).not.toMatch(/--key/);
  });
});
