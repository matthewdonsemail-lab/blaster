import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api.js";
import type { Id } from "../../../../../../convex/_generated/dataModel.js";
import type { ConversationMessageRow, ConversationPersonRow, ConversationSummary, PoolDetail, PoolNumberRow, PoolSummary, SequenceOption } from "@blaster/core";

/**
 * The API's Convex client.
 *
 * This is the one boundary the Hono surface did not previously have. It exists
 * because the Telnyx webhook arrives here, and a verified inbound event has to
 * reach the writer without an operator or a CLI in the loop. Every other route
 * still answers from Twenty or Telnyx directly, and still works with no
 * CONVEX_URL configured.
 *
 * Functions are referenced through the generated `api` module rather than by
 * name, so a renamed or deleted Convex function is a type error here instead of
 * a runtime 404 in production.
 */

let cached: { url: string; client: ConvexHttpClient } | null = null;

/** Null when CONVEX_URL is unset, so callers can degrade instead of crashing. */
export function convexClient(url: string | undefined = process.env.CONVEX_URL): ConvexHttpClient | null {
  const address = url?.trim();
  if (!address) return null;
  if (cached?.url === address) return cached.client;
  const client = new ConvexHttpClient(address);
  cached = { url: address, client };
  return client;
}

export interface InboundRecordInput {
  from: string;
  to: string;
  body: string;
  telnyxMessageId?: string;
  providerEventId?: string;
  receivedAt?: number;
  /**
   * True when the sender unsubscribed. Decided by the caller with the
   * deterministic classifier; the mutation records what it is told.
   */
  optedOut?: boolean;
  media?: Array<{ url: string; contentType?: string; size?: number }>;
}

/**
 * What a stored reply stopped.
 *
 * Carried out of Convex so the API can decide whether the reply is worth
 * notifying on. A duplicate reports an empty list, which is what makes the
 * providerEventId dedupe inside the mutation double as the notification dedupe.
 */
export interface StoppedEnrollment {
  enrollmentId: string;
  sequenceId: string;
  status: string;
  /** The responsible member, when one was recorded at enroll time. */
  ownerMemberId: string | null;
}

export type InboundRecordResult =
  | {
      status: "stored";
      conversationId: string;
      messageId: string;
      stoppedEnrollments: StoppedEnrollment[];
      /** Twenty agencyProspect the thread is bound to, when one could be resolved. */
      prospectId: string | null;
      /** Twenty agencyLead already linked to the thread, if the prospect was promoted. */
      leadId: string | null;
    }
  | { status: "duplicate"; conversationId: string; messageId: string; stoppedEnrollments: StoppedEnrollment[] }
  | { status: "not-configured" }
  | { status: "failed"; error: string };

/**
 * Store a verified inbound message. Reports rather than throws, so the webhook
 * can answer 200 on a duplicate instead of triggering a retry storm for an event
 * that is already durably stored.
 */
export async function recordInboundMessage(input: InboundRecordInput): Promise<InboundRecordResult> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    return await client.mutation(api.conversations.mutations.recordInboundMessage, input);
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export type StatusResult =
  | { status: "applied" | "stale" | "not-outbound"; messageId: string; stored: string }
  | { status: "unknown-message"; messageId: null; stored: null }
  | { status: "not-configured" }
  | { status: "failed"; error: string };

/** Apply a delivery state to a message we sent, subject to the rank rule. */
export async function applyOutboundStatus(
  telnyxMessageId: string,
  status: string,
  eventType?: string,
): Promise<StatusResult> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    return await client.mutation(api.conversations.mutations.applyOutboundStatus, {
      telnyxMessageId,
      status,
      ...(eventType ? { eventType } : {}),
    });
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The row shapes are the shared contract from `@blaster/core`, not a second
 * declaration of them. The CLI, MCP and the terminal client all import the same
 * types, so a field that moves breaks every surface at once instead of leaving
 * one of them reading a field that no longer exists.
 */
export type ConversationRow = ConversationSummary;
export type MessageRow = ConversationMessageRow;

export interface ConversationQuery {
  limit?: number;
  number?: string;
  campaign?: string;
  withCampaign?: boolean;
  /** Fold the rows into one per person; forces the campaign resolution. */
  groupBy?: "person";
}

export type ReadResult<T> = { status: "ok"; rows: T[] } | { status: "not-configured" } | { status: "failed"; error: string };

