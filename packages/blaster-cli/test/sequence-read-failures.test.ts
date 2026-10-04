/**
 * What the sequence read path does when the read itself fails.
 *
 * `getSequence` in core throws `BlasterApiError` on any non-2xx, so a 404, 502
 * or 503 never reached the `!draft` branch in `showDraft`/`runDraft`. The
 * operator got an unhandled rejection and a stack trace instead of a message
 * and a non-zero exit. These tests drive the real command functions with an
 * injected session, so the catch is exercised rather than re-implemented.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { newDraft, runDraft, showDraft, type SequenceContext } from "../src/cli/sequence.ts";
import { note } from "../src/cli/prompt.ts";
import type { BlasterApiClient } from "@blaster/core";

vi.mock("../src/cli/prompt.ts", () => ({
  isInteractive: (json: boolean) => !json,
  begin: vi.fn(),
  finish: vi.fn(),
  abort: vi.fn(() => 1),
  fail: vi.fn(),
  note: vi.fn(),
  spin: vi.fn(),
  cancelled: vi.fn(),
  askSelect: vi.fn(async () => null),
  askText: vi.fn(async () => null),
  askConfirm: vi.fn(async () => null),
}));

const TARGET = { id: "seq_1", name: "Spring outreach", status: "active", poolId: null };

const SEQUENCE = {
  _id: "seq_1",
  name: "Spring outreach",
  status: "active",
  poolId: null,
  fromNumber: "+12724470148",
  stepCount: 2,
  options: {},
  steps: [
    { text: "first", delayHours: 0, isStop: false },
    { text: "second", delayHours: 48, isStop: false },
  ],
};

let errors: string[] = [];

function ctxWith(getSequence: () => Promise<unknown>): SequenceContext {
  const client = {
    listSequences: vi.fn(async () => [TARGET]),
    getSequence,
  } as unknown as BlasterApiClient;
  return {
    flags: new Map<string, string | boolean>(),
    json: true,
    jsonOut: (value: unknown) => JSON.stringify(value),
    root: "",
    now: () => Date.UTC(2026, 2, 2, 15, 0, 0),
    recipients: [],
    evaluate: () => ({ eligible: true, reason: null, detail: null }),
    session: { client, apiUrl: "https://blaster.example" },
  } as unknown as SequenceContext;
}

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((msg: unknown) => {
    errors.push(String(msg));
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(note).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sequence show when the read fails", () => {
  for (const [label, status] of [
    ["404", 404],
    ["502", 502],
    ["503", 503],
  ] as const) {
    test(`exits 1 with the reason on a ${label}`, async () => {
      const ctx = ctxWith(async () => {
        const error = new Error(`HTTP ${status}`);
        (error as Error & { status?: number }).status = status;
        throw error;
      });
      expect(await showDraft(ctx, "Spring outreach")).toBe(1);
      expect(errors.join("\n")).toContain(`HTTP ${status}`);
      expect(errors.join("\n")).toContain("Spring outreach");
    });
  }

  test("an empty sequence still reads as a failed read, not a placeholder step", async () => {
    const ctx = ctxWith(async () => ({ ...SEQUENCE, steps: [] }));
    expect(await showDraft(ctx, "Spring outreach")).toBe(1);
    expect(errors.join("\n")).toContain("could not read the steps");
  });

  test("a good read is still a success", async () => {
    const ctx = ctxWith(async () => SEQUENCE);
    expect(await showDraft(ctx, "Spring outreach")).toBe(0);
    expect(errors).toEqual([]);
  });
});

describe("sequence run when the read fails", () => {
  test("exits 1 with the reason instead of throwing", async () => {
    const ctx = ctxWith(async () => {
      throw new Error("HTTP 502 upstream connect error");
    });
    expect(await runDraft(ctx, "Spring outreach")).toBe(1);
    expect(errors.join("\n")).toContain("blaster sequence run");
    expect(errors.join("\n")).toContain("HTTP 502");
  });

  test("an unknown name is a 1 before any read", async () => {
    const getSequence = vi.fn();
    const ctx = ctxWith(getSequence);
    expect(await runDraft(ctx, "nope")).toBe(1);
    expect(getSequence).not.toHaveBeenCalled();
  });
});

describe("sequence new with an explicit --steps", () => {
  test("commits exactly the steps on the flag", async () => {
    const saves: any[] = [];
    let committed: any = null;
    const client = {
      listSequenceDrafts: vi.fn(async () => []),
      saveSequenceDraft: vi.fn(async (input: any) => {
        saves.push(input);
        return { draftId: input.draftId ?? "draft_1" };
      }),
      commitSequenceDraft: vi.fn(async (id: string) => {
        committed = saves[saves.length - 1];
        return { sequenceId: "seq_new" };
      }),
      activateSequence: vi.fn(async () => {}),
    } as unknown as BlasterApiClient;

    const ctx = {
      flags: new Map<string, string | boolean>([
        ["name", "Explicit"],
        ["from", "+12724470148"],
        ["steps", JSON.stringify([{ text: "Hello there" }, { text: "Second one", delay: "48h" }])],
      ]),
      json: true,
      jsonOut: (value: unknown) => JSON.stringify(value),
      root: "",
      now: () => Date.UTC(2026, 2, 2, 15, 0, 0),
      recipients: [],
      evaluate: () => ({ eligible: true, reason: null, detail: null }),
      session: { client, apiUrl: "https://blaster.example" },
    } as unknown as SequenceContext;

    expect(await newDraft(ctx)).toBe(0);
    expect(committed.steps.map((s: any) => s.text)).toEqual(["Hello there", "Second one"]);
    expect(committed.steps.map((s: any) => s.delayHours)).toEqual([0, 48]);
    expect(committed.steps).toHaveLength(2);
  });

  test("an unparseable --steps exits 1 and commits nothing", async () => {
    const commitSequenceDraft = vi.fn();
    const client = {
      listSequenceDrafts: vi.fn(async () => []),
      saveSequenceDraft: vi.fn(async (input: any) => ({ draftId: input.draftId ?? "draft_1" })),
      commitSequenceDraft,
    } as unknown as BlasterApiClient;

    const ctx = {
      flags: new Map<string, string | boolean>([
        ["name", "Broken"],
        ["from", "+12724470148"],
        ["steps", "not json"],
      ]),
      json: true,
      jsonOut: (value: unknown) => JSON.stringify(value),
      root: "",
      now: () => Date.UTC(2026, 2, 2, 15, 0, 0),
      recipients: [],
      evaluate: () => ({ eligible: true, reason: null, detail: null }),
      session: { client, apiUrl: "https://blaster.example" },
    } as unknown as SequenceContext;

    expect(await newDraft(ctx)).toBe(1);
    expect(commitSequenceDraft).not.toHaveBeenCalled();
  });
});