/**
 * Pure policy for sender compliance and 10DLC readiness.
 *
 * For US 10-digit long code (10DLC) SMS, carrier delivery requires:
 * 1. An assigned messaging profile.
 * 2. An active, approved 10DLC campaign.
 * 3. Verified phone number-to-campaign assignment.
 * 4. Completed carrier provisioning.
 *
 * Unregistered US 10DLC traffic is blocked by carriers. Non-US numbers and
 * toll-free numbers follow their own jurisdiction policy (e.g. messaging profile
 * required, but not 10DLC campaign registration).
 */

export const DEFAULT_MAX_COMPLIANCE_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SenderReadinessReason =
  | "missing-messaging-profile"
  | "missing-registration"
  | "campaign-not-active"
  | "assignment-pending"
  | "provisioning-pending"
  | "snapshot-stale"
  | "unsupported-jurisdiction";

export type SenderReadiness =
  | { ready: true }
  | {
      ready: false;
      reason: SenderReadinessReason;
      detail?: string;
    };

export interface CheckSenderReadinessInput {
  phoneNumber?: string | null;
  countryCode?: string | null;
  numberType?: string | null;
  messagingProfileId?: string | null;
  brandId?: string | null;
  brandStatus?: string | null;
  campaignId?: string | null;
  campaignStatus?: string | null;
  campaignUseCase?: string | null;
  assignmentStatus?: string | null;
  carrierProvisioningStatus?: string | null;
  complianceCheckedAt?: number | null;
  now: number;
  maxSnapshotAgeMs?: number;
}

/**
 * Determine if a number is considered a US 10DLC number requiring campaign registration.
 */
export function requires10DlcRegistration(input: {
  phoneNumber?: string | null;
  countryCode?: string | null;
  numberType?: string | null;
}): boolean {
  const country = (input.countryCode ?? "").toUpperCase();
  const phone = input.phoneNumber ?? "";
  const isUs =
    country === "US" ||
    country === "USA" ||
    country === "1" ||
    country === "+1" ||
    phone.startsWith("+1");

  const type = (input.numberType ?? "").toLowerCase();
  const isTollFreeOrShort = type === "toll_free" || type === "short_code" || type === "tollfree";

  return isUs && !isTollFreeOrShort;
}

/**
 * Pure evaluation of whether a sender is verified and permitted to send outbound SMS.
 */
export function checkSenderReadiness(input: CheckSenderReadinessInput): SenderReadiness {
  // 1. All numbers must have a bound messaging profile to route traffic through Telnyx
  if (!input.messagingProfileId || input.messagingProfileId.trim() === "") {
    return {
      ready: false,
      reason: "missing-messaging-profile",
      detail: "Number has no messaging profile bound",
    };
  }

  // 2. Check if 10DLC registration applies
  if (!requires10DlcRegistration(input)) {
    return { ready: true };
  }

  // 3. For US 10DLC long code numbers: verify snapshot freshness
  const maxAge = input.maxSnapshotAgeMs ?? DEFAULT_MAX_COMPLIANCE_SNAPSHOT_AGE_MS;
  if (!input.complianceCheckedAt || input.now - input.complianceCheckedAt > maxAge) {
    return {
      ready: false,
      reason: "snapshot-stale",
      detail: "10DLC compliance verification snapshot is missing or stale",
    };
  }

  // 4. Must have an assigned campaign id
  if (!input.campaignId || input.campaignId.trim() === "") {
    return {
      ready: false,
      reason: "missing-registration",
      detail: "Number is not assigned to a 10DLC campaign",
    };
  }

  // 5. Campaign status must be active/approved
  const campaignStatus = (input.campaignStatus ?? "").toUpperCase();
  if (campaignStatus !== "ACTIVE" && campaignStatus !== "APPROVED") {
    return {
      ready: false,
      reason: "campaign-not-active",
      detail: `Campaign status is '${input.campaignStatus ?? "unknown"}', must be ACTIVE`,
    };
  }

  // 6. Number-to-campaign assignment status must be assigned/complete
  const assignmentStatus = (input.assignmentStatus ?? "").toUpperCase();
  if (
    assignmentStatus !== "ASSIGNED" &&
    assignmentStatus !== "APPROVED" &&
    assignmentStatus !== "COMPLETE"
  ) {
    return {
      ready: false,
      reason: "assignment-pending",
      detail: `Assignment status is '${input.assignmentStatus ?? "unknown"}', must be ASSIGNED`,
    };
  }

  // 7. Carrier provisioning must be completed
  const provisioningStatus = (input.carrierProvisioningStatus ?? "").toUpperCase();
  if (
    provisioningStatus !== "COMPLETE" &&
    provisioningStatus !== "COMPLETED" &&
    provisioningStatus !== "READY" &&
    provisioningStatus !== "ACTIVE" &&
    provisioningStatus !== "PROVISIONED"
  ) {
    return {
      ready: false,
      reason: "provisioning-pending",
      detail: `Carrier provisioning status is '${input.carrierProvisioningStatus ?? "unknown"}', must be COMPLETE`,
    };
  }

  return { ready: true };
}
