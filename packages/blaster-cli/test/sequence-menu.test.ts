/**
 * `blaster sequence` with no action, as an operator and a script meet it.
 *
 * All sequence persistence and draft checkpointing happens in Convex.
 * Local files under `.blaster/sequences.json` are completely removed.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { saveSessionRecord } from "@blaster/core";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sequenceMain, type SequenceContext } from "../src/cli/sequence.ts";
import { askSelect, askText } from "../src/cli/prompt.ts";
import { ensureLiveSession, loginMain } from "../src/cli/login.ts";
import type { BlasterApiClient, SequenceDraft } from "@blaster/core";

const API_URL = "https://blaster.example";

const answers = vi.hoisted(() => ({
  select: [] as Array<string | null>,
  text: [] as Array<string | null>,
}));

vi.mock("../src/cli/prompt.ts", () => ({
  isInteractive: (json: boolean) => !json,
  begin: vi.fn(),
  finish: vi.fn(),
  abort: vi.fn(() => 1),
  fail: vi.fn(),
  note: vi.fn(),
  spin: vi.fn(),
  cancelled: vi.fn(),
  askSelect: vi.fn(async () => answers.select.shift() ?? null),
  askText: vi.fn(async () => answers.text.shift() ?? null),
  askConfirm: vi.fn(async () => null),
}));

const loginCalls = vi.hoisted(() => [] as unknown[][]);

vi.mock("../src/cli/login.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/cli/login.ts")>();
  return {
    ...actual,
    ensureLiveSession: vi.fn(async (root: string, apiUrl: string) =>
      actual.loadHome(root).sessions[apiUrl] ?? null,
    ),
    loginMain: vi.fn(async (...args: unknown[]) => {
      loginCalls.push(args);
      return 0;
    }),
  };
});

const at = Date.UTC(2026, 2, 2, 14, 0, 0);

let root: string;

/** Two sendable numbers, so "pick one" has something to pick. */
const PHONES = {
  count: 2,
  phones: [
    { agencyPhoneId: "rec-1", phoneNumber: "+15557654321", label: "US line", countryCode: "US" },
    { agencyPhoneId: "rec-2", phoneNumber: "+353871234567", label: "IE line", countryCode: "IE" },
  ],
};

/** A signed-in home, so the sending-number lookup has a session to use. */
function signIn(): void {
  saveSessionRecord(
    root,
    {
      accessToken: "at-operator",
      refreshToken: null,
      expiresIn: 3600,
      obtainedAtMs: at,
      username: "operator",
      apiUrl: API_URL,
      loggedInAt: "2026-09-29T00:00:00.000Z",
    },
    { apiUrl: API_URL },
  );
}

/** A configured API with no session for it, which is a real state to be in. */
function configureOnly(): void {
  mkdirSync(join(root, ".blaster"), { recursive: true });
  writeFileSync(
    join(root, ".blaster", "config.json"),
    JSON.stringify({ apiUrl: API_URL, webUrl: API_URL }, null, 2),
    "utf8",
  );
  writeFileSync(join(root, ".blaster", "sessions.json"), "{}", "utf8");
}

/** Stub the API at the fetch boundary; returns the paths that were called. */
function stubApi(
  phones: unknown = PHONES,
  sequences: unknown[] = [],
  drafts: unknown[] = [],
): string[] {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const pathname = new URL(url).pathname;
      paths.push(pathname);
      let body: any = { count: 0 };
      if (pathname === "/api/agency-phones") {
        body = phones;
      } else if (pathname === "/api/sequences") {
        body = { count: sequences.length, sequences };
      } else if (pathname === "/api/sequence-drafts") {
        if (init?.method === "POST") {
          body = { draftId: "draft-1" };
        } else {
          body = { count: drafts.length, drafts };
        }
      } else if (pathname.endsWith("/commit")) {
        body = { sequenceId: "seq-1" };
      } else if (pathname.startsWith("/api/sequences/")) {
        body = { _id: "seq-1", name: "Existing", status: "draft", poolId: null };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return paths;
}

const ctx = (
  json = false,
  flags: Record<string, string | boolean> = {},
  session?: { client: BlasterApiClient; apiUrl: string } | null,
): SequenceContext => ({
  root,
  flags: new Map(Object.entries(flags)),
  json,
  jsonOut: () => "{}",
  now: () => at,
  evaluate: () => ({ eligible: true, reason: null, detail: null }),
  ...(session === undefined ? {} : { session }),
});

const EXISTING_SEQ = {
  id: "seq-existing",
  name: "Existing",
  status: "draft",
  poolId: null,
};

const offlineCtx = (
  json = false,
  sequences: any[] = [EXISTING_SEQ],
  drafts: any[] = [],
): SequenceContext =>
  ctx(
    json,
    {},
    {
      client: {
        listSendingNumbers: async () => [],
        listSequences: async () => sequences,
        listSequenceDrafts: async () => drafts,
        getSequence: async (id: string) => sequences.find((s) => s.id === id) ?? null,
        getSequenceDraft: async (id: string) => drafts.find((d) => d._id === id) ?? null,
        saveSequenceDraft: async () => ({ draftId: "draft-1" }),
        commitSequenceDraft: async () => ({ sequenceId: "seq-1" }),
        discardSequenceDraft: async () => ({ discarded: true }),
        deleteSequence: async () => ({ deleted: true }),
        activateSequence: async (id: string) => ({ sequenceId: id, status: "active" }),
      } as unknown as BlasterApiClient,
      apiUrl: API_URL,
    },
  );

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "blaster-menu-"));
  answers.select.length = 0;
  answers.text.length = 0;
  loginCalls.length = 0;
  vi.mocked(askSelect).mockClear();
  vi.mocked(askText).mockClear();
  vi.mocked(ensureLiveSession).mockClear();
  vi.mocked(loginMain).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
});

