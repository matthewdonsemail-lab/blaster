import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPABILITY_REGISTRY } from "../../core/src/index.ts";
import { TOOL_DEFINITIONS } from "../../blaster-mcp/src/mcp/index.ts";

/**
 * Registry <-> CLI table <-> MCP tools <-> HTTP routes.
 *
 * The registry says which surface implements each capability. This checks that
 * the three real artifacts agree with it: every MCP tool it names is advertised,
 * every HTTP route it names is mounted, and the CLI's own `capabilities` table
 * carries the same command, tool and route. wizard-mcp-parity.test.ts covers the
 * flags; this covers the existence and naming of each surface.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const cliSource = read("../src/cli/index.ts");
const cliRows = new Map(
  [...cliSource.matchAll(/\{ id: "([^"]+)", cli: "([^"]*)", mcp: "([^"]*)", http: "([^"]*)" \}/g)].map((m) => [
    m[1]!,
    { cli: m[2]!, mcp: m[3]!, http: m[4]! },
  ]),
);

// Sub-apps are mounted under /api, so a route written as "/pools" is /api/pools.
const routes = new Set<string>();
for (const m of read("../../../apps/api/src/index.ts").matchAll(/\w+\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
  const path = m[2]!;
  routes.add(`${m[1]!.toUpperCase()} ${path.startsWith("/api") ? path : `/api${path}`}`);
}

const toolNames = new Set(TOOL_DEFINITIONS.map((t) => t.name));

describe("capability registry matches the surfaces it names", () => {
  it("reads a believable number of CLI rows and routes", () => {
    expect(cliRows.size).toBeGreaterThan(30);
    expect(routes.size).toBeGreaterThan(30);
  });

  it.each(CAPABILITY_REGISTRY.map((c) => [c.id, c] as const))("%s", (_id, cap) => {
    const { mcp, http, cli } = cap.mappings;
    if (mcp) expect(toolNames.has(mcp), `${cap.id}: MCP tool ${mcp} is not advertised`).toBe(true);
    // A query string selects a variant of a route; the route itself is what is mounted.
    if (http) expect(routes.has(http.split("?")[0]!), `${cap.id}: ${http} is not mounted`).toBe(true);

    const row = cliRows.get(cap.id);
    expect(row, `${cap.id}: missing from the CLI capabilities table`).toBeDefined();
    expect(row?.cli ?? "").toBe(cli ?? "");
    expect(row?.mcp ?? "").toBe(mcp ?? "");
    expect(row?.http ?? "").toBe(http ?? "");
  });

  it("advertises no MCP tool the registry does not know", () => {
    const known = new Set(CAPABILITY_REGISTRY.map((c) => c.mappings.mcp));
    expect([...toolNames].filter((t) => !known.has(t))).toEqual([]);
  });
});
