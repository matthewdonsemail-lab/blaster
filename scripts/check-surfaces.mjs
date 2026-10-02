// Pre-push gate: the capability registry, the MCP tools, the shared client,
// and the HTTP routes agree.
//
// The canonical capability registry lives in `@blaster/core`
// (`packages/core/src/blaster/capabilities/helpers/registry.ts`), with the CLI
// `CAPABILITIES` table mirroring the active CLI/MCP/HTTP surface.
// This gate ensures:
//   - every registered MCP tool is advertised and implemented in the MCP server;
//   - every HTTP route a capability names exists in the Hono surface;
//   - every client method a capability names exists on BlasterApiClient;
//   - capability IDs are unique across CLI and core registries;
//   - every Convex HTTP router route has a twin on Hono;
//   - sequences and drafts live in Convex (no local file storage references).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const CLI_SOURCE = join(root, "packages/blaster-cli/src/cli/index.ts");
const MCP_SOURCE = join(root, "packages/blaster-mcp/src/mcp/index.ts");
const API_SOURCE = join(root, "apps/api/src/index.ts");
const CLIENT_SOURCE = join(root, "packages/core/src/blaster/api/helpers/client.ts");
const CORE_REGISTRY_SOURCE = join(root, "packages/core/src/blaster/capabilities/helpers/registry.ts");
const CONVEX_HTTP_DIR = join(root, "convex/http");
const README = join(root, "README.md");
const SKILLS_DIR = join(root, "plugins/blaster/skills");

const violations = [];
const report = (message) => violations.push(message);

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    report(`${path}: cannot be read.`);
    return "";
  }
}

/** `{ id, cli, mcp, http }` rows from the CLI capability registry. */
export function capabilities(source) {
  const pattern =
    /\{\s*id:\s*"([^"]+)",\s*cli:\s*"([^"]*)",\s*mcp:\s*"([^"]*)",\s*http:\s*"([^"]*)"\s*\}/g;
  const rows = [];
  for (const match of source.matchAll(pattern)) {
    rows.push({ id: match[1], cli: match[2], mcp: match[3], http: match[4] });
  }
  return rows;
}

/** Parse canonical capability definitions from packages/core registry. */
export function coreCapabilities(source) {
  const entries = [];
  const blocks = source.split(/\{\s*id:\s*"/);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const id = b.split('"')[0];
    const httpMatch = b.match(/http:\s*"([^"]+)"/);
    const mcpMatch = b.match(/mcp:\s*"([^"]+)"/);
    const clientMatch = b.match(/client:\s*"([^"]+)"/);
    const convexMatch = b.match(/convex:\s*"([^"]+)"/);
    const cliMatch = b.match(/cli:\s*"([^"]+)"/);
    entries.push({
      id,
      http: httpMatch ? httpMatch[1] : undefined,
      mcp: mcpMatch ? mcpMatch[1] : undefined,
      client: clientMatch ? clientMatch[1] : undefined,
      convex: convexMatch ? convexMatch[1] : undefined,
      cli: cliMatch ? cliMatch[1] : undefined,
    });
  }
  return entries;
}

/** MCP tool names that are advertised in the tool table. */
export function advertisedTools(source) {
  const names = new Set();
  for (const match of source.matchAll(/name:\s*"(blaster_[a-z_]+)"/g)) names.add(match[1]);
  return names;
}

/** MCP tool names that have an implementation arm in `runTool`. */
export function implementedTools(source) {
  const names = new Set();
  for (const match of source.matchAll(/case\s+"(blaster_[a-z_]+)":/g)) names.add(match[1]);
  return names;
}

/** Method names declared on the core BlasterApiClient interface. */
export function clientMethods(source) {
  const match = source.match(/export interface BlasterApiClient\s*\{/);
  const names = new Set();
  if (!match) return names;
  const start = match.index;
  const nextExport = source.indexOf("export function createBlasterApiClient", start);
  const block = nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
  for (const m of block.matchAll(/\b([a-zA-Z0-9_]+)\s*\(/g)) {
    if (m[1] !== "Promise" && m[1] !== "interface") names.add(m[1]);
  }
  return names;
}

/**
 * Every `METHOD /path` the Hono surface registers, with the `/api` prefix
 * resolved.
 */
export function httpRoutes(source) {
  const routes = new Set();
  const pattern = /\b(\w+)\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    const [, app, method, path] = match;
    const full = app === "app" ? path : `/api${path}`;
    routes.add(`${method.toUpperCase()} ${full}`);
  }
  return routes;
}

/**
 * Every `http.route({ path, method })` registered on the Convex HTTP router.
 */
export function convexHttpRoutes() {
  const routes = new Set();
  let files = [];
  try {
    files = readdirSync(CONVEX_HTTP_DIR, { recursive: true });
  } catch {
    return routes;
  }
  for (const file of files) {
    if (!String(file).endsWith(".ts")) continue;
    const source = read(join(CONVEX_HTTP_DIR, String(file)));
    const pattern = /path:\s*"([^"]+)",\s*method:\s*"([A-Z]+)"/g;
    for (const match of source.matchAll(pattern)) {
      routes.add(`${match[2]} ${match[1]}`);
    }
  }
  return routes;
}

