/**
 * What a send attempt means, decided without sending anything.
 *
 * A send has four possible truths and only one of them is safe to act on
 * blindly. The mapping here is the whole duplicate-suppression policy, so it
 * lives in core as a pure function with tests rather than inline in the
 * runner where only production traffic would exercise it:
 *
 * - accepted (2xx) -> the send happened. Record it.
 * - rejected (4xx) -> Telnyx refused it, so nothing went out. Safe to record
 *   as failed without retrying; retrying a rejection is just a slower failure.
 * - anything else -> the outcome is unknown. A 5xx may have been accepted and
 *   then errored; a timeout or dropped connection tells you nothing at all.
 *   Billing fires at submission, so treating these as failures and retrying
 *   blind is how a person receives the same message twice. They park the
 *   enrollment as ambiguous, and only a human reconcile moves it.
 */

export type SendOutcome =
  | { kind: "sent"; messageId: string }
  | { kind: "failed"; retryable: boolean; reason: string; errorCode?: string }
  | { kind: "ambiguous"; reason: string };

/** A send attempt that completed, successfully or not. */
export interface SendAttemptResult {
  ok: boolean;
  /** HTTP status, or 0 when no response was received. */
  status: number;
  messageId?: string;
  detail?: string;
  /** Telnyx error code from the response body, when there was one. */
  errorCode?: string;
}

/**
 * Rejections that mean "too fast", not "wrong". Nothing went out, and the same
 * message is fine to send again after a pause. Anything else in the 4xx range
 * (bad number, no registration, content filtered) will fail the same way again.
 */
const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_ERROR_CODES: ReadonlySet<string> = new Set(["40011"]);

export function isRateLimitRejection(attempt: Pick<SendAttemptResult, "status" | "errorCode">): boolean {
  return (
    attempt.status === RATE_LIMIT_STATUS ||
    (attempt.errorCode !== undefined && RATE_LIMIT_ERROR_CODES.has(attempt.errorCode))
  );
}

/**
 * Classify one completed send attempt.
 *
 * The rule is deliberately asymmetric: "sent" and "rejected" require positive
 * evidence, while everything else defaults to unknown. The burden of proof is
 * on sending again, never on parking.
 */
export function classifySendResult(attempt: SendAttemptResult): SendOutcome {
  if (attempt.ok) {
    return { kind: "sent", messageId: attempt.messageId ?? "" };
  }
  if (attempt.status >= 400 && attempt.status < 500) {
    return {
      kind: "failed",
      retryable: isRateLimitRejection(attempt),
      reason: attempt.detail ?? `rejected with status ${attempt.status}`,
      ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
    };
  }
  return {
    kind: "ambiguous",
    reason: attempt.detail ?? `no definitive outcome (status ${attempt.status})`,
  };
}

/**
 * Classify a thrown error from a send attempt.
 *
 * A throw means no response was read, so the outcome is unknown by
 * construction. Timeouts, resets, and aborts all land here. There is no
 * branch that calls a throw "failed": that judgment requires a response the
 * caller never received.
 */
export function classifySendError(error: unknown): SendOutcome {
  const reason = error instanceof Error ? error.message : String(error);
  return { kind: "ambiguous", reason: reason.slice(0, 300) };
}
