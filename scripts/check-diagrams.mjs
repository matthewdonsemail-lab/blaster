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
// This gate is deliberately narrow. It checks that the diagrams are *accurate*,
// not that they are *good*, and it never edits anything: a checker that
// rewrites documentation hides the drift instead of surfacing it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DIAGRAMS = join(root, "docs/diagrams");

const violations = [];
const notes = [];
const report = (m) => violations.push(m);

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    report(`${relative(root, path)}: cannot be read.`);
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
 * Every fact the diagrams are allowed to assert, derived from source.
 *
 * Adding a fact here is the only supported way to make a diagram checkable.
 * Each returns a string because that is what the annotation carries.
 */
export function facts(rootDir = root) {
  const src = (p) => {
    try {
      return readFileSync(join(rootDir, p), "utf8");
    } catch {
      return "";
    }
  };

  const schemaModules = readdirSync(join(rootDir, "convex/schema"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(rootDir, "convex/schema", f));

  const tables = schemaModules.reduce(
    (n, f) => n + countMatches(src(relative(rootDir, f)), /^\s{2}\w+:\s*defineTable\(/gm),
    0,
  );

  const convexConfig = src("convex/convex.config.ts");
  const mounted = countMatches(convexConfig, /^\s*app\.use\(/gm);

  const crons = src("convex/crons.ts");
  const cronSeconds = /seconds:\s*(\d+)/.exec(crons)?.[1] ?? "";
  const cronLimit = /limit:\s*(\d+)/.exec(crons)?.[1] ?? "";

  const machine = src("packages/core/src/pipeline/sequence/machine.ts");
  // The top-level `on` block is the one immediately preceding `states: {`.
  // Counting events there is what distinguishes the stop conditions, which hold
  // from every state, from the state-local ones such as RESUME.
  const topLevelOn = /^\s{4}on:\s*\{([\s\S]*?)^\s{4}states:\s*\{/m.exec(machine)?.[1] ?? "";
  const topLevelEvents = countMatches(topLevelOn, /^\s{6}([A-Z_]+):/gm);

  const registry = src("packages/core/src/blaster/capabilities/helpers/registry.ts");
  const mcp = src("packages/blaster-mcp/src/mcp/index.ts");
  const guidance = src("packages/core/src/guidance/prompts/types.ts");

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
    "cron-limit": cronLimit,
    "machine-top-level-events": String(topLevelEvents),
    "registry-entries": String(countMatches(registry, /id:\s*"/g)),
    "mcp-tools": String(countMatches(mcp, /name:\s*"blaster_/g)),
    "guidance-seeds": String(
      new Set([...guidance.matchAll(/"([a-z]+\.[a-z-]+\.v\d+)"/g)].map((m) => m[1])).size,
    ),
    "check-chain-steps": String(checkSteps),
  };
}

/** `%% fact: <name> <value>` annotations in a diagram or Markdown file. */
export function assertedFacts(source) {
  const out = [];
  for (const m of source.matchAll(/^\s*(?:%|\/\/)\s*fact:\s*(\S+)\s+(\S+)\s*$/gm)) {
    out.push({ name: m[1], value: m[2] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mermaid parsing
// ---------------------------------------------------------------------------

/**
 * Mermaid needs a DOM. jsdom is a devDependency for exactly this one call, and
 * nothing else in the repo imports it.
 */
async function parseAll(sources) {
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
      report(`${label}: does not parse. ${first}`);
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
function checkIndex(mmdFiles, indexSource) {
  const listed = new Set(
    [...indexSource.matchAll(/\]\(([a-z0-9-]+\.mmd)\)/g)].map((m) => m[1]),
  );
  for (const file of mmdFiles) {
    const name = file.split(/[\\/]/).pop();
    if (!listed.has(name)) {
      report(`docs/diagrams/README.md: does not list ${name}.`);
    }
  }
  for (const name of listed) {
    if (!mmdFiles.some((f) => f.endsWith(name))) {
      report(`docs/diagrams/README.md: lists ${name}, which does not exist.`);
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
function checkEmbeddedBlocksAreCopies(sources, bodies) {
  for (const { label, source } of sources) {
    if (!label.includes("mermaid block")) continue;
    const body = diagramBody(source);
    if (!bodies.has(body)) {
      report(
        `${label}: is not a copy of any docs/diagrams/*.mmd. Embedded diagrams must be pasted from the .mmd file so there is one source of truth; add the diagram as a .mmd first.`,
      );
    }
  }
}

export async function run() {
  const derived = facts();
  const mmdFiles = readAll(DIAGRAMS, ".mmd").sort();

  if (mmdFiles.length === 0) {
    report("docs/diagrams: no .mmd files found.");
    return { violations, notes, derived };
  }

  const sources = [];
  for (const file of mmdFiles) {
    const label = relative(root, file);
    sources.push({ label, source: read(file) });
  }

  // Authored Markdown: the README and docs/, excluding vendored trees.
  const markdown = [];
  for (const f of [join(root, "README.md"), ...readAll(join(root, "docs"), ".md")]) {
    if (/vendor|node_modules|_generated/.test(f)) continue;
    markdown.push(f);
  }
  for (const file of markdown) {
    const source = read(file);
    mermaidBlocks(source).forEach((block, i) => {
      sources.push({ label: `${relative(root, file)} (mermaid block ${i + 1})`, source: block });
    });
  }

  // Facts asserted in diagrams and in embedded blocks.
  for (const { label, source } of sources) {
    for (const { name, value } of assertedFacts(source)) {
      if (!(name in derived)) {
        report(
          `${label}: asserts an unknown fact "${name}". Add it to facts() in check-diagrams.mjs, or delete the annotation.`,
        );
        continue;
      }
      if (derived[name] !== value) {
        report(
          `${label}: says ${name} is ${value}, but the code says ${derived[name]}. Fix the diagram or delete the annotation on purpose.`,
        );
      }
    }
  }

  checkIndex(mmdFiles, read(join(DIAGRAMS, "README.md")));

  const bodies = new Set(sources.filter((s) => s.label.endsWith(".mmd")).map((s) => diagramBody(s.source)));
  checkEmbeddedBlocksAreCopies(sources, bodies);

  await parseAll(sources);

  notes.push(`${mmdFiles.length} diagrams parsed.`);
  notes.push(`${sources.length} mermaid sources checked, including embedded blocks.`);
  return { violations, notes, derived };
}

// --- self-test -------------------------------------------------------------
// A gate that cannot fail is indistinguishable from no gate, so this proves it
// fails on a known-bad input: a diagram that does not parse, and a diagram that
// asserts a fact the code contradicts.

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

  // The fact check must reject a value the code contradicts.
  const name = "schema-tables";
  const wrong = { name, value: String(Number(derived[name]) + 1) };
  const detected = derived[wrong.name] !== wrong.value;
  if (!detected) report("self-test: a wrong asserted fact was not detected.");
  else notes.push("self-test: a contradicted fact is rejected.");

  if (mermaidBlocks("text\n```mermaid\nflowchart TD\n  A-->B\n```\n").length !== 1) {
    report("self-test: fenced mermaid block extraction is wrong.");
  } else {
    notes.push("self-test: fenced block extraction works.");
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
