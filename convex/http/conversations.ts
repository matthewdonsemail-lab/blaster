import { httpAction } from "../_generated/server.js";
import type { HttpRouter } from "convex/server";
import { api } from "../_generated/api.js";
import type { Id } from "../_generated/dataModel.js";

/**
 * Conversation HTTP endpoints on a Convex deployment.
 *
 * The inbox read side: one route with a `groupBy` query param that mirrors the
 * Hono surface's default and person views, and a messages route that reads one
 * thread. A Convex deployment with no Hono in front still exposes both.
 */
export function registerConversationRoutes(http: HttpRouter): void {
  http.route({
    path: "/api/conversations",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const params = new URL(req.url).searchParams;
      const limitRaw = params.get("limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const groupBy = params.get("groupBy");
      if (groupBy !== null && groupBy !== "person") {
        return Response.json({ error: "Unsupported groupBy: expected person" }, { status: 400 });
      }
      const rows = await ctx.runQuery(api.conversations.queries.listConversations, {
        ...(typeof limit === "number" ? { limit } : {}),
        ...(params.get("number") ? { number: params.get("number") ?? "" } : {}),
        ...(params.get("campaign") ? { campaign: params.get("campaign") ?? "" } : {}),
        ...(groupBy === "person" ? { groupBy: "person" as const } : {}),
      });
      return Response.json(
        groupBy === "person"
          ? { count: rows.length, persons: rows }
          : { count: rows.length, conversations: rows },
      );
    }),
  });

  http.route({
    path: "/api/conversations/:id/messages",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/conversations/")[1]?.split("/")[0];
      if (!id) return Response.json({ error: "missing conversation id" }, { status: 400 });
      const limitRaw = new URL(req.url).searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const rows = await ctx.runQuery(api.conversations.queries.conversationMessages, {
        conversationId: id as Id<"conversations">,
        ...(typeof limit === "number" ? { limit } : {}),
      });
      return Response.json({ count: rows.length, messages: rows });
    }),
  });
}