/** Conversations, newest activity first, with the inbox filters applied. */
export async function listConversations(query: ConversationQuery = {}): Promise<ReadResult<ConversationRow | ConversationPersonRow>> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    return { status: "ok", rows: await client.query(api.conversations.queries.listConversations, query) };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One thread, oldest message first.
 *
 * The id arrives from a URL, so it is a plain string here. Convex validates the
 * shape on the way in and answers a bad id with an argument error, which the
 * route turns into a 404 rather than a 502.
 */
export async function conversationMessages(
  conversationId: string,
  limit?: number,
): Promise<ReadResult<MessageRow>> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    return {
      status: "ok",
      rows: await client.query(api.conversations.queries.conversationMessages, {
        conversationId: conversationId as Id<"conversations">,
        ...(limit ? { limit } : {}),
      }),
    };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Pool reads and writes.
 *
 * The HTTP surface owns the pool contract: the CLI and MCP go through the
 * shared `BlasterApiClient`, which calls these routes, so all three surfaces
 * act on the same pool state. The Convex functions are the writers; this file
 * only adapts their documents to the shared shapes in `@blaster/core`.
 */

/** A pool result, in the shape the routes map onto status codes. */
export type PoolResult<T> =
  | { status: "ok"; value: T }
  | { status: "not-configured" }
  | { status: "failed"; error: string };

type ConvexPool = {
  _id: string;
  name: string;
  status: "active" | "paused";
  strategy: string;
  cursor: number;
  minSpacingMs: number;
  dailyCapPerNumber: number;
  activeNumberCount: number;
  nextAvailableAt: number;
  lastDispatchedAt?: number;
  createdAt: number;
};

type ConvexPoolNumber = {
  phoneNumberId: string;
  phoneNumber: string;
  order: number;
  status: "active" | "paused" | "removed";
  sentToday: number;
  nextAvailableAt: number;
  lastSentAt?: number;
  assignedAt: number;
  removedAt?: number;
  accountRef?: string;
  accountStatus?: "active" | "burned" | "disabled" | "unknown" | null;
  sendable?: boolean;
  blockedReason?: string;
};

function toPoolSummary(pool: ConvexPool): PoolSummary {
  return {
    id: pool._id,
    name: pool.name,
    status: pool.status,
    strategy: pool.strategy,
    cursor: pool.cursor,
    minSpacingMs: pool.minSpacingMs,
    dailyCapPerNumber: pool.dailyCapPerNumber,
    activeNumberCount: pool.activeNumberCount,
    nextAvailableAt: pool.nextAvailableAt,
    lastDispatchedAt: pool.lastDispatchedAt ?? null,
    createdAt: pool.createdAt,
  };
}

function toPoolNumber(row: ConvexPoolNumber): PoolNumberRow {
  return {
    phoneNumberId: row.phoneNumberId,
    phoneNumber: row.phoneNumber,
    order: row.order,
    status: row.status,
    sentToday: row.sentToday,
    nextAvailableAt: row.nextAvailableAt,
    lastSentAt: row.lastSentAt ?? null,
    assignedAt: row.assignedAt,
    removedAt: row.removedAt ?? null,
    ...(row.accountRef ? { accountRef: row.accountRef } : {}),
    ...(row.accountStatus !== undefined ? { accountStatus: row.accountStatus } : {}),
    ...(row.sendable !== undefined ? { sendable: row.sendable } : {}),
    ...(row.blockedReason ? { blockedReason: row.blockedReason } : {}),
  };
}

function toPoolDetail(pool: ConvexPool & { numbers: ConvexPoolNumber[] }): PoolDetail {
  return { ...toPoolSummary(pool), numbers: pool.numbers.map(toPoolNumber) };
}

/** Wrap a Convex call so an unconfigured deployment degrades instead of throwing. */
async function poolCall<T>(call: () => Promise<T>): Promise<PoolResult<T>> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    return { status: "ok", value: await call() };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function listPools(): Promise<PoolResult<PoolSummary[]>> {
  return poolCall(async () => {
    const rows = await convexClient()!.query(api.pool.queries.listPools, {});
    return rows.map(toPoolSummary);
  });
}

export async function getPool(poolId: string): Promise<PoolResult<PoolDetail | null>> {
  return poolCall(async () => {
    const pool = await convexClient()!.query(api.pool.queries.getPool, {
      poolId: poolId as Id<"pools">,
    });
    return pool ? toPoolDetail(pool) : null;
  });
}

