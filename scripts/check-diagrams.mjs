// Pre-push gate: the Mermaid diagrams parse, and the facts they assert are
// still true.
//
// A diagram that no longer matches the code is a defect, but nobody reads a
// diff of a `.mmd` file carefully enough to notice that a table was added or a
// component unmounted. That is what this gate is for. It does two things:
//
//   1. Parses every `.mmd` in docs/diagrams/ and every ```mermaid block in the
//      authored Markdown, with Mermaid's own parser. A diagram that does not
//      render is a broken diagram, and it fails here rather than in a README.
//
//   2. Re-derives each fact a diagram claims from the source tree, and fails if
//      the two disagree. A diagram opts in by putting a machine-readable
//      annotation in its header:
//
//        %% fact: schema-tables 15
//        %% fact: mounted-components 2
//
//      The annotation is deliberately redundant with the prose around it. The
//      prose is for the reader; the annotation is what this gate checks. If you
//      change the code and the diagram disagrees, you either fix the diagram or
//      you delete the annotation on purpose and say so in the commit.
//
//   3. Checks the *drawing* of any diagram that carries an `%% edge-chain:`
//      annotation, which names the node ids of a load-bearing path:
//
//        %% edge-chain: A>B>C
//
//      A fact pins what the diagram says about the code. It cannot see the
//      arrows, so step 2 alone lets someone reorder a flowchart and stay green.
//      This step reads the drawn edges out of the same source and requires every
//      consecutive pair to exist. It is a structural check, not a meaning one:
//      it proves the diagram contains that path, not that the path is right.
//
// This gate is deliberately narrow. It checks that the diagrams are *accurate*,
// not that they are *good*, and it never edits anything: a checker that
// rewrites documentation hides the drift instead of surfacing it.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const violations = [];
const notes = [];
const report = (m) => violations.push(m);

function read(path, reportFail = report) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    reportFail(`${relative(root, path)}: cannot be read.`);
    return "";
  }
}

function readAll(dir, ext, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) readAll(full, ext, acc);
    else if (name.endsWith(ext)) acc.push(full);
  }
  return acc;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

// ---------------------------------------------------------------------------
// Facts: each one is derived from the tree, never from the diagram.
// ---------------------------------------------------------------------------

/**
 * Comments and string-literal contents removed, newlines preserved so positions
 * still mean "line N of the file".
 *
 * Both have to go. A comment mentioning `sendMessage` before the real call site
 * would move `runner-gate-order`; so would a string literal containing two
 * markers, which is exactly what a mutation pass managed to do - a top-of-file
 * `const note = "mutations.claimStep mutations.consumeSender"` reordered the
 * chain while the real code stayed put. With both stripped, every ordering
 * marker has to be real code, which is what makes the fact mean anything.
 *
 * The consequence is that a marker may not be a string literal. The `no-number`
 * gate is pinned with `if (!to) {` rather than with the reason it writes.
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

export function stripLiterals(source) {
  return source.replace(/(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*)\1/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

/** Comments and string contents both blanked: only real code remains. */
export function stripNonCode(source) {
  return stripLiterals(stripComments(source));
}

/**
 * The order in which `markers` first appear in `source`, joined with `>`.
 *
 * This is what turns a diagram's arrows into something the gate can check. A
 * count cannot tell you that capacity is claimed before the step; the position
 * of two tokens in a file can. Comments and string literals are stripped first,
 * so neither can move a marker. Returns null when a marker is missing, so a
 * rename surfaces as a failing fact rather than as a silently shorter string.
 */
export function orderOf(rawSource, markers) {
  const source = stripNonCode(rawSource);
  const seen = [];
  let at = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, at + 1);
    if (next < 0) return null;
    seen.push(marker);
    at = next;
  }
  return seen.join(">");
}

/**
 * Every fact the diagrams are allowed to assert, derived from source.
 *
 * Adding a fact here is the only supported way to make a diagram checkable.
 * Each returns a string because that is what the annotation carries.
 */
