import { httpAction } from "../_generated/server.js";
import type { HttpRouter } from "convex/server";
import { api } from "../_generated/api.js";

/**
 * Pool HTTP endpoints on a Convex deployment.
 *
 * The same routes the Hono surface serves, but answered by Convex itself — a
 * deployment with no Hono in front still exposes them at
 * `<site>/api/pools/...`. Each handler asks a public query or mutation in
 * `convex/pool/`, so the two surfaces cannot disagree about pool state.
 */
export function registerPoolRoutes(http: HttpRouter): void {
  http.route({
    path: "/api/pools",
    method: "GET",
    handler: httpAction(async (ctx) => {
      const pools = await ctx.runQuery(api.pool.queries.listPools, {});
      return Response.json(pools);
    }),
  });

  http.route({
    path: "/api/pools",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const body = (await req.json().catch(() => null)) as {
        name?: string;
        minSpacingMs?: number;
        dailyCapPerNumber?: number;
      } | null;
      if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
        return Response.json({ error: "name is required" }, { status: 400 });
      }
      const id = await ctx.runMutation(api.pool.mutations.createPool, {
        name: body.name,
        ...(typeof body.minSpacingMs === "number" ? { minSpacingMs: body.minSpacingMs } : {}),
        ...(typeof body.dailyCapPerNumber === "number" ? { dailyCapPerNumber: body.dailyCapPerNumber } : {}),
      });
      return Response.json({ id });
    }),
  });

  http.route({
    path: "/api/pools/:id",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/pools/")[1]?.split("?")[0];
      if (!id) return Response.json({ error: "missing pool id" }, { status: 400 });
      const pool = await ctx.runQuery(api.pool.queries.getPool, { poolId: id as never });
      if (!pool) return Response.json({ error: "unknown pool" }, { status: 404 });
      return Response.json(pool);
    }),
  });

  http.route({
    path: "/api/pools/:id/numbers",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/pools/")[1]?.split("/")[0];
      if (!id) return Response.json({ error: "missing pool id" }, { status: 400 });
      const body = (await req.json().catch(() => null)) as {
        phoneNumber?: string;
        order?: number;
      } | null;
      if (!body || typeof body.phoneNumber !== "string") {
        return Response.json({ error: "phoneNumber is required" }, { status: 400 });
      }
      const pool = await ctx.runMutation(api.pool.mutations.assignNumber, {
        poolId: id as never,
        phoneNumber: body.phoneNumber,
        ...(typeof body.order === "number" ? { order: body.order } : {}),
      });
      return Response.json(pool);
    }),
  });

  http.route({
    path: "/api/pools/:id/numbers/:phoneNumber",
    method: "DELETE",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/pools/")[1]?.split("/")[0];
      const phoneNumber = req.url.split("/numbers/")[1]?.split("?")[0];
      if (!id || !phoneNumber) return Response.json({ error: "missing pool or number" }, { status: 400 });
      const pool = await ctx.runMutation(api.pool.mutations.removeNumber, {
        poolId: id as never,
        phoneNumber,
      });
      return Response.json(pool);
    }),
  });

  http.route({
    path: "/api/pools/:id/numbers",
    method: "PUT",
    handler: httpAction(async (ctx, req) => {
      const id = req.url.split("/api/pools/")[1]?.split("/")[0];
      if (!id) return Response.json({ error: "missing pool id" }, { status: 400 });
      const body = (await req.json().catch(() => null)) as { order?: string[] } | null;
      if (!body || !Array.isArray(body.order)) {
        return Response.json({ error: "order is required" }, { status: 400 });
      }
      const pool = await ctx.runMutation(api.pool.mutations.reorderNumbers, {
        poolId: id as never,
        order: body.order,
      });
      return Response.json(pool);
    }),
  });
}