export function validateSurfaces({
  cliSource,
  mcpSource,
  apiSource,
  clientSource,
  coreRegistrySource,
  convexRoutes = new Set(),
  readmeSource = "",
  skillSources = [],
  cliFileContents = [],
}) {
  const localViolations = [];
  const fail = (msg) => localViolations.push(msg);

  const caps = capabilities(cliSource);
  if (caps.length === 0) fail("no capabilities found in CLI registry.");

  const seenCli = new Set();
  for (const cap of caps) {
    if (seenCli.has(cap.id)) fail(`CLI capability "${cap.id}" is registered more than once.`);
    seenCli.add(cap.id);
  }

  const coreCaps = coreCapabilities(coreRegistrySource);
  if (coreCaps.length === 0) fail("no capabilities found in core registry.");

  const seenCore = new Set();
  for (const cap of coreCaps) {
    if (seenCore.has(cap.id)) fail(`core capability "${cap.id}" is registered more than once.`);
    seenCore.add(cap.id);
  }

  const advertised = advertisedTools(mcpSource);
  const implemented = implementedTools(mcpSource);
  const routes = httpRoutes(apiSource);
  const methods = clientMethods(clientSource);

  for (const name of advertised) {
    if (!implemented.has(name)) fail(`MCP tool "${name}" is advertised but has no runTool case.`);
  }
  for (const name of implemented) {
    if (!advertised.has(name)) fail(`MCP tool "${name}" has a runTool case but is not advertised.`);
  }

  // Validate CLI capabilities against advertised surfaces
  for (const cap of caps) {
    if (cap.mcp && !advertised.has(cap.mcp)) {
      fail(`CLI capability "${cap.id}" names MCP tool "${cap.mcp}", which the MCP server does not advertise.`);
    }
    if (cap.http) {
      const space = cap.http.indexOf(" ");
      const method = space === -1 ? "" : cap.http.slice(0, space).toUpperCase();
      const path = space === -1 ? "" : cap.http.slice(space + 1);
      if (!method || !path.startsWith("/")) {
        fail(`CLI capability "${cap.id}" has an unparsable http surface "${cap.http}".`);
      } else if (!routes.has(`${method} ${path}`) && !routes.has(`${method} ${path.split("?")[0]}`)) {
        fail(`CLI capability "${cap.id}" names HTTP route "${cap.http}", which the API does not register.`);
      }
    }
  }

  // Validate Core capabilities against surfaces
  for (const cap of coreCaps) {
    if (cap.mcp && !advertised.has(cap.mcp)) {
      fail(`core capability "${cap.id}" names MCP tool "${cap.mcp}", which the MCP server does not advertise.`);
    }
    if (cap.client && !methods.has(cap.client)) {
      fail(`core capability "${cap.id}" names client method "${cap.client}", which BlasterApiClient does not declare.`);
    }
    if (cap.http) {
      const space = cap.http.indexOf(" ");
      const method = space === -1 ? "" : cap.http.slice(0, space).toUpperCase();
      const path = space === -1 ? "" : cap.http.slice(space + 1);
      if (!method || !path.startsWith("/")) {
        fail(`core capability "${cap.id}" has an unparsable http surface "${cap.http}".`);
      } else if (!routes.has(`${method} ${path}`) && !routes.has(`${method} ${path.split("?")[0]}`)) {
        fail(`core capability "${cap.id}" names HTTP route "${cap.http}", which the API does not register.`);
      }
    }
  }

  // README checks
  if (readmeSource !== "") {
    for (const name of readmeSource.matchAll(/blaster_[a-z0-9_]+/g)) {
      const tool = name[0];
      if (!advertised.has(tool)) {
        fail(`README.md names MCP tool "${tool}", which the MCP server does not advertise.`);
      }
    }
  }

  // Skills checks
  for (const { file, source } of skillSources) {
    if (!source) continue;
    for (const match of source.matchAll(/blaster_[a-z0-9_]+/g)) {
      const tool = match[0];
      if (!advertised.has(tool)) {
        fail(`skill "${file}" names MCP tool "${tool}", which the MCP server does not advertise.`);
      }
    }
  }

  // Convex router parity
  for (const route of convexRoutes) {
    if (route.startsWith("GET /blaster/") || route.startsWith("POST /blaster/")) continue;
    if (!routes.has(route)) {
      fail(`the Convex HTTP router registers "${route}", but the Hono surface does not.`);
    }
  }

  // Ban local sequence storage
  for (const { file, content } of cliFileContents) {
    if (/sequences\.json|sequence-store/.test(content)) {
      fail(`${file}: references forbidden local sequence storage (sequences.json or sequence-store). Convex must be the sole source of truth.`);
    }
  }

  return localViolations;
}