export async function createPool(input: {
  name: string;
  minSpacingMs?: number;
  dailyCapPerNumber?: number;
  phoneNumbers?: string[];
}): Promise<PoolResult<{ id: string }>> {
  return poolCall(async () => {
    const id = await convexClient()!.mutation(api.pool.mutations.createPool, {
      name: input.name,
      ...(input.minSpacingMs === undefined ? {} : { minSpacingMs: input.minSpacingMs }),
      ...(input.dailyCapPerNumber === undefined ? {} : { dailyCapPerNumber: input.dailyCapPerNumber }),
      ...(input.phoneNumbers ? { phoneNumbers: input.phoneNumbers } : {}),
    });
    return { id };
  });
}

/** Add a number, then return the pool as it stands. */
export async function addPoolNumber(
  poolId: string,
  phoneNumber: string,
  order?: number,
): Promise<PoolResult<PoolDetail>> {
  return poolCall(async () => {
    await convexClient()!.mutation(api.pool.mutations.assignNumber, {
      poolId: poolId as Id<"pools">,
      phoneNumber,
      ...(order === undefined ? {} : { order }),
    });
    const pool = await convexClient()!.query(api.pool.queries.getPool, { poolId: poolId as Id<"pools"> });
    return toPoolDetail(pool!);
  });
}

export async function removePoolNumber(
  poolId: string,
  phoneNumber: string,
): Promise<PoolResult<PoolDetail>> {
  return poolCall(async () => {
    await convexClient()!.mutation(api.pool.mutations.removeNumber, {
      poolId: poolId as Id<"pools">,
      phoneNumber,
    });
    const pool = await convexClient()!.query(api.pool.queries.getPool, { poolId: poolId as Id<"pools"> });
    return toPoolDetail(pool!);
  });
}

export async function reorderPoolNumbers(
  poolId: string,
  order: string[],
): Promise<PoolResult<PoolDetail>> {
  return poolCall(async () => {
    await convexClient()!.mutation(api.pool.mutations.reorderNumbers, {
      poolId: poolId as Id<"pools">,
      order,
    });
    const pool = await convexClient()!.query(api.pool.queries.getPool, { poolId: poolId as Id<"pools"> });
    return toPoolDetail(pool!);
  });
}

export async function setSequencePool(
  sequenceId: string,
  poolId?: string,
): Promise<PoolResult<{ sequenceId: string }>> {
  return poolCall(async () => {
    const id = await convexClient()!.mutation(api.sequence.mutations.setSequencePool, {
      sequenceId: sequenceId as Id<"sequences">,
      ...(poolId === undefined ? {} : { poolId: poolId as Id<"pools"> }),
    });
    return { sequenceId: id };
  });
}

/** Sequences, newest first, for a pool-assignment picker. */
export async function listSequences(): Promise<PoolResult<SequenceOption[]>> {
  return poolCall(async () => {
    const rows = await convexClient()!.query(api.sequence.queries.listSequences, {});
    return rows.map((row: any) => ({
      id: row._id,
      name: row.name,
      status: row.status,
      poolId: row.poolId ?? null,
    }));
  });
}

/** One sequence with its steps, as the operator inbox reads it. */
export async function getSequenceById(
  sequenceId: string,
): Promise<PoolResult<{ _id: string; name: string; status: string; poolId: string | null } | null>> {
  return poolCall(async () => {
    const row = await convexClient()!.query(api.sequence.queries.getSequence, {
      sequenceId: sequenceId as Id<"sequences">,
    });
    if (!row) return null;
    return { _id: row._id, name: row.name, status: row.status, poolId: row.poolId ?? null };
  });
}

