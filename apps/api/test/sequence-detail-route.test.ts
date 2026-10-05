/**
 * `GET /api/sequences/:id`, through the real Hono app.
 *
 * The route asks Convex for the row *with its steps*. It used to narrow that
 * answer down to `{_id, name, status, poolId}` and drop the rest, so
 * `blaster sequence show` had no steps to print and fell back to a placeholder
 * — which read like a real sequence nobody had written. These tests pin the
 * full row on the wire, because that is what makes the CLI's view honest.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

const SEQUENCE = {
  _id: "jx7c05cps5t3p8b1yyqq24q87h8fnrcb",
  name: "abel-live-3step",
  status: "active",
  poolId: null,
  fromNumber: "+12724470148",
  stepCount: 3,
  options: { stopOnReply: true, respectDoNotContact: true, dailyCapPerRecipient: 0 },
  // Already sorted: ordering is `getSequenceById`'s job and is pinned in
  // `convex-get-sequence.test.ts`. This test is about what the route puts on
  // the wire.
  steps: [
    { text: "Hi Abel - step 1 of 3 from ListeningKit.", delayHours: 0, isStop: false },
    { text: "Step 2, 30 seconds later.", delayHours: 0.00833, isStop: false },
    { text: "Step 3, 60 seconds in.", delayHours: 0.00833, isStop: false },
  ],
};

vi.mock("../src/lib/convex/index.ts", () => ({
  listSequences: async () => ({
    status: "ok" as const,
    value: [{ id: SEQUENCE._id, name: SEQUENCE.name, status: SEQUENCE.status, poolId: null }],
  }),
  getSequenceById: async (id: string) => ({
    status: "ok" as const,
    value: id === SEQUENCE._id ? SEQUENCE : null,
  }),
}));

let introspectionActive = true;

vi.mock("../src/lib/twenty/oauth/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/twenty/oauth/index.ts")>();
  return {
    ...actual,
    loadOAuthConfig: () => ({ clientId: "c", clientSecret: null, authorizationUrl: "a", tokenUrl: "t" }),
    checkOperatorToken: async (_config: unknown, token: string) => ({
      active: introspectionActive && token === "at-operator",
      username: "operator",
      scope: "api",
    }),
  };
});

let app: { fetch: (request: Request) => Promise<Response> };

const get = (path: string, token: string | null) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    }),
  );

beforeEach(async () => {
  introspectionActive = true;
  process.env.TWENTY_BASE_URL = "https://twenty.example";
  process.env.TWENTY_API_KEY = "twenty-key-for-tests";
  process.env.CONVEX_URL = "https://convex.example";
  const module = await import("../src/index.ts");
  app = module.default as unknown as { fetch: (request: Request) => Promise<Response> };
});

describe("GET /api/sequences/:id", () => {
  test("returns the steps and the sending number, not a four-field summary", async () => {
    const response = await get(`/api/sequences/${SEQUENCE._id}`, "at-operator");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      fromNumber: string;
      stepCount: number;
      steps: Array<{ text: string; delayHours: number; isStop: boolean }>;
    };
    expect(body.fromNumber).toBe("+12724470148");
    expect(body.stepCount).toBe(3);
    expect(body.steps.map((step) => step.text)).toEqual([
      "Hi Abel - step 1 of 3 from ListeningKit.",
      "Step 2, 30 seconds later.",
      "Step 3, 60 seconds in.",
    ]);
  });

  test("an unknown sequence is a 404, not an empty sequence", async () => {
    const response = await get("/api/sequences/jx-does-not-exist", "at-operator");
    expect(response.status).toBe(404);
  });

  test("refuses an unauthenticated caller", async () => {
    expect((await get(`/api/sequences/${SEQUENCE._id}`, null)).status).toBe(401);
  });
});