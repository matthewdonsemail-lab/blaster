import { env, mutation, query } from "../_generated/server.js";
import { v } from "convex/values";
import { accountKeyEnvName, getAccount } from "./model.js";

/**
 * Telnyx account registry. Thin wrappers over model.ts; the credential itself is
 * set out of band with `npx convex env set <name> <key>` (see `keyEnvName`).
 */

const statusValidator = v.union(v.literal("active"), v.literal("burned"), v.literal("disabled"));

/** Register an account, or update its label. A new account starts active. */
export const registerAccount = mutation({
  args: { ref: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(args.ref)) throw new Error("ref must be 1-40 letters, digits, - or _");
    const existing = await getAccount(ctx, args.ref);
    if (existing) {
      await ctx.db.patch("telnyxAccounts", existing._id, { label: args.label ?? existing.label, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("telnyxAccounts", {
        ref: args.ref,
        label: args.label,
        status: "active",
        updatedAt: Date.now(),
      });
    }
    return { ref: args.ref, keyEnvName: accountKeyEnvName(args.ref) };
  },
});

/**
 * Mark an account burned or disabled (or active again). Every number on it stops
 * being selectable at once; pools carry on with their other numbers.
 */
export const setAccountStatus = mutation({
  args: { ref: v.string(), status: statusValidator, note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const account = await getAccount(ctx, args.ref);
    if (!account) throw new Error(`unknown account ${args.ref}`);
    await ctx.db.patch("telnyxAccounts", account._id, {
      status: args.status,
      note: args.note,
      updatedAt: Date.now(),
    });
    return { ref: args.ref, status: args.status };
  },
});

/** Assign a number to an account (or back to the default with no ref). */
export const setNumberAccount = mutation({
  args: { phoneNumber: v.string(), ref: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("phoneNumbers")
      .withIndex("phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .unique();
    if (!row) throw new Error(`unknown phone number ${args.phoneNumber}`);
    if (args.ref && !(await getAccount(ctx, args.ref))) throw new Error(`unknown account ${args.ref}`);
    await ctx.db.patch("phoneNumbers", row._id, { accountRef: args.ref });
    return { phoneNumber: args.phoneNumber, accountRef: args.ref ?? null };
  },
});

/** Record the state a number is owned in (USPS code), or clear it to fall back to its area code. */
export const setNumberState = mutation({
  args: { phoneNumber: v.string(), stateCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("phoneNumbers")
      .withIndex("phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .unique();
    if (!row) throw new Error(`unknown phone number ${args.phoneNumber}`);
    const stateCode = args.stateCode?.trim().toUpperCase();
    if (stateCode !== undefined && !/^[A-Z]{2}$/.test(stateCode)) throw new Error("stateCode must be a 2-letter USPS code");
    await ctx.db.patch("phoneNumbers", row._id, { stateCode });
    return { phoneNumber: args.phoneNumber, stateCode: stateCode ?? null };
  },
});

/** Accounts with their state and whether the deployment has the key set. Never the key. */
export const listAccounts = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("telnyxAccounts").take(100);
    return rows.map((row) => ({
      ref: row.ref,
      label: row.label,
      status: row.status,
      note: row.note,
      keyEnvName: accountKeyEnvName(row.ref),
      keyConfigured: Boolean(env[accountKeyEnvName(row.ref) as keyof typeof env]),
    }));
  },
});
