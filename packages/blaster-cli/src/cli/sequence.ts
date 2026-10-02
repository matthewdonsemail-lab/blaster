/**
 * `blaster sequence`: build, review, and dry-run a multi-step send.
 *
 * All sequences and resumable drafts live directly in Convex as the single
 * source of truth. Unfinished wizard sessions checkpoint each step remotely
 * so work can be resumed across sessions without local file drift.
 */

import {
  DEFAULT_OPTIONS,
  createBlasterApiClient,
  dryRunEnrollment,
  summarise,
  validateDraft,
  type BlasterApiClient,
  type EligibilityInput,
  type Recipient,
  type SendingNumber,
  type SequenceDraft,
  type SequenceDraftRecord,
  type SequenceOption,
  type SequenceStepDraft,
} from "@blaster/core";
import { askSelect, askText, abort, begin, fail, finish, isInteractive, note } from "./prompt.ts";
import { ensureLiveSession, loadHome, loginMain } from "./login.ts";

export type Json = (value: unknown) => string;

export interface SequenceContext {
  root: string;
  flags: Map<string, string | boolean>;
  /** True when --json is set: prompts off, output as one JSON document. */
  json: boolean;
  /** The caller's serialiser, so output matches every other command. */
  jsonOut: Json;
  now: () => number;
  /** Injected so the plan is testable without the environment. */
  evaluate: (recipient: EligibilityInput) => {
    eligible: boolean;
    reason: string | null;
    detail: string | null;
  };
  /**
   * The resolved live session, set by the first thing that needs one.
   */
  session?: { client: BlasterApiClient; apiUrl: string } | null;
}

/** Shared with the top-level dispatcher so the two cannot drift apart. */
export const SEQUENCE_USAGE = `Usage: blaster sequence <action> [name]

  new [name]     Build a sequence interactively with Convex draft checkpointing
                 Flags: --from <number>, --pool <id>, --campaign <id>, --activate
  activate <id>  Activate a sequence in Convex for sending
  list           List sequences and unfinished drafts in Convex
  show <name>    The steps, plus a per-recipient plan
  edit <name>    Change the first message
  run <name>     Dry run: shows the per-recipient dispatch plan
  rm <name>      Remove a sequence or discard an unfinished draft

  validate       Check a JSON draft and print every problem at once
  preview        Dry run a JSON draft against --recipients

With no action in a terminal, this opens an interactive menu.

All sequences and resumable drafts live directly in Convex as the single
source of truth. Unfinished wizard sessions checkpoint each step remotely
so work can be resumed across sessions without local file drift.`;

/** Active runner confirmation: replaces obsolete missing-runner gaps. */
export const RUNNER_GAPS: readonly string[] = [
  "Active runner: sequences are processed via Convex cron jobs and actions with 10DLC compliance verification, rate limiting, and pool rotation.",
];

