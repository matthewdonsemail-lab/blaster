import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Sequence draft routes: verified Twenty OAuth authentication and strict owner isolation.
 *
 * Checks that:
 * 1. Unauthenticated requests are rejected with 401.
 * 2. Inactive tokens are rejected with 401.
 * 3. Cross-owner access (reading, updating, discarding, committing another member's draft) is rejected with 403.
 * 4. Authorized owner can list, get, save, discard, and commit their own drafts.
 */

interface MockDraft {
  _id: string;
  name: string;
  fromNumber?: string;
  steps: Array<{ text: string; delayHours: number; isStop: boolean }>;
  options?: Record<string, unknown>;
  ownerMemberId?: string;
  createdAt: number;
  updatedAt: number;
}

const memoryDrafts = new Map<string, MockDraft>();

vi.mock("../src/lib/convex/index.ts", () => ({
  listSequenceDrafts: async (args: { ownerMemberId?: string }) => {
    const drafts = Array.from(memoryDrafts.values()).filter((d) =>
      args.ownerMemberId ? d.ownerMemberId === args.ownerMemberId : true,
    );
    return { status: "ok" as const, value: drafts };
  },
  getSequenceDraft: async (id: string) => {
    const draft = memoryDrafts.get(id);
    return { status: "ok" as const, value: draft ?? null };
  },
  saveSequenceDraft: async (input: any) => {
    const id = input.draftId ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: MockDraft = {
      _id: id,
      name: input.name,
      fromNumber: input.fromNumber,
      steps: input.steps ?? [],
      options: input.options,
      ownerMemberId: input.ownerMemberId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    memoryDrafts.set(id, record);
    return { status: "ok" as const, value: { draftId: id } };
  },
  discardSequenceDraft: async (id: string) => {
    const discarded = memoryDrafts.delete(id);
    return { status: "ok" as const, value: { discarded } };
  },
  commitSequenceDraft: async (id: string) => {
    const draft = memoryDrafts.get(id);
    if (!draft) return { status: "failed" as const, error: "unknown draft" };
    memoryDrafts.delete(id);
    return { status: "ok" as const, value: { sequenceId: `seq-committed-${id}` } };
  },
}));

let currentOperatorToken = "token-member-a";
let introspectionActive = true;

vi.mock("../src/lib/twenty/oauth/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/twenty/oauth/index.ts")>();
  return {
    ...actual,
    loadOAuthConfig: () => ({
      clientId: "client-id",
      clientSecret: null,
      authorizationUrl: "https://auth.example",
      tokenUrl: "https://token.example",
      baseUrl: "https://twenty.example",
    }),
    checkOperatorToken: async (_config: unknown, token: string) => {
      if (!introspectionActive) return { active: false };
      if (token === "token-member-a") {
        return {
          active: true,
          username: "member-a@example.com",
          scope: "api",
          claims: { userWorkspaceId: "member-a" },
        };
      }
      if (token === "token-member-b") {
        return {
          active: true,
          username: "member-b@example.com",
          scope: "api",
          claims: { userWorkspaceId: "member-b" },
        };
      }
      return { active: false };
    },
  };
});

vi.mock("@blaster/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@blaster/core")>();
  return {
    ...actual,
    resolveMemberIdentity: async (_client: unknown, input: any) => {
      const workspaceMemberId = input?.claims?.userWorkspaceId ?? null;
      if (!workspaceMemberId) return null;
      return {
        workspaceMemberId,
        userId: `user-${workspaceMemberId}`,
        email: `${workspaceMemberId}@example.com`,
        name: workspaceMemberId,
        resolvedVia: "jwt:userWorkspaceId" as const,
      };
    },
  };
});

let app: { fetch: (request: Request) => Promise<Response> };

const req = (method: string, path: string, token: string | null = currentOperatorToken, body?: unknown) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

