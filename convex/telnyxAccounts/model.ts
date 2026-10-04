import type { QueryCtx } from "../_generated/server.js";
import type { Doc } from "../_generated/dataModel.js";

/**
 * Telnyx accounts: which credential owns which sender number.
 *
 * Only the account's reference and health live in the database. The API key
 * itself is a Convex environment variable named from the reference, so a
 * credential is never stored next to the numbers it owns and never returned by
 * a query. A number with no `accountRef` belongs to the deployment's default
 * account (`TELNYX_API_KEY`), which keeps every existing number working.
 */

export type TelnyxAccountStatus = "active" | "burned" | "disabled";

/** `acct-a` -> `TELNYX_API_KEY__ACCT_A`. */
export function accountKeyEnvName(ref: string): string {
  return `TELNYX_API_KEY__${ref.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** The key for an account ref, or the default key when the number has no account. */
export function resolveAccountKey(
  env: Record<string, string | undefined>,
  ref: string | undefined,
): string | undefined {
  return ref ? env[accountKeyEnvName(ref)] : env.TELNYX_API_KEY;
}

export type AccountUsability = { usable: true } | { usable: false; reason: string };

/**
 * Whether sends may go through this account right now. A missing row for a ref
 * is unusable (a typo must not silently fall back to the default account), and
 * a number with no ref is always usable here: the default account is governed
 * by the presence of its key at send time.
 */
export async function accountUsability(ctx: QueryCtx, ref: string | undefined): Promise<AccountUsability> {
  if (!ref) return { usable: true };
  const account = await getAccount(ctx, ref);
  if (!account) return { usable: false, reason: `unknown-account:${ref}` };
  if (account.status !== "active") return { usable: false, reason: `account-${account.status}:${ref}` };
  return { usable: true };
}

export async function getAccount(ctx: QueryCtx, ref: string): Promise<Doc<"telnyxAccounts"> | null> {
  return ctx.db
    .query("telnyxAccounts")
    .withIndex("ref", (q) => q.eq("ref", ref))
    .unique();
}