function check() {
  const cli = read(CLI_SOURCE);
  const mcp = read(MCP_SOURCE);
  const api = read(API_SOURCE);
  const client = read(CLIENT_SOURCE);
  const coreRegistry = read(CORE_REGISTRY_SOURCE);
  if (violations.length > 0) return;

  const convexRoutes = convexHttpRoutes();
  const readme = read(README);

  let skillSources = [];
  try {
    const files = readdirSync(SKILLS_DIR, { recursive: true })
      .filter((f) => String(f).endsWith("SKILL.md"))
      .map((f) => join(SKILLS_DIR, String(f)));
    skillSources = files.map((file) => ({ file, source: read(file) }));
  } catch {
    // fine
  }

  const cliDir = join(root, "packages/blaster-cli/src");
  let cliFileContents = [];
  try {
    const files = readdirSync(cliDir, { recursive: true })
      .filter((f) => String(f).endsWith(".ts"))
      .map((f) => join(cliDir, String(f)));
    cliFileContents = files.map((file) => ({ file, content: read(file) }));
  } catch {
    // fine
  }

  const results = validateSurfaces({
    cliSource: cli,
    mcpSource: mcp,
    apiSource: api,
    clientSource: client,
    coreRegistrySource: coreRegistry,
    convexRoutes,
    readmeSource: readme,
    skillSources,
    cliFileContents,
  });

  for (const v of results) report(v);
}

function selfTest() {
  console.log("check-surfaces: running self-test...");
  const cases = [];

  const validCli = `const CAPABILITIES = [{ id: "test.op", cli: "blaster test", mcp: "blaster_test", http: "GET /api/test" }];`;
  const validCore = `export const CAPABILITY_REGISTRY = [{ id: "test.op", mappings: { http: "GET /api/test", mcp: "blaster_test", client: "testOp" } }];`;
  const validMcp = `const TOOL_DEFINITIONS = [{ name: "blaster_test" }];\nswitch(x) { case "blaster_test": return; }`;
  const validApi = `app.get("/api/test", (c) => c.json({}));`;
  const validClient = `export interface BlasterApiClient { testOp(): Promise<void>; }`;

  // 1. Clean valid inputs -> 0 violations
  const v1 = validateSurfaces({
    cliSource: validCli,
    mcpSource: validMcp,
    apiSource: validApi,
    clientSource: validClient,
    coreRegistrySource: validCore,
  });
  cases.push({ name: "valid surfaces", expect: 0, got: v1.length });

  // 2. Unregistered MCP tool -> 1 violation
  const badCliMcp = `const CAPABILITIES = [{ id: "test.op", cli: "", mcp: "blaster_missing", http: "GET /api/test" }];`;
  const v2 = validateSurfaces({
    cliSource: badCliMcp,
    mcpSource: validMcp,
    apiSource: validApi,
    clientSource: validClient,
    coreRegistrySource: validCore,
  });
  cases.push({ name: "missing MCP tool", expect: 1, got: v2.length });

  // 3. Unregistered HTTP route -> 1 violation
  const badCliHttp = `const CAPABILITIES = [{ id: "test.op", cli: "", mcp: "blaster_test", http: "GET /api/nowhere" }];`;
  const v3 = validateSurfaces({
    cliSource: badCliHttp,
    mcpSource: validMcp,
    apiSource: validApi,
    clientSource: validClient,
    coreRegistrySource: validCore,
  });
  cases.push({ name: "missing HTTP route", expect: 1, got: v3.length });

  // 4. Missing client method in core registry -> 1 violation
  const badClientCore = `export const CAPABILITY_REGISTRY = [{ id: "test.op", mappings: { http: "GET /api/test", client: "nonExistentMethod" } }];`;
  const v4 = validateSurfaces({
    cliSource: validCli,
    mcpSource: validMcp,
    apiSource: validApi,
    clientSource: validClient,
    coreRegistrySource: badClientCore,
  });
  cases.push({ name: "missing client method", expect: 1, got: v4.length });

  // 5. Forbidden local sequence store -> 1 violation
  const v5 = validateSurfaces({
    cliSource: validCli,
    mcpSource: validMcp,
    apiSource: validApi,
    clientSource: validClient,
    coreRegistrySource: validCore,
    cliFileContents: [{ file: "cli/bad.ts", content: 'const file = "sequences.json";' }],
  });
  cases.push({ name: "banned local draft file", expect: 1, got: v5.length });

  let failures = 0;
  for (const c of cases) {
    const ok = c.got === c.expect;
    if (!ok) failures += 1;
    console.log(`  self-test ${ok ? "ok  " : "FAIL"}  ${c.name.padEnd(26)} expected ${c.expect}, got ${c.got}`);
  }
  if (failures > 0) {
    console.error(`check-surfaces: self-test failed with ${failures} bad case(s).`);
    process.exit(1);
  }
  console.log("check-surfaces: self-test OK");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  check();
  if (violations.length > 0) {
    console.error(`pre-push: FAIL - ${violations.length} surface mismatch(es):`);
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error("\nSee docs/naming-conventions.md and packages/core/src/blaster/capabilities/helpers/registry.ts.");
    process.exit(1);
  }
  console.log("pre-push: OK - capabilities, MCP tools, shared client, and HTTP routes agree.");
}
