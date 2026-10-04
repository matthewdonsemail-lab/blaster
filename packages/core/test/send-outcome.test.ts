import { describe, expect, it } from "vitest";
import { classifySendResult } from "../src/telnyx/messaging/helpers/send-outcome.ts";
import { telnyxErrorCodeOf, toTelnyxError } from "../src/telnyx/messaging/helpers/client.ts";

describe("classifySendResult", () => {
  it("treats a 429 as a retryable rejection", () => {
    expect(classifySendResult({ ok: false, status: 429, detail: "slow down" })).toMatchObject({
      kind: "failed",
      retryable: true,
    });
  });

  it("treats Telnyx rate-limit code 40011 as retryable whatever the status", () => {
    expect(classifySendResult({ ok: false, status: 400, errorCode: "40011" })).toMatchObject({
      kind: "failed",
      retryable: true,
      errorCode: "40011",
    });
  });

  it("keeps other 4xx rejections permanent and carries the code", () => {
    expect(classifySendResult({ ok: false, status: 400, errorCode: "40010" })).toEqual({
      kind: "failed",
      retryable: false,
      reason: "rejected with status 400",
      errorCode: "40010",
    });
  });

  it("still parks 5xx as ambiguous", () => {
    expect(classifySendResult({ ok: false, status: 503 }).kind).toBe("ambiguous");
  });
});

describe("telnyxErrorCodeOf", () => {
  it("reads the code from the SDK's parsed body", () => {
    expect(telnyxErrorCodeOf({ error: { errors: [{ code: "40010" }] } })).toBe("40010");
    expect(telnyxErrorCodeOf({ errors: [{ code: 40014 }] })).toBe("40014");
  });

  it("returns undefined when there is none", () => {
    expect(telnyxErrorCodeOf(new Error("boom"))).toBeUndefined();
    expect(telnyxErrorCodeOf(null)).toBeUndefined();
  });

  it("is carried onto TelnyxError", () => {
    const err = Object.assign(new Error("429 slow"), { status: 429, error: { errors: [{ code: "40011" }] } });
    expect(toTelnyxError(err)).toMatchObject({ status: 429, code: "40011" });
  });
});
