import type { QueryCtx } from "../_generated/server.js";
import type { Doc, Id } from "../_generated/dataModel.js";
import { availableAt, selectSender } from "../../packages/core/src/pipeline/pool/index.js";
import { memberState, nonNegative } from "./utils.js";
import { accountUsability } from "../telnyxAccounts/model.js";
import { checkDocReadiness, type SenderReadiness } from "../phoneNumbers/compliance.js";

/**
 * Context-bound reads for the pool domain.
 *
 * The runner reaches the database through these because a Convex action has no
 * `db`. Keeping the read logic here rather than inline in the action means there
 * is one implementation of "which number may send now", and both the query the
 * action calls and the mutation that consumes a sender use it.
 */

/** One number to send from, resolved from its pool membership. */
export interface PoolSender {
  phoneNumber: string;
  phoneNumberId: Id<"phoneNumbers">;
  messagingProfileId?: string;
  order: number;
  readiness: SenderReadiness;
}

/** What a pool can offer right now, and when it next can when it offers none. */
export interface SenderAvailability {
  sender: PoolSender | null;
  soonestNextAvailableAt: number | null;
  blockedReason?: "no-compliant-sender" | "pool-empty" | "pool-rate-limited" | null;
}

/**
 * Every membership of a pool, in `order`.
 *
 * A pool's membership is bounded by the numbers an operator put in it, so this
 * is a bounded read rather than a table scan. It is used by selection, by the
 * rollup, and by the status query.
 */
export async function membersOf(ctx: QueryCtx, poolId: Id<"pools">): Promise<Doc<"poolNumbers">[]> {
  // eslint-disable-next-line @convex-dev/no-collect-in-query
  const rows = await ctx.db
    .query("poolNumbers")
    .withIndex("poolOrder", (q) => q.eq("poolId", poolId))
    .collect();
  return rows.sort((a, b) => a.order - b.order);
}

/** The pool's rate policy, from the pool row. */
export function policyOf(pool: Doc<"pools">) {
  return {
    minSpacingMs: nonNegative(pool.minSpacingMs, 0),
    dailyCapPerNumber: nonNegative(pool.dailyCapPerNumber, 0),
  };
}

/** Resolve a chosen membership to the number and profile a send needs. */
export async function senderForRow(
  ctx: QueryCtx,
  row: Doc<"poolNumbers">,
  now: number = Date.now(),
): Promise<PoolSender> {
  const number = await ctx.db.get("phoneNumbers", row.phoneNumberId);
  let readiness = checkDocReadiness(number, now);
  // A burned or disabled account takes all of its numbers out of selection, so the
  // pool carries on with numbers under other accounts.
  if (readiness.ready) {
    const account = await accountUsability(ctx, number?.accountRef);
    if (!account.usable) readiness = { ready: false, reason: "account-unavailable", detail: account.reason };
  }
  return {
    phoneNumber: row.phoneNumber,
    phoneNumberId: row.phoneNumberId,
    ...(number?.messagingProfileId ? { messagingProfileId: number.messagingProfileId } : {}),
    order: row.order,
    readiness,
  };
}

/**
 * Whether a pool contained this E.164 number (and has not removed it).
 *
 * Used by the conversations domain to attribute a thread to a pool-backed
 * sequence: such a sequence has a `poolId` and a fixed `fromNumber` that is not
 * the number it actually sends from, so matching on `fromNumber` alone leaves
 * every pool-backed thread unassigned.
 */
export async function poolContainsNumber(
  ctx: QueryCtx,
  poolId: Id<"pools">,
  phoneNumber: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("poolNumbers")
    .withIndex("poolPhone", (q) => q.eq("poolId", poolId).eq("phoneNumber", phoneNumber))
    .first();
  return row !== null && row.status !== "removed";
}

/**
 * The next number that may send, computed without consuming any budget.
 *
 * The runner calls this before it claims a step to decide whether to send or
 * defer. It is deliberately a read: the budget is consumed by the mutation that
 * actually reserves the sender, so a step that loses its claim cannot spend a
 * number's allowance.
 */
export async function availableSender(
  ctx: QueryCtx,
  poolId: Id<"pools">,
  now: number,
): Promise<SenderAvailability> {
  const pool = await ctx.db.get("pools", poolId);
  if (!pool || pool.status !== "active") return { sender: null, soonestNextAvailableAt: null };

  const rows = await membersOf(ctx, poolId);
  const activeRows = rows.filter((r) => r.status === "active");
  if (activeRows.length === 0) {
    return { sender: null, soonestNextAvailableAt: null, blockedReason: "pool-empty" };
  }

  // Filter only members whose pool state AND compliance snapshot permit sending.
  const eligibleRows = await Promise.all(
    activeRows.map(async (row) => ({
      row,
      sender: await senderForRow(ctx, row, now),
    })),
  );
  const sendable = eligibleRows.filter(({ sender }) => sender.readiness.ready);
  if (sendable.length === 0) {
    return {
      sender: null,
      soonestNextAvailableAt: null,
      blockedReason: "no-compliant-sender",
    };
  }

  const policy = policyOf(pool);
  const selection = selectSender(sendable.map(({ row }) => memberState(row)), pool.cursor, now, policy);
  if (selection.order === null) {
    return {
      sender: null,
      soonestNextAvailableAt: selection.soonestNextAvailableAt,
      blockedReason: "pool-rate-limited",
    };
  }
  const matched = sendable.find(({ row }) => row.order === selection.order);
  if (!matched) return { sender: null, soonestNextAvailableAt: selection.soonestNextAvailableAt };
  return { sender: matched.sender, soonestNextAvailableAt: null };
}

/**
 * The pool's rollup status, recomputed from its members.
 *
 * `nextAvailableAt` is the earliest instant *any* member may send, so a caller
 * that sees no sender available now knows exactly when to try again.
 */
export function rollupOf(pool: Doc<"pools">, rows: Doc<"poolNumbers">[], now: number) {
  const policy = policyOf(pool);
  const active = rows.filter((row) => row.status === "active");
  if (active.length === 0) return { activeNumberCount: 0, nextAvailableAt: now };
  let soonest = Number.POSITIVE_INFINITY;
  for (const row of active) {
    soonest = Math.min(soonest, availableAt(memberState(row), now, policy));
  }
  return {
    activeNumberCount: active.length,
    nextAvailableAt: Number.isFinite(soonest) ? Math.max(soonest, now) : now,
  };
}