describe("bare `blaster sequence` in a terminal", () => {
  test("opens the menu instead of printing help", async () => {
    answers.select = ["__done"];

    expect(await sequenceMain(offlineCtx(), undefined, undefined)).toBe(0);

    expect(askSelect).toHaveBeenCalled();
  });

  test("building a draft through the menu records it in Convex", async () => {
    signIn();
    const paths = stubApi();
    answers.text = [
      "Spring outreach",
      "First message",
      "0",
      "Follow up in two days",
      "48",
      "",
      "yes",
    ];
    answers.select = ["new", "+353871234567", "__done"];

    expect(await sequenceMain(ctx(), undefined, undefined)).toBe(0);

    expect(paths).toContain("/api/sequence-drafts");
    expect(paths.some((p) => p.endsWith("/commit"))).toBe(true);
    expect(existsSync(join(root, ".blaster", "sequences.json"))).toBe(false);
  });

  test("the sending number is offered as the account's numbers, never typed", async () => {
    signIn();
    const paths = stubApi();
    answers.select = ["new", "+353871234567", "__done"];
    answers.text = ["Spring outreach", "Hello", "0", "", "yes"];

    await sequenceMain(ctx(), undefined, undefined);

    expect(paths).toContain("/api/agency-phones");
    const offered = vi
      .mocked(askSelect)
      .mock.calls.find((call) => call[0] === "Sending number?");
    expect(offered?.[1]).toEqual([
      { value: "+15557654321", label: "+15557654321", hint: "US line" },
      { value: "+353871234567", label: "+353871234567", hint: "IE line" },
    ]);
  });

  test("one sendable number is still offered, pre-selected", async () => {
    signIn();
    stubApi({ count: 1, phones: [PHONES.phones[0]] });
    answers.select = ["new", "+15557654321", "__done"];
    answers.text = ["Only line", "Hello", "0", "", "yes"];

    await sequenceMain(ctx(), undefined, undefined);

    const offered = vi
      .mocked(askSelect)
      .mock.calls.find((call) => call[0] === "Sending number?");
    expect(offered?.[1]).toEqual([
      { value: "+15557654321", label: "+15557654321", hint: "US line" },
    ]);
    expect(offered?.[2]).toEqual({ initialValue: "+15557654321" });
  });

  test("not signed in fails with the command to run, and records nothing", async () => {
    const paths = stubApi();
    answers.select = ["new", "__done"];
    answers.text = ["Spring outreach"];

    expect(await sequenceMain(ctx(), undefined, undefined)).toBe(1);

    expect(paths).toEqual([]);
    expect(existsSync(join(root, ".blaster", "sequences.json"))).toBe(false);
  });

  test("a workspace with no sendable number says what to fix", async () => {
    signIn();
    stubApi({ count: 0, phones: [] });
    answers.select = ["new", "__done"];
    answers.text = ["Spring outreach"];

    expect(await sequenceMain(ctx(), undefined, undefined)).toBe(1);
  });

  test("--from still uses the provided sender", async () => {
    signIn();
    const paths = stubApi();
    answers.select = ["new", "__done"];
    answers.text = ["Hello", "0", "", "yes"];

    await sequenceMain(ctx(false, { from: "+15550001111", name: "Spring outreach" }), "new", undefined);

    expect(paths).toContain("/api/sequence-drafts");
    expect(paths.some((p) => p.endsWith("/commit"))).toBe(true);
  });

  test("comes back to the menu after an action, so one session can do two things", async () => {
    answers.select = ["list", "__done"];

    await sequenceMain(offlineCtx(), undefined, undefined);

    expect(vi.mocked(askSelect).mock.calls.filter((call) => call[0] === "What next?")).toHaveLength(2);
  });

  test("picks the sequence by name from what is recorded, not typed", async () => {
    answers.select = ["show", "seq-existing", "__done"];

    await sequenceMain(offlineCtx(), undefined, undefined);

    const pick = vi
      .mocked(askSelect)
      .mock.calls.find((call) => call[0] === "Which sequence to show?");
    expect(pick?.[1]).toEqual([{ value: "seq-existing", label: "Existing", hint: "draft" }]);
  });

  test("cancelling the menu leaves state intact", async () => {
    answers.select = [null];

    expect(await sequenceMain(offlineCtx(), undefined, undefined)).toBe(1);
    expect(existsSync(join(root, ".blaster", "sequences.json"))).toBe(false);
  });
});

