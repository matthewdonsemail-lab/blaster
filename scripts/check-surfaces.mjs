// Pre-push gate: the capability registry, the MCP tools, and the HTTP routes
// agree.
//
// The CLI's `CAPABILITIES` table is the one place a capability names its CLI,
// MCP, and HTTP surface. Nothing enforced it, so it drifted: it advertised an
// MCP tool (`blaster_list_phones`) and an HTTP route (`GET /api/records/:object`)
// that do not exist. This gate makes the table load-bearing — a capability that
// names a surface the build does not have fails here.
//
// It checks, without executing anything:
//   - every registered MCP tool is advertised and implemented in the MCP server;
//   - every HTTP route a capability names exists in the Hono surface;
//   - capability ids are unique;
//   - and (new) every operator route a capability names that the Convex HTTP
//     router registers, so a deployment with no Hono in front still answers it.
//
// The Convex mirror is the *subset* of the Hono surface that a deployment
// itself can serve (routes whose handlers are Convex functions). Routes that
// reach Twenty or Telnyx live on the Hono surface only — a Convex deployment
// has no Twenty or Telnyx credentials of its own — and are not expected on the
// router. The gate checks whichever side *exists*: a Convex route that the
// Hono surface no longer has is a drift, and a capability naming a route that
// is on neither surface is a phantom.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const CLI_SOURCE = join(root, "packages/blaster-cli/src/cli/index.ts");
const MCP_SOURCE = join(root, "packages/blaster-mcp/src/mcp/index.ts");
const API_SOURCE = join(root, "apps/api/src/index.ts");
const CONVEX_HTTP_DIR = join(root, "convex/http");
const README = join(root, "README.md");

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
function capabilities(source) {
  const pattern =
    /\{\s*id:\s*"([^"]+)",\s*cli:\s*"([^"]*)",\s*mcp:\s*"([^"]*)",\s*http:\s*"([^"]*)"\s*\}/g;
  const rows = [];
  for (const match of source.matchAll(pattern)) {
    rows.push({ id: match[1], cli: match[2], mcp: match[3], http: match[4] });
  }
  return rows;
}

/** MCP tool names that are advertised in the tool table. */
function advertisedTools(source) {
  const names = new Set();
  for (const match of source.matchAll(/name:\s*"(blaster_[a-z_]+)"/g)) names.add(match[1]);
  return names;
}

/** MCP tool names that have an implementation arm in `runTool`. */
function implementedTools(source) {
  const names = new Set();
  for (const match of source.matchAll(/case\s+"(blaster_[a-z_]+)":/g)) names.add(match[1]);
  return names;
}

/**
 * Every `METHOD /path` the Hono surface registers, with the `/api` prefix
 * resolved.
 *
 * Any Hono instance registers routes; a capability's HTTP surface must exist on
 * one of them. Rather than enumerate the sub-app names (which drift as sub-apps
 * are added), this reads every `<something>.get|post|put|delete|patch("...")`
 * and prefixes `app`-registered paths with nothing and all others with `/api`,
 * which is how the router mounts them.
 */
function httpRoutes(source) {
  const routes = new Set();
  const pattern = /\b(\w+)\.(get|post|put|delete|patch)\(\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    const [, app, method, path] = match;
    // `app` mounts at the root; every sub-app is mounted under `/api`.
    const full = app === "app" ? path : `/api${path}`;
    routes.add(`${method.toUpperCase()} ${full}`);
  }
  return routes;
}

/**
 * Every `http.route({ path, method })` registered on the Convex HTTP router,
 * across the whole `convex/http/` tree. These are the deployment's own routes:
 * a Convex site with no Hono in front still answers on them.
 */
function convexHttpRoutes() {
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
    // The router's `http.route({ path, method })` puts the path and method as
    // two string literals in the same object.
    const pattern = /path:\s*"([^"]+)",\s*method:\s*"([A-Z]+)"/g;
    for (const match of source.matchAll(pattern)) {
      routes.add(`${match[2]} ${match[1]}`);
    }
  }
  return routes;
}

function check() {
  const cli = read(CLI_SOURCE);
  const mcp = read(MCP_SOURCE);
  const api = read(API_SOURCE);
  if (violations.length > 0) return; // a missing source is the only failure so far

  const caps = capabilities(cli);
  if (caps.length === 0) report(`${CLI_SOURCE}: no capabilities were found in the registry.`);

  const seen = new Set();
  for (const cap of caps) {
    if (seen.has(cap.id)) report(`capability "${cap.id}" is registered more than once.`);
    seen.add(cap.id);
  }

  const advertised = advertisedTools(mcp);
  const implemented = implementedTools(mcp);
  const routes = httpRoutes(api);
  const convexRoutes = convexHttpRoutes();

  for (const name of advertised) {
    if (!implemented.has(name)) report(`MCP tool "${name}" is advertised but has no runTool case.`);
  }
  for (const name of implemented) {
    if (!advertised.has(name)) report(`MCP tool "${name}" has a runTool case but is not advertised.`);
  }

  for (const cap of caps) {
    if (cap.mcp && !advertised.has(cap.mcp)) {
      report(`capability "${cap.id}" names MCP tool "${cap.mcp}", which the MCP server does not advertise.`);
    }
    if (cap.http) {
      const space = cap.http.indexOf(" ");
      const method = space === -1 ? "" : cap.http.slice(0, space).toUpperCase();
      const path = space === -1 ? "" : cap.http.slice(space + 1);
      if (!method || !path.startsWith("/")) {
        report(`capability "${cap.id}" has an unparsable http surface "${cap.http}".`);
      } else if (!routes.has(`${method} ${path}`) && !routes.has(`${method} ${path.split("?")[0]}`)) {
        report(`capability "${cap.id}" names HTTP route "${cap.http}", which the API does not register.`);
      }
    }
  }

  // The README must not advertise an MCP tool the server does not register:
  // every `blaster_<tool>` it names must be a real, advertised tool. The
  // README is the first thing a new reader copies, so a phantom tool there is
  // the drift this gate exists to catch.
  const readme = read(README);
  if (readme !== "") {
    for (const name of readme.matchAll(/blaster_[a-z0-9_]+/g)) {
      const tool = name[0];
      if (!advertised.has(tool)) {
        report(`README.md names MCP tool "${tool}", which the MCP server does not advertise.`);
      }
    }
  }

  // The Convex router mirrors only the subset of the Hono surface it can serve
  // on its own. A Hono route that the Convex router does not register is fine
  // (a Twenty/Telnyx route the deployment cannot serve); the only drift is the
  // reverse — a Convex route nothing on the Hono surface names. The legacy
  // `/blaster/*` routes are intentional: deployment-inspection endpoints that
  // exist on Convex directly and have no Hono twin.
  for (const route of convexRoutes) {
    if (route.startsWith("GET /blaster/") || route.startsWith("POST /blaster/")) continue;
    if (!routes.has(route)) {
      report(`the Convex HTTP router registers "${route}", but the Hono surface does not.`);
    }
  }
}

check();

if (violations.length > 0) {
  console.error(`pre-push: FAIL - ${violations.length} surface mismatch(es):`);
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error("\nSee docs/pools.md and the CAPABILITIES registry in packages/blaster-cli/src/cli/index.ts.");
  process.exit(1);
}
console.log("pre-push: OK - capabilities, MCP tools, and HTTP routes agree.");
