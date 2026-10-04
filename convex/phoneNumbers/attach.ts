import type { MutationCtx } from "../_generated/server.js";
import type { Id } from "../_generated/dataModel.js";
import { checkStateMatch } from "../../packages/core/src/pipeline/sequence/compliance.js";
import { assignNumber } from "../pool/model.js";
import { getAccount, accountUsability } from "../telnyxAccounts/model.js";
import { checkDocReadiness } from "./compliance.js";
import { ensurePhoneNumber } from "./model.js";

/**
 * Attach a number to everything that lets it send: its Telnyx account, the state
 * it is owned in, its messaging profile, and a pool. Safe to repeat. Returns what
 * is still missing, so a caller never assumes a bought number can send.
 */
export async function attachNumber(
  ctx: MutationCtx,
  args: {
    phoneNumber: string;
    accountRef?: string;
    stateCode?: string;
    messagingProfileId?: string;
    countryCode?: string;
    numberType?: string;
    telnyxNumberId?: string;
    orderId?: string;
    poolId?: Id<"pools">;
  },
) {
  if (args.accountRef && !(await getAccount(ctx, args.accountRef))) {
    throw new Error(`unknown account ${args.accountRef}; register it first`);
  }
  const stateCode = args.stateCode?.trim().toUpperCase();
  if (stateCode !== undefined && !/^[A-Z]{2}$/.test(stateCode)) throw new Error("stateCode must be a 2-letter USPS code");
  if (args.poolId && !(await ctx.db.get("pools", args.poolId))) throw new Error(`unknown pool ${args.poolId}`);

  const phoneNumberId = await ensurePhoneNumber(ctx, args.phoneNumber);
  const patch: Record<string, unknown> = {};
  if (args.accountRef !== undefined) patch.accountRef = args.accountRef;
  if (stateCode !== undefined) patch.stateCode = stateCode;
  for (const key of ["messagingProfileId", "countryCode", "numberType", "telnyxNumberId", "orderId"] as const) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  if (Object.keys(patch).length > 0) await ctx.db.patch("phoneNumbers", phoneNumberId, patch);
  if (args.poolId) await assignNumber(ctx, args.poolId, phoneNumberId, args.phoneNumber, undefined, Date.now());

  const row = await ctx.db.get("phoneNumbers", phoneNumberId);
  const readiness = checkDocReadiness(row, Date.now());
  const account = await accountUsability(ctx, row?.accountRef);
  const state = checkStateMatch({
    senderPhone: args.phoneNumber,
    senderState: row?.stateCode,
    recipientPhone: args.phoneNumber,
  });
  const needs: string[] = [];
  if (!readiness.ready) needs.push(readiness.reason);
  if (!account.usable) needs.push(account.reason);
  const effectiveState = state.applies ? state.senderState : (row?.stateCode ?? null);
  if (!effectiveState) needs.push("state-unknown");
  return {
    phoneNumber: args.phoneNumber,
    accountRef: row?.accountRef ?? null,
    stateCode: effectiveState,
    poolId: args.poolId ?? null,
    sendable: readiness.ready && account.usable,
    needs,
  };
}