beforeEach(async () => {
  memoryDrafts.clear();
  currentOperatorToken = "token-member-a";
  introspectionActive = true;
  process.env.TWENTY_BASE_URL = "https://twenty.example";
  process.env.TWENTY_API_KEY = "twenty-key";
  process.env.CONVEX_URL = "https://convex.example";

  const module = await import("../src/index.ts");
  app = module.default as unknown as { fetch: (request: Request) => Promise<Response> };

  // Seed one draft owned by Member A
  memoryDrafts.set("draft-a-1", {
    _id: "draft-a-1",
    name: "Member A Draft",
    fromNumber: "+15551111111",
    steps: [{ text: "Hello from A", delayHours: 0, isStop: false }],
    ownerMemberId: "member-a@example.com",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
});

describe("Twenty OAuth protection for sequence drafts", () => {
  test("unauthenticated requests return 401 across all draft endpoints", async () => {
    expect((await req("GET", "/api/sequence-drafts", null)).status).toBe(401);
    expect((await req("POST", "/api/sequence-drafts", null, { name: "Test" })).status).toBe(401);
    expect((await req("GET", "/api/sequence-drafts/draft-a-1", null)).status).toBe(401);
    expect((await req("DELETE", "/api/sequence-drafts/draft-a-1", null)).status).toBe(401);
    expect((await req("POST", "/api/sequence-drafts/draft-a-1/commit", null, {})).status).toBe(401);
  });

  test("inactive tokens return 401", async () => {
    introspectionActive = false;
    const res = await req("GET", "/api/sequence-drafts", "token-member-a");
    expect(res.status).toBe(401);
  });

  test("member A can list their own drafts, and cannot see member B drafts", async () => {
    // Seed a draft owned by Member B
    memoryDrafts.set("draft-b-1", {
      _id: "draft-b-1",
      name: "Member B Draft",
      fromNumber: "+15552222222",
      steps: [{ text: "Hello from B", delayHours: 0, isStop: false }],
      ownerMemberId: "member-b@example.com",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // List as Member A
    const resA = await req("GET", "/api/sequence-drafts", "token-member-a");
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as any;
    expect(bodyA.count).toBe(1);
    expect(bodyA.drafts[0]._id).toBe("draft-a-1");

    // List as Member B
    const resB = await req("GET", "/api/sequence-drafts", "token-member-b");
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as any;
    expect(bodyB.count).toBe(1);
    expect(bodyB.drafts[0]._id).toBe("draft-b-1");
  });

  test("cross-owner read is denied with 403", async () => {
    // Member B tries to read Member A's draft
    const res = await req("GET", "/api/sequence-drafts/draft-a-1", "token-member-b");
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toContain("Access denied: you do not own this sequence draft");
  });

  test("cross-owner update is denied with 403", async () => {
    // Member B tries to update Member A's draft
    const res = await req("POST", "/api/sequence-drafts", "token-member-b", {
      draftId: "draft-a-1",
      name: "Hijacked Draft",
    });
    expect(res.status).toBe(403);
    expect(memoryDrafts.get("draft-a-1")?.name).toBe("Member A Draft");
  });

  test("cross-owner delete is denied with 403", async () => {
    // Member B tries to discard Member A's draft
    const res = await req("DELETE", "/api/sequence-drafts/draft-a-1", "token-member-b");
    expect(res.status).toBe(403);
    expect(memoryDrafts.has("draft-a-1")).toBe(true);
  });

  test("cross-owner commit is denied with 403", async () => {
    // Member B tries to commit Member A's draft
    const res = await req("POST", "/api/sequence-drafts/draft-a-1/commit", "token-member-b", {});
    expect(res.status).toBe(403);
    expect(memoryDrafts.has("draft-a-1")).toBe(true);
  });

  test("owner can successfully perform complete lifecycle: save, read, commit", async () => {
    // 1. Create a draft as Member A
    const saveRes = await req("POST", "/api/sequence-drafts", "token-member-a", {
      name: "New Outreach",
      fromNumber: "+15551111111",
      steps: [{ text: "Initial msg", delayHours: 0, isStop: false }],
    });
    expect(saveRes.status).toBe(201);
    const { draftId } = (await saveRes.json()) as any;
    expect(draftId).toBeDefined();

    // 2. Read own draft
    const getRes = await req("GET", `/api/sequence-drafts/${draftId}`, "token-member-a");
    expect(getRes.status).toBe(200);
    const draft = (await getRes.json()) as any;
    expect(draft.name).toBe("New Outreach");

    // 3. Commit own draft
    const commitRes = await req("POST", `/api/sequence-drafts/${draftId}/commit`, "token-member-a", {});
    expect(commitRes.status).toBe(200);
    const commitBody = (await commitRes.json()) as any;
    expect(commitBody.sequenceId).toContain("seq-committed-");

    // Draft is gone from memory drafts
    expect(memoryDrafts.has(draftId)).toBe(false);
  });
});