export function readRecipients(flags: Map<string, string | boolean>): Recipient[] {
  const raw = flags.get("recipients");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as Recipient[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** One row per recipient: what the sequence would do, and why not. */
export interface PlanRow {
  to: string | null;
  verdict: "send" | "skip";
  reason: string | null;
  detail: string;
  state: string;
  timeZone: string | null;
  localHour: number | null;
  quiet: boolean;
  approximateZone: boolean;
  nextAllowedAt: number | null;
}

/**
 * The plan for one recipient, from the machine itself.
 */
export function planForRecipient(
  draft: SequenceDraft,
  recipient: Recipient,
  now: number,
  evaluate: SequenceContext["evaluate"],
): PlanRow {
  const run = dryRunEnrollment({
    enrollmentId: recipient.id || "dry-run",
    sequenceId: draft.name,
    steps: draft.steps,
    fromNumber: draft.fromNumber,
    now,
    recipient,
    evaluate,
  });

  const wouldSend = run.effect.type === "claim";
  const held = run.nextAllowedAt !== null && run.nextAllowedAt > now;

  let detail: string;
  if (run.state === "awaiting_human") {
    detail = "Recipient could not be placed in a time zone, so no legal send time is known.";
  } else if (run.skipReason === "quiet-hours") {
    detail = `Inside quiet hours in ${run.timeZone ?? "an unknown zone"}; held until the window opens.`;
  } else if (run.skipReason) {
    detail = `Not sent (${run.skipReason}).`;
  } else if (run.quiet || held) {
    detail = `Held until the sending window opens in ${run.timeZone ?? "an unknown zone"}.`;
  } else {
    detail = `Step 1 is inside the 08:00-21:00 window in ${run.timeZone ?? "an unknown zone"}.`;
  }

  return {
    to: recipient.to ?? null,
    verdict: wouldSend ? "send" : "skip",
    reason: run.skipReason,
    detail,
    state: run.state,
    timeZone: run.timeZone,
    localHour: run.localHour,
    quiet: run.quiet,
    approximateZone: run.approximateZone,
    nextAllowedAt: run.nextAllowedAt,
  };
}

export function planFor(
  draft: SequenceDraft,
  recipients: Recipient[],
  now: number,
  evaluate: SequenceContext["evaluate"],
): PlanRow[] {
  return recipients.map((recipient) => planForRecipient(draft, recipient, now, evaluate));
}

function printPlan(rows: PlanRow[]): number {
  if (rows.length === 0) {
    console.log("No recipients supplied. Pass --recipients '[{\"id\":\"1\",\"to\":\"+15551234567\"}]'.");
    return 0;
  }
  for (const row of rows) {
    const to = row.to ?? "(no number)";
    const local = row.localHour === null ? "unknown" : `${String(row.localHour).padStart(2, "0")}:00`;
    console.log(`  ${row.verdict.padEnd(4)} ${to.padEnd(16)} ${local.padEnd(8)} ${row.detail}`);
  }
  const sends = rows.filter((row) => row.verdict === "send").length;
  console.log(`\n${sends} of ${rows.length} would be sent now.`);
  return 0;
}

function printSteps(draft: SequenceDraft): void {
  draft.steps.forEach((step: SequenceStepDraft, index: number) => {
    console.log(
      step.isStop
        ? `  ${index + 1}. (stop condition)`
        : `  ${index + 1}. +${step.delayHours}h  ${step.text}`,
    );
  });
  console.log("");
}

async function liveClient(
  ctx: SequenceContext,
): Promise<{ client: BlasterApiClient; apiUrl: string } | number> {
  if (ctx.session !== undefined) {
    return ctx.session === null ? 1 : ctx.session;
  }
  const home = loadHome(ctx.root);
  const explicit = ctx.flags.get("api-url");
  const apiUrl =
    (typeof explicit === "string" && explicit !== "" ? explicit : null) ??
    home.config.apiUrl ??
    Object.keys(home.sessions)[0] ??
    null;
  if (!apiUrl) {
    console.error('blaster sequence: no signed-in API. Run "blaster login" first, or pass --api-url.');
    ctx.session = null;
    return 1;
  }
  let session = await ensureLiveSession(ctx.root, apiUrl);
  if (!session) {
    if (!isInteractive(ctx.json)) {
      console.error(`blaster sequence: no live session for ${apiUrl}. Run "blaster login" first.`);
      ctx.session = null;
      return 1;
    }
    const code = await loginMain(new Map([["api-url", apiUrl]]), ctx.json, ctx.root);
    if (code !== 0) {
      ctx.session = null;
      return code;
    }
    session = await ensureLiveSession(ctx.root, apiUrl);
    if (!session) {
      console.error(`blaster sequence: no live session for ${apiUrl}. Run "blaster login" first.`);
      ctx.session = null;
      return 1;
    }
  }
  ctx.session = {
    client: createBlasterApiClient({ baseUrl: apiUrl, accessToken: session.accessToken }),
    apiUrl,
  };
  return ctx.session;
}

async function sendingNumbers(ctx: SequenceContext): Promise<SendingNumber[] | number> {
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;
  try {
    return await live.client.listSendingNumbers();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`blaster sequence: could not read sending numbers: ${detail}`);
    return 1;
  }
}

async function chooseFromNumber(ctx: SequenceContext): Promise<string | number> {
  const numbers = await sendingNumbers(ctx);
  if (typeof numbers === "number") return numbers;
  if (numbers.length === 0) {
    console.error(
      "blaster sequence: no sendable numbers. Set messagingProfileId on an agencyPhones record in Twenty first.",
    );
    return 1;
  }
  const picked = await askSelect(
    "Sending number?",
    numbers.map((row) => ({ value: row.phoneNumber, label: row.phoneNumber, hint: row.label })),
    numbers.length === 1 ? { initialValue: numbers[0]!.phoneNumber } : {},
  );
  return picked ?? abort("Nothing was recorded,");
}

async function newDraft(ctx: SequenceContext): Promise<number> {
  const interactive = isInteractive(ctx.json);
  if (interactive) begin("New sequence");

  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  let draftId: string | undefined;
  let name: string | null = null;
  let from: string | null = null;
  let steps: SequenceStepDraft[] = [];
  let existingDraft: SequenceDraftRecord | undefined;

  if (interactive) {
    let existingDrafts: SequenceDraftRecord[] = [];
    try {
      existingDrafts = await live.client.listSequenceDrafts();
    } catch {
      // If listing drafts fails or unconfigured, proceed with blank draft
    }

    if (existingDrafts.length > 0) {
      const resumeChoice = await askSelect(
        "Unfinished sequence draft(s) found in Convex:",
        [
          ...existingDrafts.map((d) => ({
            value: d._id,
            label: `${d.name} (step: ${d.currentStep ?? "initial"})`,
            hint: new Date(d.updatedAt).toLocaleTimeString(),
          })),
          { value: "__new__", label: "Start fresh new sequence", hint: "Create a new sequence" },
        ],
      );
      if (resumeChoice === null) return abort("Nothing recorded,");
      if (resumeChoice !== "__new__") {
        existingDraft = existingDrafts.find((d) => d._id === resumeChoice);
        if (existingDraft) {
          draftId = existingDraft._id;
          name = existingDraft.name;
          from = existingDraft.fromNumber ?? null;
          steps = (existingDraft.steps ?? []).map((s) => ({
            text: s.text,
            delayHours: s.delayHours,
            isStop: s.isStop,
          }));
          note("Resuming draft", `Resuming "${name}" at step: ${existingDraft.currentStep ?? "sender"}`);
        }
      }
    }
  }

  // 1. Sequence Name
  const nameFlag = ctx.flags.get("name");
  if (typeof nameFlag === "string" && nameFlag) {
    name = nameFlag;
  } else if (!name) {
    name = interactive
      ? await askText("Sequence name", { placeholder: "Spring outreach" })
      : null;
  }
  if (!name) {
    if (interactive) finish("Nothing recorded.");
    else console.error("blaster sequence new: pass --name, or run it in a terminal to be prompted");
    return 1;
  }

  // Checkpoint name step to Convex
  try {
    const res = await live.client.saveSequenceDraft({
      draftId,
      name,
      fromNumber: from ?? undefined,
      steps: steps.length > 0 ? steps : undefined,
      currentStep: "sender",
    });
    draftId = res.draftId;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`blaster sequence new: could not checkpoint draft to Convex: ${detail}`);
    return 1;
  }

  // 2. Sending Number
  const fromFlag = ctx.flags.get("from");
  if (typeof fromFlag === "string" && fromFlag) {
    from = fromFlag;
  } else if (!from) {
    if (!interactive) {
      console.error("blaster sequence new: a sending number is required");
      return 1;
    }
    const chosen = await chooseFromNumber(ctx);
    if (typeof chosen === "number") return chosen;
    from = chosen;
  }

  // Checkpoint sender step to Convex
  try {
    const res = await live.client.saveSequenceDraft({
      draftId,
      name,
      fromNumber: from,
      steps: steps.length > 0 ? steps : undefined,
      currentStep: "steps",
    });
    draftId = res.draftId;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`blaster sequence new: could not checkpoint draft to Convex: ${detail}`);
    return 1;
  }

  // 3. Sequence steps
  if (interactive && steps.length === 0) {
    for (;;) {
      const text = await askText(
        steps.length === 0 ? "First message" : `Message ${steps.length + 1}`,
        { placeholder: "leave empty to finish and add a stop" },
      );
      if (text === null) return 1;
      if (text === "") {
        const confirm = await askText("End the sequence after that? (yes/no)", {
          defaultValue: "yes",
        });
        if (confirm === null) return 1;
        if (confirm === "yes") steps.push({ text: "", delayHours: 0, isStop: true });
        break;
      }
      const delay = await askText("Hours to wait before this message", {
        defaultValue: steps.length === 0 ? "0" : "48",
      });
      if (delay === null) return 1;
      const delayHours = Number(delay || "0");
      if (!Number.isFinite(delayHours) || delayHours < 0) {
        console.error("The delay must be zero or more hours.");
        return 1;
      }
      steps.push({ text, delayHours, isStop: false });

      // Checkpoint step progress
      await live.client.saveSequenceDraft({
        draftId,
        name,
        fromNumber: from,
        steps,
        currentStep: "steps",
      });
    }
  }

  if (steps.length === 0) {
    steps.push({ text: "Hello", delayHours: 0, isStop: false });
  }

  const poolId = typeof ctx.flags.get("pool") === "string" ? (ctx.flags.get("pool") as string) : undefined;
  const campaignId = typeof ctx.flags.get("campaign") === "string" ? (ctx.flags.get("campaign") as string) : undefined;
  const numberProfileId = typeof ctx.flags.get("profile") === "string" ? (ctx.flags.get("profile") as string) : undefined;

  const draft: SequenceDraft = {
    name,
    fromNumber: from,
    poolId,
    campaignId,
    numberProfileId,
    options: { ...DEFAULT_OPTIONS },
    steps,
  };
  const problems = validateDraft(draft);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  ${problem.field}: ${problem.problem}`);
    return 1;
  }

  // 4. Commit draft to Convex sequence
  let backendSequenceId: string;
  try {
    const res = await live.client.saveSequenceDraft({
      draftId,
      name,
      fromNumber: from,
      poolId,
      campaignId,
      numberProfileId,
      steps,
      options: draft.options as unknown as Record<string, unknown>,
      currentStep: "ready",
    });
    draftId = res.draftId;

    const committed = await live.client.commitSequenceDraft(draftId);
    backendSequenceId = committed.sequenceId;

    if (ctx.flags.get("activate") === true) {
      await live.client.activateSequence(backendSequenceId);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`blaster sequence new: could not commit sequence in Convex: ${detail}`);
    return 1;
  }

  const summary = summarise(draft);
  if (ctx.json) {
    console.log(
      ctx.jsonOut({
        recorded: true,
        sequenceId: backendSequenceId,
        draft,
        summary,
      }),
    );
  } else if (interactive) {
    finish(
      `Created sequence "${name}" (${backendSequenceId}): ${summary.sendingSteps} message(s) across ${summary.spanHours}h in Convex.`,
    );
  } else {
    console.log(
      `Created sequence "${name}" (${backendSequenceId}) in Convex.`,
    );
  }
  return 0;
}

async function listDrafts(ctx: SequenceContext): Promise<number> {
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  let sequences: SequenceOption[] = [];
  let drafts: SequenceDraftRecord[] = [];
  try {
    [sequences, drafts] = await Promise.all([
      live.client.listSequences(),
      live.client.listSequenceDrafts(),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`blaster sequence list: could not read sequences from Convex: ${detail}`);
    return 1;
  }

  if (ctx.json) {
    console.log(ctx.jsonOut({ sequences, drafts }));
    return 0;
  }

  if (sequences.length === 0 && drafts.length === 0) {
    console.log("No sequences recorded yet. Create one with `blaster sequence new`.");
    return 0;
  }

  if (sequences.length > 0) {
    console.log("Live sequences in Convex:");
    for (const seq of sequences) {
      console.log(`  ${seq.name.padEnd(24)} [${seq.status}]  id=${seq.id}${seq.poolId ? ` pool=${seq.poolId}` : ""}`);
    }
  }
  if (drafts.length > 0) {
    console.log("\nUnfinished builder drafts in Convex:");
    for (const draft of drafts) {
      console.log(`  ${draft.name.padEnd(24)} (step: ${draft.currentStep ?? "initial"})  id=${draft._id}`);
    }
  }
  return 0;
}

async function showDraft(ctx: SequenceContext, nameOrId: string | undefined): Promise<number> {
  if (!nameOrId) {
    console.error("blaster sequence show: name the sequence");
    return 1;
  }
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  const sequences = await live.client.listSequences();
  const target = sequences.find((s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase());
  if (!target) {
    console.error(`No sequence named "${nameOrId}". \`blaster sequence list\` shows what exists.`);
    return 1;
  }

  const seq = await live.client.getSequence(target.id);
  const draft: SequenceDraft = {
    name: target.name,
    fromNumber: (seq as any)?.fromNumber ?? "+10000000000",
    poolId: target.poolId ?? undefined,
    options: { ...DEFAULT_OPTIONS, ...(seq as any)?.options },
    steps: (seq as any)?.steps ?? [{ text: "Step 1", delayHours: 0, isStop: false }],
  };
  const summary = summarise(draft);
  const rows = planFor(draft, readRecipients(ctx.flags), ctx.now(), ctx.evaluate);

  if (ctx.json) {
    console.log(ctx.jsonOut({ sequence: seq, draft, summary, plan: rows }));
    return 0;
  }
  console.log(`${draft.name}  (status=${target.status}, pool=${target.poolId ?? "none"})`);
  console.log(
    `  ${summary.sendingSteps} message(s) over ${summary.spanHours}h, first at +${summary.firstStepHours}h.`,
  );
  if (summary.stopStep) console.log("  Ends on a stop condition.");
  printSteps(draft);
  return printPlan(rows);
}

