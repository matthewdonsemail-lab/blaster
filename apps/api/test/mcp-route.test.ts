/**
 * The hosted MCP endpoint, through the real Hono app.
 *
 * Pinned: it is behind the operator gate, it serves the same tool table as the
 * stdio server, and a tool call acts as the person who called it (their own
 * token goes back to the API), never as the host.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/twenty/oauth/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/twenty/oauth/index.ts")>();
  return {
    ...actual,
    loadOAuthConfig: () => ({ clientId: "c", clientSecret: null, authorizationUrl: "a", tokenUrl: "t" }),
    checkOperatorToken: async (_config: unknown, token: string) => ({
      active: token === "at-operator",
      username: "operator",
      scope: "api",
    }),
  };
});

let app: { fetch: (request: Request) => Promise<Response> };

const rpc = (body: unknown, token: string | null) =>
  app.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    }),
  );

/** A JSON-RPC reply, whether the server answered as JSON or as one SSE event. */
async function readRpc(response: Response): Promise<any> {
  const text = await response.text();
  const data = text.startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data:")) ?? "").slice(5);
  return JSON.parse(data);
}

beforeEach(async () => {
  process.env.TWENTY_BASE_URL = "https://twenty.example";
  process.env.TWENTY_API_KEY = "twenty-key-for-tests";
  const module = await import("../src/index.ts");
  app = module.default as unknown as { fetch: (request: Request) => Promise<Response> };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /mcp", () => {
  test("refuses a caller with no token", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null)).status).toBe(401);
  });

  test("refuses a token Twenty does not accept", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "at-stranger")).status).toBe(401);
  });

  test("lists the same tools as the stdio server", async () => {
    const { TOOL_NAMES } = await import("../../../packages/blaster-mcp/src/mcp/index.ts");
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "at-operator");
    expect(response.status).toBe(200);
    const body = await readRpc(response);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(TOOL_NAMES);
  });

  test("a tool call goes back to the API with the caller's own token", async () => {
    const seen: string[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/accounts")) {
        seen.push(new Headers(init?.headers).get("authorization") ?? "");
        return new Response(JSON.stringify({ count: 0, accounts: [] }), { headers: { "Content-Type": "application/json" } });
      }
      return real(input as never, init);
    });

    const response = await rpc(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "blaster_list_accounts", arguments: {} } },
      "at-operator",
    );
    const body = await readRpc(response);
    expect(body.result.isError).not.toBe(true);
    expect(seen).toEqual(["Bearer at-operator"]);
  });
});
