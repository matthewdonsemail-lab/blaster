import { httpAction } from "../_generated/server.js";
import type { HttpRouter } from "convex/server";
import { api } from "../_generated/api.js";

/**
 * Suppression HTTP endpoints on a Convex deployment.
 *
 * The read and write sides of the durable per-peer opt-out record. A Convex
 * deployment with no Hono in front still exposes `GET /api/suppressions` and
 * `POST /api/suppressions`. A lift is an operator decision and stays on the
 * Hono surface, which is where the login gate lives; the Convex mirror is for
 * reads and manual adds.
 */
export function registerSuppressionRoutes(http: HttpRouter): void {
  http.route({
    path: "/api/suppressions",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const limitRaw = new URL(req.url).searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const rows = await ctx.runQuery(
        api.suppressions.mutations.listSuppressions,
        typeof limit === "number" ? { limit } : {},
      );
      return Response.json({ count: rows.length, suppressions: rows });
    }),
  });

  http.route({
    path: "/api/suppressions",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const body = (await req.json().catch(() => null)) as {
        peer?: string;
        reason?: string;
        source?: "manual" | "inbound-opt-out";
      } | null;
      if (!body || typeof body.peer !== "string" || body.peer.trim().length === 0) {
        return Response.json({ error: "peer is required" }, { status: 400 });
      }
      const result = await ctx.runMutation(
        api.suppressions.mutations.suppress,
        {
          peer: body.peer,
          ...(body.reason ? { reason: body.reason } : {}),
          ...(body.source ? { source: body.source } : {}),
        },
      );
      return Response.json(result);
    }),
  });
}
