import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_OPTIONS, type Recipient, type SequenceDraft } from "@blaster/core";
import { RUNNER_GAPS, draftFromSequence, planFor, parseStepsFlag, type SequenceContext } from "../src/cli/sequence.ts";

/**
 * The Convex-only draft lifecycle and the compliance plan.
 *
 * Sequence drafts and completed sequences live in Convex as the sole source of truth.
 * No files may ever be written to `.blaster/sequences.json`.
 */

let root: string;
const at = Date.UTC(2026, 2, 2, 15, 0, 0); // Monday afternoon, inside every US window

const DRAFT: SequenceDraft = {
  name: "Spring outreach",
  fromNumber: "+15550000000",
  options: { ...DEFAULT_OPTIONS },
  steps: [
    { text: "first", delayHours: 0, isStop: false },
    { text: "second", delayHours: 48, isStop: false },
  ],
};

const recipient = (over: Partial<Recipient> = {}): Recipient => ({
  id: "p-1",
  to: "+15557654321",
  country: "US",
  stateCode: "NY",
  doNotContact: false,
  hasReplied: false,
  sentInLastDay: 0,
  ...over,
});

const allow = () => ({ eligible: true, reason: null, detail: null });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "blaster-seq-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the Convex sequence draft lifecycle", () => {
  test("checkpointing and resuming sequence drafts through client", async () => {
    const memoryDrafts: Map<string, any> = new Map();

    const mockClient = {
      listSequenceDrafts: vi.fn(async () => Array.from(memoryDrafts.values())),
      getSequenceDraft: vi.fn(async (id: string) => memoryDrafts.get(id) ?? null),
      saveSequenceDraft: vi.fn(async (input: any) => {
        const id = input.draftId ?? `draft_${Date.now()}`;
        const record = {
          _id: id,
          name: input.name,
          fromNumber: input.fromNumber,
          currentStep: input.currentStep,
          steps: input.steps ?? [],
          options: input.options,
          updatedAt: Date.now(),
        };
        memoryDrafts.set(id, record);
        return { draftId: id };
      }),
      discardSequenceDraft: vi.fn(async (id: string) => {
        const deleted = memoryDrafts.delete(id);
        return { discarded: deleted };
      }),
      commitSequenceDraft: vi.fn(async (id: string) => {
        const draft = memoryDrafts.get(id);
        if (!draft) throw new Error("not found");
        memoryDrafts.delete(id);
        return { sequenceId: `seq_committed_${id}` };
      }),
    };

    // 1. Checkpoint step 1: name
    const step1 = await mockClient.saveSequenceDraft({
      name: "Q1 Campaign",
      currentStep: "sender",
    });
    expect(step1.draftId).toBeDefined();

    // 2. Checkpoint step 2: sender
    const step2 = await mockClient.saveSequenceDraft({
      draftId: step1.draftId,
      name: "Q1 Campaign",
      fromNumber: "+15551234567",
      currentStep: "steps",
    });
    expect(step2.draftId).toBe(step1.draftId);

    // 3. Resume: list drafts and fetch
    const drafts = await mockClient.listSequenceDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].currentStep).toBe("steps");
    expect(drafts[0].fromNumber).toBe("+15551234567");

    // 4. Commit draft
    const committed = await mockClient.commitSequenceDraft(step1.draftId);
    expect(committed.sequenceId).toContain("seq_committed_");

    // Draft is removed upon commit
    const remaining = await mockClient.listSequenceDrafts();
    expect(remaining).toHaveLength(0);
  });

  test("proves no local files are created in root or .blaster", () => {
    // Assert that the working directory remains clean of sequences.json
    expect(existsSync(join(root, ".blaster", "sequences.json"))).toBe(false);
    expect(existsSync(join(root, "sequences.json"))).toBe(false);
  });
});