describe("the session is resolved once, before anything is asked", () => {
  test("an expired token is refreshed rather than sent as stored", async () => {
    signIn();
    stubApi();
    answers.select = ["new", "+353871234567", "__done"];
    answers.text = ["Spring outreach", "Hello", "0", "", "yes"];

    expect(await sequenceMain(ctx(), undefined, undefined)).toBe(0);

    expect(ensureLiveSession).toHaveBeenCalled();
    expect(loginMain).not.toHaveBeenCalled();
  });

  test("checked once, so the up-front test and the number lookup share it", async () => {
    signIn();
    stubApi();
    answers.select = ["new", "+353871234567", "__done"];
    answers.text = ["Spring outreach", "Hello", "0", "", "yes"];

    await sequenceMain(ctx(), undefined, undefined);

    expect(ensureLiveSession).toHaveBeenCalledTimes(1);
  });

  test("a session that cannot be recovered offers a sign-in instead of failing blind", async () => {
    configureOnly();
    const paths = stubApi();
    answers.select = ["__done"];

    expect(await sequenceMain(ctx(), undefined, undefined)).toBe(1);

    expect(loginMain).toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  test("with no API configured at all, it says so rather than offering a sign-in", async () => {
    const paths = stubApi();
    answers.select = ["__done"];

    expect(await sequenceMain(ctx(), undefined, undefined)).toBe(1);

    expect(loginMain).not.toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  test("the check happens before the first question, not after it", async () => {
    signIn();
    stubApi();
    answers.select = ["__done"];

    const order: string[] = [];
    vi.mocked(ensureLiveSession).mockImplementation(async () => {
      order.push("session");
      return null;
    });
    vi.mocked(askSelect).mockImplementation(async () => {
      order.push("prompt");
      return null;
    });

    await sequenceMain(ctx(), undefined, undefined);

    expect(order[0]).toBe("session");
  });
});

describe("the menu only offers what it can act on", () => {
  const menuOptions = (): Array<{ value: string; label: string; hint?: string }> => {
    const call = vi.mocked(askSelect).mock.calls.find((c) => c[0] === "What next?");
    return (call?.[1] as Array<{ value: string; label: string; hint?: string }>) ?? [];
  };

  test("every entry carries a hint", async () => {
    answers.select = ["__done"];

    await sequenceMain(offlineCtx(), undefined, undefined);

    for (const option of menuOptions()) {
      expect(option.hint, `${option.label} has no hint`).toBeTruthy();
    }
  });

  test("with nothing recorded, the name-taking actions are not offered", async () => {
    answers.select = ["__done"];

    await sequenceMain(offlineCtx(false, [], []), undefined, undefined);

    const menu = vi.mocked(askSelect).mock.calls.find((call) => call[0] === "What next?");
    const values = (menu?.[1] as Array<{ value: string }> | undefined)?.map((option) => option.value) ?? [];
    expect(values).toContain("new");
    expect(values).not.toContain("show");
    expect(values).not.toContain("run");
    expect(values).not.toContain("edit");
    expect(values).not.toContain("rm");
  });

  test("with a sequence recorded in Convex, they are", async () => {
    answers.select = ["__done"];

    await sequenceMain(offlineCtx(), undefined, undefined);

    const menu = vi.mocked(askSelect).mock.calls.find((call) => call[0] === "What next?");
    const values = (menu?.[1] as Array<{ value: string }> | undefined)?.map((option) => option.value) ?? [];
    expect(values).toEqual(expect.arrayContaining(["show", "run", "edit", "rm"]));
  });
});

describe("no local .blaster/sequences.json is written", () => {
  test("reading the menu does not create any local files", () => {
    expect(existsSync(join(root, ".blaster", "sequences.json"))).toBe(false);
  });
});
