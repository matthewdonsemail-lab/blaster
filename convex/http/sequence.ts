import { httpAction } from "../_generated/server.js";
import type { HttpRouter } from "convex/server";
import { api } from "../_generated/api.js";

/**
 * Sequence HTTP endpoints on a Convex deployment.
 *
 * The read-side of the sequence domain, answered by Convex directly so a
 * deployment with no Hono in front still exposes them. Handlers call the
 * internal sequence queries and mutations in `convex/sequence/`; the enroll
 * action runs over Twenty and is deliberately not exposed here.
 */
export function registerSequenceRoutes(http: HttpRouter): void {
  http.route({
    path: "/api/sequences",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const limitRaw = new URL(req.url).searchParams.get("limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      const sequences = await ctx.runQuery(
        api.sequence.queries.listSequences,
        typeof limit === "number" ? { limit } : {},
      );
      return Response.json({ count: sequences.length, sequences });
    }),
  });

  http.route({
    path: "/api/sequences/:id",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/sequences/")[1]?.split("?")[0];
      if (!id) return Response.json({ error: "missing sequence id" }, { status: 400 });
      const sequence = await ctx.runQuery(
        api.sequence.queries.getSequence,
        { sequenceId: id as never },
      );
      if (!sequence) return Response.json({ error: "unknown sequence" }, { status: 404 });
      return Response.json(sequence);
    }),
  });

  http.route({
    path: "/api/sequences/:id/pool",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/sequences/")[1]?.split("/")[0];
      if (!id) return Response.json({ error: "missing sequence id" }, { status: 400 });
      const body = (await req.json().catch(() => null)) as { poolId?: string } | null;
      if (body === null) return Response.json({ error: "empty body" }, { status: 400 });
      const result = await ctx.runMutation(api.sequence.mutations.setSequencePool, {
        sequenceId: id as never,
        ...(body && typeof body.poolId === "string" ? { poolId: body.poolId as never } : {}),
      });
      return Response.json(result);
    }),
  });
}