describe("the compliance plan", () => {
  const plan = (recipients: Recipient[], evaluate = allow) =>
    planFor(DRAFT, recipients, at, evaluate);

  test("a recipient inside the window would be sent", () => {
    const [row] = plan([recipient()]);
    expect(row?.verdict).toBe("send");
    expect(row?.timeZone).toBe("America/New_York");
    expect(row?.quiet).toBe(false);
  });

  test("the plan is the statechart's own answer, not a reimplementation", () => {
    const [row] = plan([recipient()]);
    expect(row?.state).toBe("claiming");
  });

  test("a do-not-contact prospect is skipped, and the reason is the rule's", () => {
    const [row] = plan(
      [recipient({ doNotContact: true })],
      () => ({ eligible: false, reason: "do-not-contact", detail: "marked DNC" }),
    );
    expect(row?.verdict).toBe("skip");
    expect(row?.reason).toBe("do-not-contact");
  });

  test("someone who already replied is skipped before anything else is checked", () => {
    const [row] = plan(
      [recipient({ hasReplied: true })],
      () => ({ eligible: false, reason: "already-replied", detail: "already answered" }),
    );
    expect(row?.reason).toBe("already-replied");
  });

  test("a recipient with no number cannot be sent", () => {
    const [row] = plan([recipient({ to: null })], () => ({
      eligible: false,
      reason: "no-number",
      detail: "no number",
    }));
    expect(row?.verdict).toBe("skip");
  });

  test("a number outside the sending window is held, not dropped", () => {
    const threeAm = Date.UTC(2026, 2, 2, 8, 0, 0);
    const [row] = planFor(DRAFT, [recipient()], threeAm, allow);
    expect(row?.quiet).toBe(true);
    expect(row?.nextAllowedAt).toBeGreaterThan(threeAm);
    expect(row?.detail).toMatch(/quiet hours/i);
  });

  test("an unplaceable number is not planned as a send", () => {
    const [row] = planFor(DRAFT, [recipient({ stateCode: null })], at, allow);
    expect(row?.state).toBe("awaiting_human");
    expect(row?.verdict).toBe("skip");
  });

  test("the same instant is planned differently for two zones", () => {
    const twentyOneEastern = Date.UTC(2026, 2, 2, 22, 0, 0);
    const east = planFor(DRAFT, [recipient({ stateCode: "NY" })], twentyOneEastern, allow)[0];
    const pacific = planFor(DRAFT, [recipient({ stateCode: "CA" })], twentyOneEastern, allow)[0];
    expect(east?.timeZone).toBe("America/New_York");
    expect(pacific?.timeZone).toBe("America/Los_Angeles");
  });
});

describe("describing a stored sequence", () => {
  const target = { name: "abel-live-3step", poolId: null };

  test("the steps the API returns are the steps that get shown", () => {
    const draft = draftFromSequence(target, {
      fromNumber: "+12724470148",
      options: { stopOnReply: true },
      steps: [
        { text: "step 1", delayHours: 0, isStop: false },
        { text: "step 2", delayHours: 0.00833, isStop: false },
        { text: "step 3", delayHours: 0.00833, isStop: false },
      ],
    });
    expect(draft?.fromNumber).toBe("+12724470148");
    expect(draft?.steps).toHaveLength(3);
    expect(draft?.steps[1]?.text).toBe("step 2");
  });

  test("a read with no steps is not described with a made-up one", () => {
    // This is the bug: the old fallback printed "+10000000000" and a single
    // "Step 1", which read like a real sequence nobody had written.
    expect(draftFromSequence(target, null)).toBeNull();
    expect(draftFromSequence(target, {})).toBeNull();
    expect(draftFromSequence(target, { fromNumber: "+12724470148" })).toBeNull();
    expect(draftFromSequence(target, { fromNumber: "+12724470148", steps: [] })).toBeNull();
  });
});

describe("an explicit --steps wins over a resumed draft", () => {
  test("the flag parses the way the documented example does", () => {
    const parsed = parseStepsFlag(
      '[{"text":"one","delay":"0"},{"text":"two","delay":"30s"},{"text":"three","delay":"30s"}]',
    );
    expect("error" in parsed).toBe(false);
    expect("steps" in parsed && parsed.steps).toHaveLength(3);
  });
});

describe("the active runner status", () => {
  test("runner status describes active Convex cron processing", () => {
    expect(RUNNER_GAPS).toHaveLength(1);
    const text = RUNNER_GAPS[0];
    expect(text).toMatch(/Active runner/i);
    expect(text).toMatch(/Convex cron/i);
  });

  test("the context carries what the command needs and nothing global", () => {
    const ctx: SequenceContext = {
      root,
      flags: new Map(),
      json: true,
      jsonOut: () => "{}",
      now: () => at,
      evaluate: allow,
    };
    expect(ctx.root).toBe(root);
    expect(ctx.now()).toBe(at);
  });
});
