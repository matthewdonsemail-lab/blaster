import { describe, expect, it } from "vitest";
import { checkStateMatch } from "../src/pipeline/sequence/compliance.ts";

describe("checkStateMatch", () => {
  it("allows the same state and blocks a different one", () => {
    expect(checkStateMatch({ senderPhone: "+12155550123", recipientPhone: "+12675550199" })).toMatchObject({
      applies: true,
      match: true,
      senderState: "PA",
      recipientState: "PA",
    });
    expect(checkStateMatch({ senderPhone: "+12155550123", recipientPhone: "+13125550199" })).toMatchObject({
      applies: true,
      match: false,
      senderState: "PA",
      recipientState: "IL",
    });
  });

  it("uses the recorded state of the number over its area code", () => {
    expect(
      checkStateMatch({ senderPhone: "+12155550123", senderState: "il", recipientPhone: "+13125550199" }),
    ).toMatchObject({ applies: true, match: true });
  });

  it("does not apply when either side has no state", () => {
    expect(checkStateMatch({ senderPhone: "+18005550123", recipientPhone: "+13125550199" })).toEqual({ applies: false });
    expect(checkStateMatch({ senderPhone: "+12155550123", recipientPhone: "+353871234567" })).toEqual({ applies: false });
    expect(checkStateMatch({ senderPhone: "+12155550123", recipientPhone: null })).toEqual({ applies: false });
  });
});