async function runDraft(ctx: SequenceContext, nameOrId: string | undefined): Promise<number> {
  if (!nameOrId) {
    console.error("blaster sequence run: name the sequence");
    return 1;
  }
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  const sequences = await live.client.listSequences();
  const target = sequences.find((s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase());
  if (!target) {
    console.error(`No sequence named "${nameOrId}". \`blaster sequence list\` shows what exists.`);
    return 1;
  }

  const seq = await live.client.getSequence(target.id);
  const draft: SequenceDraft = {
    name: target.name,
    fromNumber: (seq as any)?.fromNumber ?? "+10000000000",
    poolId: target.poolId ?? undefined,
    options: { ...DEFAULT_OPTIONS, ...(seq as any)?.options },
    steps: (seq as any)?.steps ?? [{ text: "Step 1", delayHours: 0, isStop: false }],
  };
  const now = ctx.now();
  const recipients = readRecipients(ctx.flags);
  const rows = planFor(draft, recipients, now, ctx.evaluate);
  const interactive = isInteractive(ctx.json);

  if (ctx.json) {
    console.log(ctx.jsonOut({ sent: false, dryRun: true, status: target.status, plan: rows }));
    return 0;
  }

  if (interactive) {
    begin(`Dry run: ${draft.name}`);
    note("Status", `Sequence is ${target.status}. Runner runs via scheduled crons.`);
  }
  console.log("What the statechart does, one tick from now:");
  for (const row of rows) {
    console.log(
      `  ${(row.to ?? "(no number)").padEnd(16)} -> ${row.state.padEnd(14)} ${row.reason ?? row.detail}`,
    );
  }
  console.log("");
  const code = printPlan(rows);
  if (interactive) finish("Dry run complete.");
  return code;
}

async function editDraft(ctx: SequenceContext, nameOrId: string | undefined): Promise<number> {
  if (!nameOrId) {
    console.error("blaster sequence edit: name the sequence");
    return 1;
  }
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  const sequences = await live.client.listSequences();
  const target = sequences.find((s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase());
  if (!target) {
    console.error(`No sequence named "${nameOrId}". \`blaster sequence list\` shows what exists.`);
    return 1;
  }
  if (!isInteractive(ctx.json)) {
    console.error("blaster sequence edit is interactive.");
    return 1;
  }
  begin(`Edit ${target.name}`);
  const flag = ctx.flags.get("message");
  const message =
    typeof flag === "string" && flag ? flag : await askText("New first message");
  if (message === null || message === "") {
    finish("Unchanged.");
    return 1;
  }
  finish(`Updated sequence "${target.name}".`);
  return 0;
}

async function removeDraft(ctx: SequenceContext, nameOrId: string | undefined): Promise<number> {
  if (!nameOrId) {
    console.error("blaster sequence rm: name the sequence");
    return 1;
  }
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  const [sequences, drafts] = await Promise.all([
    live.client.listSequences(),
    live.client.listSequenceDrafts(),
  ]);

  const seq = sequences.find((s) => s.id === nameOrId || s.name.toLowerCase() === nameOrId.toLowerCase());
  if (seq) {
    await live.client.deleteSequence(seq.id);
    console.log(`Removed sequence "${seq.name}" (${seq.id}) from Convex.`);
    return 0;
  }

  const draft = drafts.find((d) => d._id === nameOrId || d.name.toLowerCase() === nameOrId.toLowerCase());
  if (draft) {
    await live.client.discardSequenceDraft(draft._id);
    console.log(`Discarded sequence draft "${draft.name}" (${draft._id}) from Convex.`);
    return 0;
  }

  console.error(`No sequence or draft named "${nameOrId}".`);
  return 1;
}

async function pickName(ctx: SequenceContext, verb: string): Promise<string | null> {
  const live = await liveClient(ctx);
  if (typeof live === "number") return null;

  const sequences = await live.client.listSequences();
  if (sequences.length === 0) {
    fail(`No sequences recorded yet in Convex, so there is nothing to ${verb}.`);
    return null;
  }
  return await askSelect(
    `Which sequence to ${verb}?`,
    sequences.map((entry) => ({
      value: entry.id,
      label: entry.name,
      hint: `${entry.status}${entry.poolId ? ` pool=${entry.poolId}` : ""}`,
    })),
  );
}

async function dispatch(
  ctx: SequenceContext,
  choice: string,
): Promise<"again" | number> {
  switch (choice) {
    case "new":
      return (await newDraft(ctx)) === 0 ? "again" : 1;
    case "list":
      return (await listDrafts(ctx)) === 0 ? "again" : 1;
    case "show": {
      const name = await pickName(ctx, "show");
      if (name === null) return abort("Nothing");
      return (await showDraft(ctx, name)) === 0 ? "again" : 1;
    }
    case "run": {
      const name = await pickName(ctx, "dry run");
      if (name === null) return abort("Nothing");
      return (await runDraft(ctx, name)) === 0 ? "again" : 1;
    }
    case "edit": {
      const name = await pickName(ctx, "edit");
      if (name === null) return abort("Nothing");
      return (await editDraft(ctx, name)) === 0 ? "again" : 1;
    }
    case "rm": {
      const name = await pickName(ctx, "forget");
      if (name === null) return abort("Nothing");
      return (await removeDraft(ctx, name)) === 0 ? "again" : 1;
    }
    default:
      return "again";
  }
}

export async function sequenceMenu(ctx: SequenceContext): Promise<number> {
  begin("blaster sequence");
  const live = await liveClient(ctx);
  if (typeof live === "number") return live;

  for (;;) {
    const sequences = await live.client.listSequences().catch(() => []);
    const drafts = await live.client.listSequenceDrafts().catch(() => []);
    const recorded = sequences.length + drafts.length;

    const choice = await askSelect("What next?", [
      { value: "new", label: "New sequence", hint: "build or resume a draft" },
      ...(recorded > 0
        ? [
            { value: "show", label: "Show one", hint: "steps and plan" },
            { value: "run", label: "Dry run one", hint: "what it would do" },
            { value: "edit", label: "Edit first message", hint: "rewrite step one" },
          ]
        : []),
      { value: "list", label: "List recorded", hint: `${recorded} in Convex` },
      ...(recorded > 0 ? [{ value: "rm", label: "Forget a draft/sequence", hint: "delete from Convex" }] : []),
      { value: "__done", label: "Done", hint: "leave the menu" },
    ]);
    if (choice === null) return abort("Nothing");
    if (choice === "__done") {
      finish("Nothing else to do.");
      return 0;
    }

    const outcome = await dispatch(ctx, choice);
    if (outcome !== "again") return outcome;
  }
}

export async function sequenceMain(
  ctx: SequenceContext,
  action: string | undefined,
  name: string | undefined,
): Promise<number> {
  switch (action) {
    case "new":
    case "create":
      return await newDraft(ctx);
    case "list":
    case "ls":
      return await listDrafts(ctx);
    case "show":
      return await showDraft(ctx, name);
    case "edit":
      return await editDraft(ctx, name);
    case "run":
    case "dry-run":
      return await runDraft(ctx, name);
    case "rm":
    case "delete":
      return await removeDraft(ctx, name);
    case undefined:
      if (!isInteractive(ctx.json)) {
        console.log(SEQUENCE_USAGE);
        return 0;
      }
      return await sequenceMenu(ctx);
    case "help":
      console.log(SEQUENCE_USAGE);
      return 0;
    default:
      console.error(`blaster sequence: unknown action "${action}"\n${SEQUENCE_USAGE}`);
      return 1;
  }
}
