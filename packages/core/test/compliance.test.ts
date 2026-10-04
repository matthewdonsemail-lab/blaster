import { describe, expect, it } from "vitest";
import {
  checkSenderReadiness,
  requires10DlcRegistration,
  type CheckSenderReadinessInput,
} from "../src/pipeline/sequence/compliance.ts";

describe("requires10DlcRegistration", () => {
  it("recognizes US long code numbers as requiring 10DLC", () => {
    expect(requires10DlcRegistration({ countryCode: "US", numberType: "long_code" })).toBe(true);
    expect(requires10DlcRegistration({ countryCode: "US", numberType: "local" })).toBe(true);
    expect(requires10DlcRegistration({ phoneNumber: "+15551234567" })).toBe(true);
  });

  it("exempts US toll free and short code numbers from 10DLC", () => {
    expect(requires10DlcRegistration({ countryCode: "US", numberType: "toll_free" })).toBe(false);
    expect(requires10DlcRegistration({ countryCode: "US", numberType: "short_code" })).toBe(false);
  });

  it("exempts non-US numbers from US 10DLC", () => {
    expect(requires10DlcRegistration({ countryCode: "GB", phoneNumber: "+447123456789" })).toBe(false);
    expect(requires10DlcRegistration({ countryCode: "IE", phoneNumber: "+353871234567" })).toBe(false);
  });
});

describe("checkSenderReadiness", () => {
  const now = 1700000000000;

  const validUsLongCode: CheckSenderReadinessInput = {
    phoneNumber: "+15551234567",
    countryCode: "US",
    numberType: "long_code",
    messagingProfileId: "prof-123",
    brandId: "brand-1",
    brandStatus: "APPROVED",
    campaignId: "camp-1",
    campaignStatus: "ACTIVE",
    assignmentStatus: "ASSIGNED",
    carrierProvisioningStatus: "COMPLETE",
    complianceCheckedAt: now - 3600_000, // 1 hour ago
    now,
  };

  it("accepts a fully compliant US long code sender", () => {
    const verdict = checkSenderReadiness(validUsLongCode);
    expect(verdict).toEqual({ ready: true });
  });

  it("rejects sender missing a messaging profile", () => {
    const verdict = checkSenderReadiness({
      ...validUsLongCode,
      messagingProfileId: undefined,
    });
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.reason).toBe("missing-messaging-profile");
    }
  });

  it("rejects US long code with missing campaign registration", () => {
    const verdict = checkSenderReadiness({
      ...validUsLongCode,
      campaignId: undefined,
    });
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.reason).toBe("missing-registration");
    }
  });

  it("rejects US long code when campaign is pending or inactive", () => {
    const verdict = checkSenderReadiness({
      ...validUsLongCode,
      campaignStatus: "PENDING",
    });
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.reason).toBe("campaign-not-active");
    }
  });

  it("rejects US long code when assignment is pending", () => {
    const verdict = checkSenderReadiness({
      ...validUsLongCode,
      assignmentStatus: "PENDING",
    });
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.reason).toBe("assignment-pending");
    }
  });

  it("rejects US long code when carrier provisioning is pending", () => {
    const verdict = checkSenderReadiness({
      ...validUsLongCode,
      carrierProvisioningStatus: "IN_PROGRESS",
    });
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.reason).toBe("provisioning-pending");
    }
  });

  it("rejects US long code when compliance snapshot is stale", () => {
    const verdict = checkSenderReadiness({
      ...validUsLongCode,
      complianceCheckedAt: now - 10 * 24 * 60 * 60 * 1000, // 10 days ago (max is 7 days)
    });
    expect(verdict.ready).toBe(false);
    if (!verdict.ready) {
      expect(verdict.reason).toBe("snapshot-stale");
    }
  });

  it("accepts non-US numbers with valid messaging profile without 10DLC registration", () => {
    const nonUs: CheckSenderReadinessInput = {
      phoneNumber: "+447123456789",
      countryCode: "GB",
      messagingProfileId: "prof-uk-1",
      now,
    };
    expect(checkSenderReadiness(nonUs)).toEqual({ ready: true });
  });

  const tollFree: CheckSenderReadinessInput = {
    phoneNumber: "+18005551234",
    countryCode: "US",
    numberType: "toll_free",
    messagingProfileId: "prof-tf-1",
    now,
  };

  it("accepts verified or pending US toll-free numbers without 10DLC registration", () => {
    expect(checkSenderReadiness({ ...tollFree, tollFreeVerification: "verified" })).toEqual({
      ready: true,
    });
    expect(checkSenderReadiness({ ...tollFree, tollFreeVerification: "pending" })).toEqual({
      ready: true,
    });
  });

  it("blocks unverified or unknown toll-free numbers", () => {
    for (const tollFreeVerification of [undefined, null, "", "unverified", "rejected"]) {
      const result = checkSenderReadiness({ ...tollFree, tollFreeVerification });
      expect(result).toMatchObject({ ready: false, reason: "tollfree-unverified" });
    }
  });

  it("lets an operator override send an unregistered number, but still needs a profile", () => {
    const unregistered: CheckSenderReadinessInput = {
      phoneNumber: "+12724470148",
      countryCode: "US",
      numberType: "long_code",
      messagingProfileId: "prof-1",
      now,
    };
    expect(checkSenderReadiness(unregistered)).toMatchObject({ ready: false, reason: "snapshot-stale" });
    expect(checkSenderReadiness({ ...unregistered, allowUnregistered: true })).toEqual({ ready: true });
    expect(
      checkSenderReadiness({ ...unregistered, allowUnregistered: true, messagingProfileId: "" }),
    ).toMatchObject({ ready: false, reason: "missing-messaging-profile" });
    expect(checkSenderReadiness({ ...tollFree, allowUnregistered: true })).toEqual({ ready: true });
  });

  it("still requires a messaging profile for toll-free", () => {
    expect(
      checkSenderReadiness({ ...tollFree, messagingProfileId: "", tollFreeVerification: "verified" }),
    ).toMatchObject({ ready: false, reason: "missing-messaging-profile" });
  });
});