export async function createSequence(input: {
  name: string;
  fromNumber: string;
  poolId?: string;
  numberProfileId?: string;
  campaignId?: string;
  options?: {
    stopOnReply: boolean;
    respectDoNotContact: boolean;
    requireProfileForCountry: boolean;
    dailyCapPerRecipient: number;
    pinSender?: boolean;
  };
  steps: Array<{ text: string; delayHours: number; isStop: boolean }>;
}): Promise<PoolResult<{ sequenceId: string }>> {
  return poolCall(async () => {
    const sequenceId = await convexClient()!.mutation(api.sequence.mutations.createSequence, {
      name: input.name,
      fromNumber: input.fromNumber,
      ...(input.poolId ? { poolId: input.poolId as Id<"pools"> } : {}),
      ...(input.numberProfileId ? { numberProfileId: input.numberProfileId } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      ...(input.options ? { options: input.options } : {}),
      steps: input.steps,
    });
    return { sequenceId };
  });
}

export async function setSequenceStatus(
  sequenceId: string,
  status: "draft" | "active" | "paused" | "completed",
): Promise<PoolResult<{ sequenceId: string; status: string }>> {
  return poolCall(async () => {
    const id = await convexClient()!.mutation(api.sequence.mutations.setSequenceStatus, {
      sequenceId: sequenceId as Id<"sequences">,
      status,
    });
    return { sequenceId: id, status };
  });
}

export async function cancelSequence(sequenceId: string, reason?: string) {
  return poolCall(async () =>
    convexClient()!.mutation(api.sequence.mutations.cancelSequence, {
      sequenceId: sequenceId as Id<"sequences">,
      ...(reason ? { reason } : {}),
    }),
  );
}

export async function cancelEnrollment(enrollmentId: string, reason?: string) {
  return poolCall(async () =>
    convexClient()!.mutation(api.sequence.mutations.cancelEnrollment, {
      enrollmentId: enrollmentId as Id<"sequenceEnrollments">,
      ...(reason ? { reason } : {}),
    }),
  );
}

export async function pauseEnrollment(enrollmentId: string) {
  return poolCall(async () =>
    convexClient()!.mutation(api.sequence.mutations.pauseEnrollment, { enrollmentId: enrollmentId as Id<"sequenceEnrollments"> }),
  );
}

export async function resumeEnrollment(enrollmentId: string) {
  return poolCall(async () =>
    convexClient()!.mutation(api.sequence.mutations.resumeEnrollment, { enrollmentId: enrollmentId as Id<"sequenceEnrollments"> }),
  );
}

export async function sequenceLifecycle(sequenceId: string) {
  return poolCall(async () =>
    convexClient()!.query(api.sequence.queries.sequenceLifecycle, { sequenceId: sequenceId as Id<"sequences"> }),
  );
}

export async function getPhoneCompliance(
  phoneNumber: string,
): Promise<PoolResult<unknown | null>> {
  return poolCall(async () => {
    return await convexClient()!.query(api.phoneNumbers.queries.getCompliance, {
      phoneNumber,
    });
  });
}

export async function deleteSequence(
  sequenceId: string,
): Promise<PoolResult<{ deleted: boolean }>> {
  return poolCall(async () => {
    const deleted = await convexClient()!.mutation(api.sequence.mutations.deleteSequence, {
      sequenceId: sequenceId as Id<"sequences">,
    });
    return { deleted: Boolean(deleted) };
  });
}

export async function listSequenceDrafts(options?: {
  ownerMemberId?: string;
  limit?: number;
}): Promise<PoolResult<any[]>> {
  return poolCall(async () => {
    return await convexClient()!.query(api.sequence.drafts.listSequenceDrafts, {
      ...(options?.ownerMemberId ? { ownerMemberId: options.ownerMemberId } : {}),
      ...(options?.limit ? { limit: options.limit } : {}),
    });
  });
}

export async function getSequenceDraft(
  draftId: string,
): Promise<PoolResult<any | null>> {
  return poolCall(async () => {
    return await convexClient()!.query(api.sequence.drafts.getSequenceDraft, {
      draftId: draftId as Id<"sequenceDrafts">,
    });
  });
}

export async function saveSequenceDraft(input: {
  draftId?: string;
  name: string;
  fromNumber?: string;
  poolId?: string;
  campaignId?: string;
  numberProfileId?: string;
  currentStep?: string;
  steps?: Array<{ text: string; delayHours: number; isStop: boolean }>;
  options?: Record<string, unknown>;
  ownerMemberId?: string;
}): Promise<PoolResult<{ draftId: string }>> {
  return poolCall(async () => {
    const draftId = await convexClient()!.mutation(api.sequence.drafts.saveSequenceDraft, {
      ...(input.draftId ? { draftId: input.draftId as Id<"sequenceDrafts"> } : {}),
      name: input.name,
      fromNumber: input.fromNumber,
      ...(input.poolId ? { poolId: input.poolId as Id<"pools"> } : {}),
      campaignId: input.campaignId,
      numberProfileId: input.numberProfileId,
      currentStep: input.currentStep,
      steps: input.steps,
      options: input.options as any,
      ownerMemberId: input.ownerMemberId,
    });
    return { draftId };
  });
}

export async function discardSequenceDraft(
  draftId: string,
): Promise<PoolResult<{ discarded: boolean }>> {
  return poolCall(async () => {
    const discarded = await convexClient()!.mutation(api.sequence.drafts.discardSequenceDraft, {
      draftId: draftId as Id<"sequenceDrafts">,
    });
    return { discarded: Boolean(discarded) };
  });
}

export async function commitSequenceDraft(
  draftId: string,
): Promise<PoolResult<{ sequenceId: string }>> {
  return poolCall(async () => {
    const sequenceId = await convexClient()!.mutation(api.sequence.drafts.commitSequenceDraft, {
      draftId: draftId as Id<"sequenceDrafts">,
    });
    return { sequenceId };
  });
}

/** One row of the Convex phone ledger, as the ownership check reads it. */
export interface LedgerNumber {
  phoneNumber: string;
  telnyxNumberId?: string;
  messagingProfileId?: string;
  status?: string;
}

/**
 * The deployment's own purchase ledger.
 *
 * The third ownership registry, alongside the Telnyx account and the Twenty
 * mirror. It matters for an inbound event addressed to a number that is owned
 * but not yet visible in either of the others: a number bought through the
 * Convex `phoneNumbers` action, or one a pool added that had no ledger row until
 * then. Without this source those replies would be refused as not-owned and
 * dropped.
 */
export async function listLedgerNumbers(): Promise<ReadResult<LedgerNumber>> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    const rows = await client.query(api.phoneNumbers.queries.listPhoneNumbers, {});
    return {
      status: "ok",
      rows: rows.map((row: any) => ({
        phoneNumber: row.phoneNumber,
        ...(row.telnyxNumberId ? { telnyxNumberId: row.telnyxNumberId } : {}),
        ...(row.messagingProfileId ? { messagingProfileId: row.messagingProfileId } : {}),
        ...(row.status ? { status: row.status } : {}),
      })),
    };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/** One suppression row, as the operator list reads it. */
export interface SuppressionRow {
  peer: string;
  reason?: string;
  source: "inbound-opt-out" | "manual";
  createdAt: number;
}

/**
 * Everyone currently suppressed, newest first.
 *
 * The durable per-person suppression list — a STOP recorded once, holding across
 * sequences and pool numbers. Operator-facing, so it is read through the same
 * operator-gated surface as the pool list.
 */
export async function listSuppressions(): Promise<ReadResult<SuppressionRow>> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    const rows = await client.query(api.suppressions.mutations.listSuppressions, {});
    return {
      status: "ok",
      rows: rows.map((row: any) => ({
        peer: row.peer,
        ...(row.reason ? { reason: row.reason } : {}),
        source: row.source,
        createdAt: row.createdAt,
      })),
    };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export interface AttachNumberResultRow {
  phoneNumber: string;
  accountRef: string | null;
  stateCode: string | null;
  poolId: string | null;
  sendable: boolean;
  needs: string[];
}

/** Attach a number to its account, state, profile and pool in the Convex ledger. */
export async function attachNumber(input: {
  phoneNumber: string;
  accountRef?: string;
  stateCode?: string;
  messagingProfileId?: string;
  countryCode?: string;
  numberType?: string;
  telnyxNumberId?: string;
  orderId?: string;
  poolId?: string;
}): Promise<PoolResult<AttachNumberResultRow>> {
  return poolCall(async () => {
    const { poolId, ...rest } = input;
    return convexClient()!.mutation(api.phoneNumbers.mutations.attach, {
      ...rest,
      ...(poolId ? { poolId: poolId as Id<"pools"> } : {}),
    });
  });
}

export interface TelnyxAccountSummary {
  ref: string;
  label?: string;
  status: "active" | "burned" | "disabled";
  note?: string;
  keyEnvName: string;
  keyConfigured: boolean;
}

/** Telnyx accounts with health and whether each key is set; never a key. */
export async function listAccounts(): Promise<PoolResult<TelnyxAccountSummary[]>> {
  return poolCall(async () => {
    const rows = await convexClient()!.query(api.telnyxAccounts.mutations.listAccounts, {});
    return rows.map((row) => ({
      ref: row.ref,
      ...(row.label ? { label: row.label } : {}),
      status: row.status,
      ...(row.note ? { note: row.note } : {}),
      keyEnvName: row.keyEnvName,
      keyConfigured: row.keyConfigured,
    }));
  });
}

/** Register an account if new, then apply a label or status change. */
export async function setAccount(input: {
  ref: string;
  label?: string;
  status?: "active" | "burned" | "disabled";
  note?: string;
}): Promise<PoolResult<{ ref: string; status: "active" | "burned" | "disabled"; keyEnvName: string }>> {
  return poolCall(async () => {
    const client = convexClient()!;
    const registered = await client.mutation(api.telnyxAccounts.mutations.registerAccount, {
      ref: input.ref,
      ...(input.label ? { label: input.label } : {}),
    });
    let status: "active" | "burned" | "disabled" = "active";
    if (input.status) {
      await client.mutation(api.telnyxAccounts.mutations.setAccountStatus, {
        ref: input.ref,
        status: input.status,
        ...(input.note ? { note: input.note } : {}),
      });
      status = input.status;
    } else {
      const current = (await client.query(api.telnyxAccounts.mutations.listAccounts, {})).find((row) => row.ref === input.ref);
      if (current) status = current.status;
    }
    return { ref: input.ref, status, keyEnvName: registered.keyEnvName };
  });
}

export async function assignNumberAccount(
  phoneNumber: string,
  ref?: string,
): Promise<PoolResult<{ phoneNumber: string; accountRef: string | null }>> {
  return poolCall(async () => {
    return convexClient()!.mutation(api.telnyxAccounts.mutations.setNumberAccount, {
      phoneNumber,
      ...(ref ? { ref } : {}),
    });
  });
}

/** Record a suppression by hand, or lift one. Both operator actions. */
export async function setSuppression(
  peer: string,
  suppressed: boolean,
  reason?: string,
): Promise<PoolResult<{ peer: string; changed: boolean }>> {
  return poolCall(async () => {
    if (suppressed) {
      const result = await convexClient()!.mutation(api.suppressions.mutations.suppress, {
        peer,
        source: "manual",
        ...(reason ? { reason } : {}),
      });
      return { peer: result.peer, changed: result.created };
    }
    const result = await convexClient()!.mutation(api.suppressions.mutations.lift, { peer });
    return { peer: result.peer, changed: result.lifted };
  });
}

/**
 * Enroll prospects straight from Twenty, reusing the send filter DSL.
 *
 * The action walks `agencyProspects` on the Convex side (it has the Twenty
 * credentials there), so this is a single call the API/CLI/MCP surfaces share
 * rather than each re-implementing the walk. Returns per-prospect outcomes so a
 * caller sees who was enrolled and who was skipped, and why.
 */
export interface EnrollOutcome {
  prospectId: string;
  phone: string | null;
  status: "enrolled" | "skipped";
  detail: string | null;
}

export async function enrollRecipients(input: {
  sequenceId: string;
  filters: Array<{ field: string; operator: string; value?: string | number | boolean | string[] }>;
  ownerMemberId?: string;
  outboundState?: string;
}): Promise<PoolResult<{ total: number; enrolled: number; skipped: number; outcomes: EnrollOutcome[] }>> {
  return poolCall(async () => {
    return convexClient()!.action(api.sequence.actions.enrollRecipients, {
      sequenceId: input.sequenceId as never,
      filters: input.filters as never,
      ...(input.ownerMemberId === undefined ? {} : { ownerMemberId: input.ownerMemberId }),
      ...(input.outboundState === undefined ? {} : { outboundState: input.outboundState }),
    });
  });
}

export type LinkResult =
  | { status: "linked" | "unchanged" | "not-found" }
  | { status: "conflict"; field: "prospectId" | "leadId" }
  | { status: "not-configured" }
  | { status: "failed"; error: string };

/** Bind a thread to its Twenty prospect, and to the lead once promoted. */
export async function linkConversation(
  conversationId: string,
  prospectId: string,
  leadId?: string,
): Promise<LinkResult> {
  const client = convexClient();
  if (!client) return { status: "not-configured" };
  try {
    return await client.mutation(api.conversations.mutations.linkConversation, {
      conversationId: conversationId as never,
      prospectId,
      ...(leadId ? { leadId } : {}),
    });
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
