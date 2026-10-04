import { internalQuery } from "../_generated/server.js";
import { v } from "convex/values";
import { accountUsability } from "./model.js";

/** Whether sends may go through an account now, for the runner (actions have no ctx.db). */
export const usability = internalQuery({
  args: { ref: v.optional(v.string()) },
  handler: async (ctx, args) => accountUsability(ctx, args.ref),
});