export function facts(rootDir = root, report = () => {}) {
  const src = (p) => {
    try {
      return readFileSync(join(rootDir, p), "utf8");
    } catch {
      return "";
    }
  };

  const schemaModules = (() => {
    try {
      return readdirSync(join(rootDir, "convex/schema"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(rootDir, "convex/schema", f));
    } catch {
      report("convex/schema: cannot be read.");
      return [];
    }
  })();

  const tables = schemaModules.reduce(
    (n, f) => n + countMatches(src(relative(rootDir, f)), /^\s{2}\w+:\s*defineTable\(/gm),
    0,
  );

  const convexConfig = src("convex/convex.config.ts");
  const mounted = countMatches(convexConfig, /^\s*app\.use\(/gm);

  const crons = src("convex/crons.ts");
  const cronSeconds = /seconds:\s*(\d+)/.exec(crons)?.[1] ?? "";
  const cronLimit = /limit:\s*(\d+)/.exec(crons)?.[1] ?? "";
  // The comment above the cron states the interval too. Deriving it separately
  // is what stops the two drifting: change `{ seconds }` without the comment and
  // this fact disagrees with `cron-interval-seconds`, and the gate fails.
  const cronCommentSeconds = /(\d+)[- ]second/.exec(crons)?.[1] ?? "";

  const machine = src("packages/core/src/pipeline/sequence/machine.ts");
  // The top-level `on` block is the one immediately preceding `states: {`.
  // Counting events there is what distinguishes the stop conditions, which hold
  // from every state, from the state-local ones such as RESUME.
  const topLevelOn = /^\s{4}on:\s*\{([\s\S]*?)^\s{4}states:\s*\{/m.exec(machine)?.[1] ?? "";
  const topLevelEvents = countMatches(topLevelOn, /^\s{6}([A-Z_]+):/gm);

  // The `evaluating` state's `always` array, in the order the machine tests its
  // guards. A diagram that draws these nodes in a different order is wrong, and
  // a count cannot see it, so the order itself is the fact.
  const evaluatingAlways =
    /evaluating:\s*\{\s*entry:\s*"evaluateTick",\s*always:\s*\[([\s\S]*?)\n\s*\],/.exec(machine)?.[1] ?? "";
  const evaluatingOrder = [
    ...evaluatingAlways.matchAll(/guard:\s*"(\w+)"/g),
  ].map((m) => m[1]);

  const registry = src("packages/core/src/blaster/capabilities/helpers/registry.ts");
  const mcp = src("packages/blaster-mcp/src/mcp/index.ts");
  const guidance = src("packages/core/src/guidance/prompts/types.ts");

  // Ordering facts. These are the claims a reviewer is most likely to accept on
  // trust and never check: that a refusal cannot strand a claim, that sender
  // readiness is tested before eligibility, and that no send happens without a
  // capacity claim first. Each is the position of real tokens in real source.
  const runner = src("convex/sequence/actions.ts");
  const capacityCall = /claimSendCapacity,\s*\{([\s\S]*?)\}\);/.exec(runner)?.[1] ?? "";
  const capacityArgs = [...capacityCall.matchAll(/^\s{6}(\w+)[,:]/gm)].map((m) => m[1]);

  const conversationMutations = src("convex/conversations/mutations.ts");
  // One exported mutation, from its declaration to the next one. Matching on
  // the next `export const` rather than on a closing brace keeps this from
  // stopping at an inner object literal.
  const inbound =
    /export const recordInboundMessage[\s\S]*?(?=\nexport const|\n$)/.exec(conversationMutations)?.[0] ?? "";

  const profile = src("packages/core/src/telnyx/messaging/helpers/profile.ts");
  // The precedence order a diagram claims to show, read off the reason union.
  // The union is declared in the order the resolver can return them, which is
  // exactly the order the diagram draws, so the two cannot drift silently.
  const reasonUnion = /SelectionReason\s*=\s*([\s\S]*?);/.exec(profile)?.[1] ?? "";
  const profileReasons = [...reasonUnion.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);

  const breakdown = src("packages/core/src/pipeline/breakdown/helpers/build.ts");
  const apiIndex = src("apps/api/src/index.ts");
  const graphqlSession = src("packages/core/src/twenty/graphql/helpers/session.ts");

  let checkSteps = "";
  try {
    checkSteps = String(
      JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).scripts.check ?? "",
    )
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean).length;
  } catch {
    report("package.json: cannot be read.");
  }

  return {
    "schema-tables": String(tables),
    "schema-modules": String(schemaModules.length),
    "mounted-components": String(mounted),
    "cron-interval-seconds": cronSeconds,
    "cron-comment-seconds": cronCommentSeconds,
    "cron-limit": cronLimit,
    "machine-top-level-events": String(topLevelEvents),
    "machine-evaluating-order": evaluatingOrder.join(">"),
    "registry-entries": String(countMatches(registry, /id:\s*"/g)),
    // Markers are anchored on call sites (`ctx.runQuery(internal.x.y`, `foo({`)
    // rather than bare names, so an import or a type can never stand in for the
    // call being ordered.
    "runner-gate-order": String(
      orderOf(runner, [
        "dryRunEnrollment({",
        "telnyxAccounts.queries.usability,",
        "resolveAccountKey(convexEnv",
        "if (!to) {",
        "mutations.consumeSender",
        "mutations.claimSendCapacity",
        "mutations.claimStep",
        "sendMessage({",
      ]),
    ),
    "runner-capacity-args": capacityArgs.join(","),
    "inbound-stop-order": String(
      orderOf(inbound, ["args.providerEventId", "ctx.db.insert(", "stopEnrollmentsForPeer("]),
    ),
    "profile-reasons": profileReasons.join(","),
    "notification-rules": String(countMatches(breakdown, /id:\s*"/g)),
    "max-batch-prospects": /MAX_BATCH_PROSPECTS\s*=\s*(\d+)/.exec(apiIndex)?.[1] ?? "",
    "sequence-tables": String(
      countMatches(src("convex/schema/sequences.ts"), /^\s{2}\w+:\s*defineTable\(/gm),
    ),
    "graphql-expiry-code": /extensions\?\.code\s*===\s*"([A-Z_]+)"/.exec(graphqlSession)?.[1] ?? "",
    "mcp-tools": String(countMatches(mcp, /name:\s*"blaster_/g)),
    "guidance-seeds": String(
      new Set([...guidance.matchAll(/"([a-z]+\.[a-z-]+\.v\d+)"/g)].map((m) => m[1])).size,
    ),
    "check-chain-steps": String(checkSteps),
  };
}

/**
 * `%% fact: <name> <value>` annotations in a diagram or Markdown file.
 *
 * The comment marker is matched as a whole token - `%%` for Mermaid, `//` for a
 * TS or JS file. An earlier version of this used `(?:%|//)`, which matched a
 * single `%` and therefore never matched a Mermaid annotation: every fact in
 * every diagram was silently unchecked, and the gate reported OK. Written as
 * `(?:%{2}|//)` so the marker cannot be half-matched again, and asserted below in
 * `selfTest()` against a real `%%` annotation.
 */
export function assertedFacts(source) {
  const out = [];
  for (const m of source.matchAll(/^\s*(?:%{2}|\/\/)\s*fact:\s*(\S+)[ \t]+(\S.*?)\s*$/gm)) {
    out.push({ name: m[1], value: m[2] });
  }
  return out;
}

/**
 * `fact:` lines that `assertedFacts` could not parse.
 *
 * A line that names a fact but fails the value pattern used to be dropped, which
 * is how `runner-gate-order` stayed unchecked: its value held a space and the
 * old `(\S+)` never matched. An unparsed fact is a fact nobody checks, so it is
 * a violation rather than a skip.
 */
export function malformedFacts(source) {
  const parsed = new Set(assertedFacts(source).map((f) => `${f.name} ${f.value}`));
  const out = [];
  for (const m of source.matchAll(/^\s*(?:%{2}|\/\/)\s*fact:(.*)$/gm)) {
    const [name, ...rest] = m[1].trim().split(/\s+/);
    if (!name || !parsed.has(`${name} ${rest.join(" ")}`.trim())) out.push(m[0].trim());
  }
  return out;
}

/**
 * `%% edge-chain: A>B>C` - the load-bearing path a diagram claims to draw.
 *
 * The `fact:` annotations above are compared against source code, so they pin
 * what the diagram *says*, not the arrows it draws. Someone can rearrange the
 * flowchart, leave the annotation alone, and stay green. This annotation is the
 * missing half: the gate reads the drawn edges out of the same source and
 * requires every consecutive pair to exist, so a reordered drawing fails.
 *
 * Node ids are Mermaid ids, not labels. Only solid `A --> B` edges count;
 * dotted `-.->` notes are excluded so an annotation cannot lean on decoration.
 */
export function assertedEdgeChains(source) {
  const out = [];
  for (const m of source.matchAll(/^\s*%{2}\s*edge-chain:\s*(\S+)\s*$/gm)) {
    // `/` separates independent runs, so a diagram with more than one entry
    // point can state each of them in one annotation.
    for (const segment of m[1].split("/")) out.push(segment.split(">"));
  }
  return out;
}

/** Every drawn solid edge as a `from>to` key. Labels and shapes are ignored. */
export function drawnEdges(source) {
  const body = source.replace(/^\s*%{2}.*$/gm, "").replace(/\r/g, "");
  const edges = new Set();
  const id = (text) => /^\s*([A-Za-z0-9_]+)/.exec(text)?.[1];
  for (const line of body.split("\n")) {
    // Split on the arrow rather than matching it with one pattern: a label may
    // sit on either side of the arrow and a node label may contain `<br/>`,
    // which any single arrow regex ends up tripping over. A dotted `-.->` note
    // contains no `-->` and is therefore skipped.
    const parts = line.split("-->");
    if (parts.length < 2) continue;
    const from = id(parts[0]);
    const to = id(parts[parts.length - 1]);
    if (from && to) edges.add(`${from}>${to}`);
  }
  return edges;
}

/** Consecutive pairs in a chain that no drawn edge supports. */
export function brokenEdgeLinks(source, chain) {
  const edges = drawnEdges(source);
  const broken = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const key = `${chain[i]}>${chain[i + 1]}`;
    if (!edges.has(key)) broken.push(key);
  }
  return broken;
}

// ---------------------------------------------------------------------------
// Mermaid parsing
// ---------------------------------------------------------------------------

/**
 * Mermaid needs a DOM. jsdom is a devDependency for exactly this one call, and
 * nothing else in the repo imports it.
 */
async function parseAll(sources, reportFail = report) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;

  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

  for (const { label, source } of sources) {
    try {
      await mermaid.parse(source);
    } catch (error) {
      const first = String(error?.message ?? error).split("\n")[0];
      reportFail(`${label}: does not parse. ${first}`);
    }
  }
}

/** Every ```mermaid fenced block in a Markdown file. */
export function mermaidBlocks(markdown) {
  const blocks = [];
  const re = /```mermaid[^\n]*\n([\s\S]*?)```/g;
  for (const m of markdown.matchAll(re)) blocks.push(m[1]);
  return blocks;
}

/**
 * The index in docs/diagrams/README.md must list every diagram that exists.
 * A stale index is the failure mode this gate exists to prevent: the previous
 * version of that index claimed ten diagrams while twelve were on disk.
 */
function checkIndex(mmdFiles, indexSource, reportFail = report) {
  const listed = new Set(
    [...indexSource.matchAll(/\]\(([a-z0-9-]+\.mmd)\)/g)].map((m) => m[1]),
  );
  for (const file of mmdFiles) {
    const name = file.split(/[\\/]/).pop();
    if (!listed.has(name)) {
      reportFail(`docs/diagrams/README.md: does not list ${name}.`);
    }
  }
  for (const name of listed) {
    if (!mmdFiles.some((f) => f.endsWith(name))) {
      reportFail(`docs/diagrams/README.md: lists ${name}, which does not exist.`);
    }
  }
}

/** Mermaid source without its `%%` comment header. */
export function diagramBody(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*%%/.test(line))
    .join("\n")
    .trim();
}

/**
 * Every `mermaid` block embedded in Markdown must be a byte-for-byte copy of
 * some `.mmd` body.
 *
 * This is the rule that stops documentation drift. GitHub has no include, so
 * embedding a diagram in the README necessarily means copying it, and a copy is
 * a second source of truth that will silently go stale - the README already had
 * two diagrams that were hand-maintained rather than copied. Rather than trust
 * a convention, this makes a hand-written block a hard failure: if you want a
 * diagram in prose, add it to a `.mmd` and paste that file's body.
 */
function checkEmbeddedBlocksAreCopies(sources, bodies, reportFail = report) {
  for (const { label, source } of sources) {
    if (!label.includes("mermaid block")) continue;
    const body = diagramBody(source);
    if (!bodies.has(body)) {
      reportFail(
        `${label}: is not a copy of any docs/diagrams/*.mmd. Embedded diagrams must be pasted from the .mmd file so there is one source of truth; add the diagram as a .mmd first.`,
      );
    }
  }
}

/**
 * Run the whole gate.
 *
 * `rootDir` exists for the self-test: it points the gate at a throwaway tree so
 * the self-test can drive this exact function rather than a re-implementation of
 * one of its comparisons. Nothing else should pass it.
 *
 * Violations go into a list this call owns rather than the module-level one the
 * self-test writes to. Sharing them would mean a throwaway tree's complaints
 * about its own missing source files showed up as failures of the real gate.
 */
export async function run(options = {}) {
  const rootDir = options.rootDir ?? root;
  const diagramsDir = join(rootDir, "docs/diagrams");
  const found = [];
  const reportFail = (m) => found.push(m);

  const derived = facts(rootDir, reportFail);
  const mmdFiles = readAll(diagramsDir, ".mmd").sort();

  if (mmdFiles.length === 0) {
    reportFail("docs/diagrams: no .mmd files found.");
    return { violations: found, notes, derived };
  }

  const sources = [];
  for (const file of mmdFiles) {
    const label = relative(rootDir, file);
    sources.push({ label, source: read(file, reportFail) });
  }

  // Authored Markdown: the README and docs/, excluding vendored trees.
  const markdown = [];
  for (const f of [join(rootDir, "README.md"), ...readAll(join(rootDir, "docs"), ".md")]) {
    if (/vendor|node_modules|_generated/.test(f)) continue;
    markdown.push(f);
  }
  for (const file of markdown) {
    const source = read(file, reportFail);
    mermaidBlocks(source).forEach((block, i) => {
      sources.push({ label: `${relative(rootDir, file)} (mermaid block ${i + 1})`, source: block });
    });
  }

  // Facts asserted in diagrams and in embedded blocks.
  for (const { label, source } of sources) {
    for (const { name, value } of assertedFacts(source)) {
      if (!(name in derived)) {
        reportFail(
          `${label}: asserts an unknown fact "${name}". Add it to facts() in check-diagrams.mjs, or delete the annotation.`,
        );
        continue;
      }
      if (derived[name] !== value) {
        reportFail(
          `${label}: says ${name} is ${value}, but the code says ${derived[name]}. Fix the diagram or delete the annotation on purpose.`,
        );
      }
    }
  }

  for (const { label, source } of sources) {
    for (const line of malformedFacts(source)) {
      reportFail(`${label}: fact annotation could not be parsed, so it is not being checked: ${line}`);
    }
  }

  // Drawn arrows, checked against what the diagram claims to draw.
  for (const { label, source } of sources) {
    for (const chain of assertedEdgeChains(source)) {
      for (const link of brokenEdgeLinks(source, chain)) {
        reportFail(
          `${label}: edge-chain claims ${link}, but no drawn edge goes that way. Reorder the flowchart, or fix the annotation.`,
        );
      }
    }
  }

  checkIndex(mmdFiles, read(join(diagramsDir, "README.md"), reportFail), reportFail);

  const bodies = new Set(sources.filter((s) => s.label.endsWith(".mmd")).map((s) => diagramBody(s.source)));
  checkEmbeddedBlocksAreCopies(sources, bodies, reportFail);

  await parseAll(sources, reportFail);

  notes.push(`${mmdFiles.length} diagrams parsed.`);
  notes.push(`${sources.length} mermaid sources checked, including embedded blocks.`);
  return { violations: found, notes, derived };
}

// --- self-test -------------------------------------------------------------
// A gate that cannot fail is indistinguishable from no gate, so this proves it
// fails on a known-bad input: a diagram that does not parse, and a diagram that
// asserts a fact the code contradicts.
//
// The fact half of that drives `run()` itself against a throwaway tree. An
// earlier version re-implemented the comparison `derived[name] !== value` here
// and asserted on it, which proved nothing: if `run()` stopped comparing facts
// altogether, this self-test would still have passed.

/** A throwaway repo-shaped tree containing one diagram, and its path. */
function tempTree(name, diagram) {
  const base = mkdtempSync(join(tmpdir(), "check-diagrams-"));
  const dir = join(base, "docs/diagrams");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), diagram);
  // Both READMEs are read by the gate. An empty root README and an index that
  // lists only this file keep the self-test's complaints about the fact under
  // test rather than about an absent file.
  writeFileSync(join(base, "README.md"), "");
  writeFileSync(join(dir, "README.md"), `# Diagrams\n\n[${name}](${name})\n`);
  return base;
}

/** Facts deliberately derived without a diagram asserting them. Keep empty if possible. */
const UNASSERTED_ON_PURPOSE = [];

/** Only the violations about one fact, so an unrelated failure cannot pass for one. */
const complaintsAbout = (violations, fact) =>
  violations.filter((v) => v.includes(fact));

export async function selfTest() {
  const good = 'flowchart TD\n  A["a"] --> B["b"]';
  const bad = 'flowchart TD\n  A --> ]]]nope';
  const derived = facts();

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

  let threw = false;
  try {
    await mermaid.parse(bad);
  } catch {
    threw = true;
  }
  if (!threw) report("self-test: a diagram with broken syntax parsed cleanly.");
  else notes.push("self-test: unparseable diagram is rejected.");

  let threwGood = false;
  try {
    await mermaid.parse(good);
  } catch (error) {
    threwGood = true;
    report(`self-test: a valid diagram failed to parse. ${error?.message}`);
  }
  if (!threwGood) notes.push("self-test: valid diagram is accepted.");

  // The fact check must reject a value the code contradicts, through run().
  // The expected value is whatever this throwaway tree derives, not whatever the
  // real repo derives: the tree has no source, so its table count is its own.
  const probe = await run({ rootDir: tempTree("probe.mmd", "flowchart TD\n  A[\"a\"] --> B[\"b\"]\n") });
  const expected = probe.derived["schema-tables"];
  const wrongValue = String(Number(expected) + 1);
  const wrongTree = tempTree(
    "wrong-fact.mmd",
    `%% fact: schema-tables ${wrongValue}\nflowchart TD\n  A["a"] --> B["b"]\n`,
  );
  const wrongRun = await run({ rootDir: wrongTree });
  const wrongComplaints = complaintsAbout(wrongRun.violations, "schema-tables");
  if (wrongComplaints.length === 0) {
    report("self-test: run() accepted a diagram asserting a fact the code contradicts.");
  } else {
    notes.push("self-test: run() rejects a contradicted fact.");
  }

  // And it must accept the value the code actually derives, or "reject
  // everything" would pass the check above.
  const rightTree = tempTree(
    "right-fact.mmd",
    `%% fact: schema-tables ${expected}\nflowchart TD\n  A["a"] --> B["b"]\n`,
  );
  const rightRun = await run({ rootDir: rightTree });
  const rightComplaints = complaintsAbout(rightRun.violations, "schema-tables");
  if (rightComplaints.length > 0) {
    report("self-test: run() rejected a fact the code agrees with.");
  } else {
    notes.push("self-test: run() accepts a fact the code agrees with.");
  }

  // The arrow half. A fact annotation pins what a diagram says about the code;
  // an edge-chain annotation pins the drawing itself, so reordering the
  // flowchart while leaving the prose alone has to fail.
  const reorderedTree = tempTree(
    "reordered.mmd",
    '%% edge-chain: A>B>C\nflowchart TD\n  A["a"] --> C["c"]\n  C --> B["b"]\n',
  );
  const reorderedRun = await run({ rootDir: reorderedTree });
  if (complaintsAbout(reorderedRun.violations, "edge-chain").length === 0) {
    report("self-test: run() accepted an edge-chain the drawing does not follow.");
  } else {
    notes.push("self-test: run() rejects an edge-chain the drawing contradicts.");
  }

  const drawnTree = tempTree(
    "drawn.mmd",
    '%% edge-chain: A>B>C\nflowchart TD\n  A["a"] --> B["b"]\n  B -- yes --> C["c"]\n',
  );
  const drawnRun = await run({ rootDir: drawnTree });
  if (complaintsAbout(drawnRun.violations, "edge-chain").length > 0) {
    report("self-test: run() rejected an edge-chain the drawing does follow.");
  } else {
    notes.push("self-test: run() accepts an edge-chain the drawing follows.");
  }

  // The gate must also reject a fact it does not know, so a typo in an
  // annotation is not silently inert.
  const unknownTree = tempTree(
    "unknown-fact.mmd",
    `%% fact: no-such-fact 1\nflowchart TD\n  A["a"] --> B["b"]\n`,
  );
  const unknownRun = await run({ rootDir: unknownTree });
  if (complaintsAbout(unknownRun.violations, "no-such-fact").length === 0) {
    report("self-test: run() accepted an annotation naming a fact it does not know.");
  } else {
    notes.push("self-test: run() rejects an unknown fact name.");
  }

  if (mermaidBlocks("text\n```mermaid\nflowchart TD\n  A-->B\n```\n").length !== 1) {
    report("self-test: fenced mermaid block extraction is wrong.");
  } else {
    notes.push("self-test: fenced block extraction works.");
  }

  // The annotation reader must see a Mermaid `%%` annotation and a `//` one. A
  // marker regex that matches only half of `%%` leaves every diagram's facts
  // unchecked while the gate still reports OK, which is the worst failure this
  // gate can have and the cheapest to test for.
  const parsedFacts = assertedFacts("%% fact: alpha 1\n// fact: beta 2\n  %% fact: gamma 3\n");
  if (parsedFacts.length !== 3 || parsedFacts[0].name !== "alpha" || parsedFacts[2].name !== "gamma") {
    report(
      `self-test: fact annotations were not read back correctly (${JSON.stringify(parsedFacts)}). A diagram's \`%% fact:\` lines are silently ignored when this fails, so the gate passes on unchecked diagrams.`,
    );
  } else {
    notes.push("self-test: `%%` and `//` fact annotations are both read.");
  }

  // And the real diagrams must actually carry facts. If none of them do, the
  // reader above can be correct and the gate still checks nothing.
  const realDiagrams = readAll(join(root, "docs/diagrams"), ".mmd");
  const annotated = realDiagrams.filter((f) => assertedFacts(read(f)).length > 0);
  if (realDiagrams.length > 0 && annotated.length === 0) {
    report(
      "self-test: no diagram in docs/diagrams carries a fact annotation, so the gate is checking nothing. Annotate at least one, or delete the fact machinery.",
    );
  } else {
    notes.push(`self-test: ${annotated.length} of ${realDiagrams.length} diagrams carry fact annotations.`);
  }

  // An annotation the reader cannot parse must fail loudly, not vanish.
  const malformedTree = tempTree(
    "malformed.mmd",
    '%% fact: schema-tables\nflowchart TD\n  A["a"] --> B["b"]\n',
  );
  const malformedRun = await run({ rootDir: malformedTree });
  if (complaintsAbout(malformedRun.violations, "could not be parsed").length === 0) {
    report("self-test: run() ignored a fact annotation it could not parse.");
  } else {
    notes.push("self-test: run() rejects an unparseable fact annotation.");
  }
  const spaced = assertedFacts('%% fact: spaced a "b" c>d\n');
  if (spaced.length !== 1 || spaced[0].value !== 'a "b" c>d') {
    report("self-test: a fact value containing spaces was not read back whole.");
  } else {
    notes.push("self-test: fact values may contain spaces.");
  }

  // Coverage: every fact facts() derives must be asserted by some real diagram,
  // or be listed in UNASSERTED_ON_PURPOSE. A fact nobody asserts is decoration,
  // which is how the dead `%%` regex went unnoticed.
  const unasserted = new Set(Object.keys(derived));
  for (const f of realDiagrams) {
    for (const { name } of assertedFacts(read(f))) unasserted.delete(name);
  }
  for (const name of UNASSERTED_ON_PURPOSE) unasserted.delete(name);
  if (unasserted.size > 0) {
    report(`self-test: facts derived but asserted by no diagram: ${[...unasserted].join(", ")}.`);
  } else {
    notes.push("self-test: every derived fact is asserted by a diagram.");
  }

  return { violations, notes, derived };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const selfTesting = process.argv.includes("--self-test");
  const { violations: v, notes: n, derived } = selfTesting ? await selfTest() : await run();
  if (!selfTesting) {
    for (const [k, val] of Object.entries(derived)) notes.push(`  fact ${k} = ${val}`);
  }
  for (const line of n) console.log(`  ${line}`);
  if (v.length > 0) {
    console.error("\npre-push: FAILED");
    for (const line of v) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log("\npre-push: OK - diagrams parse and their asserted facts are true.");
}
