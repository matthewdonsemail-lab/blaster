import type { Doc } from "../_generated/dataModel.js";
import {
  checkSenderReadiness as coreCheckSenderReadiness,
  requires10DlcRegistration as coreRequires10DlcRegistration,
  type SenderReadiness,
} from "../../packages/core/src/pipeline/sequence/compliance.js";

export type { SenderReadiness };

/**
 * Check readiness of a stored phone number document from the phoneNumbers table.
 */
export function checkDocReadiness(
  doc: Doc<"phoneNumbers"> | null,
  now: number = Date.now(),
): SenderReadiness {
  if (!doc) {
    return {
      ready: false,
      reason: "missing-messaging-profile",
      detail: "Phone number is not recorded in the ledger",
    };
  }

  return coreCheckSenderReadiness({
    phoneNumber: doc.phoneNumber,
    countryCode: doc.countryCode,
    numberType: doc.numberType,
    messagingProfileId: doc.messagingProfileId,
    brandId: doc.brandId,
    brandStatus: doc.brandStatus,
    campaignId: doc.campaignId,
    campaignStatus: doc.campaignStatus,
    campaignUseCase: doc.campaignUseCase,
    assignmentStatus: doc.assignmentStatus,
    carrierProvisioningStatus: doc.carrierProvisioningStatus,
    tollFreeVerification: doc.tollFreeVerification,
    complianceCheckedAt: doc.complianceCheckedAt,
    now,
  });
}

export const checkSenderReadiness = coreCheckSenderReadiness;
export const requires10DlcRegistration = coreRequires10DlcRegistration;
