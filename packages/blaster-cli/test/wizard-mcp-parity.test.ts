import { describe, expect, it } from "vitest";
import { TOOL_DEFINITIONS } from "../../blaster-mcp/src/mcp/index.ts";
import { ACCOUNTS_USAGE } from "../src/cli/accounts.ts";
import { NUMBERS_USAGE } from "../src/cli/numbers-usage.ts";
import { POOLS_USAGE } from "../src/cli/pools.ts";
import { SEQUENCE_USAGE } from "../src/cli/sequence.ts";

/**
 * CLI flag <-> MCP tool input parity.
 *
 * Each command's flags are declared against the MCP tool that does the same job.
 * The declaration is checked against both real artifacts: every MCP property it
 * names must exist in the tool's schema, every flag it names must appear in the
 * command's help text, and every flag in the help text and every property in the
 * schema must be declared (or listed as deliberately one-sided). Adding an input
 * on one surface without the other fails here.
 */
interface Pairing {
  command: string;
  usage: string;
  /** The section of the usage text for this command, as a regexp over the help text. */
  section: RegExp;
  tool: string;
  /** CLI flag -> MCP property. */
  map: Record<string, string>;
  /** Flags that only make sense on the command line. */
  cliOnly?: string[];
  /** MCP properties with no CLI flag, with the reason. */
  mcpOnly?: Record<string, string>;
}

const COMMON_CLI_ONLY = ["api-url", "json"];

const pairings: Pairing[] = [
  {
    command: "blaster sequence new",
    usage: SEQUENCE_USAGE,
    section: /new \[name\][\s\S]*?(?=\n {2}activate)/,
    tool: "blaster_register_sequence",
    map: { from: "fromNumber", pool: "poolId", campaign: "campaignId", steps: "steps", name: "name" },
    cliOnly: ["activate"],
    mcpOnly: { numberProfileId: "set with --profile in the CLI body, not in the help block", options: "advanced options object" },
  },
  {
    command: "blaster pools create",
    usage: POOLS_USAGE,
    section: /create --name[\s\S]*?(?=\n {2}add-number)/,
    tool: "blaster_create_pool",
    map: { name: "name", "min-spacing": "minSpacingMs", "daily-cap": "dailyCapPerNumber" },
    mcpOnly: { phoneNumbers: "the wizard picks numbers interactively; add-number is the scripted path" },
  },
  {
    command: "blaster pools add-number",
    usage: POOLS_USAGE,
    section: /add-number --pool[\s\S]*?(?=\n {2}remove-number)/,
    tool: "blaster_add_pool_number",
    map: { pool: "poolId", number: "phoneNumber", order: "order" },
  },
  {
    command: "blaster numbers buy",
    usage: NUMBERS_USAGE,
    section: /buy --number[\s\S]*?(?=\n {2}attach)/,
    tool: "blaster_purchase_number",
    map: { number: "phoneNumbers", profile: "messagingProfileId", reference: "customerReference", "no-sync": "syncToTwenty", state: "stateCode", pool: "poolId" },
  },
  {
    command: "blaster numbers attach",
    usage: NUMBERS_USAGE,
    section: /attach --number[\s\S]*?(?=\n {2}owned|$)/,
    tool: "blaster_attach_number",
    map: { number: "phoneNumber", account: "accountRef", state: "stateCode", profile: "messagingProfileId", pool: "poolId" },
  },
  {
    command: "blaster accounts add/burn/disable/activate",
    usage: ACCOUNTS_USAGE,
    section: /add <ref>[\s\S]*?(?=\n {2}assign)/,
    tool: "blaster_set_account",
    map: { label: "label", note: "note" },
    mcpOnly: { ref: "positional in the CLI", status: "chosen by the verb (burn, disable, activate)" },
  },
  {
    command: "blaster accounts assign",
    usage: ACCOUNTS_USAGE,
    section: /assign --number[\s\S]*?(?=\n\nThe API key)/,
    tool: "blaster_assign_number_account",
    map: { number: "phoneNumber", ref: "ref" },
  },
];

const propertiesOf = (tool: string): string[] => {
  const definition = TOOL_DEFINITIONS.find((entry) => entry.name === tool);
  expect(definition, `tool ${tool} exists`).toBeDefined();
  return Object.keys((definition!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
};

describe("CLI flags and MCP inputs agree", () => {
  for (const pairing of pairings) {
    describe(pairing.command, () => {
      const properties = propertiesOf(pairing.tool);
      const help = pairing.usage.match(pairing.section)?.[0] ?? "";
      const helpFlags = [...help.matchAll(/--([a-z][a-z-]*)/g)].map((match) => match[1] as string);

      it("has a help section to compare against", () => {
        expect(help, `help text for ${pairing.command}`).not.toBe("");
      });

      it("maps every declared flag to a real MCP property", () => {
        for (const [flag, property] of Object.entries(pairing.map)) {
          expect(properties, `${pairing.tool} has ${property} (for --${flag})`).toContain(property);
        }
      });

      it("documents every declared flag in the help text", () => {
        for (const flag of Object.keys(pairing.map)) {
          // positional-or-flag inputs such as a sequence name may be written as <name>
          if (flag === "name" || flag === "ref") continue;
          expect(helpFlags, `--${flag} in help`).toContain(flag);
        }
      });

      it("declares every flag in the help text", () => {
        const declared = new Set([...Object.keys(pairing.map), ...(pairing.cliOnly ?? []), ...COMMON_CLI_ONLY]);
        for (const flag of new Set(helpFlags)) expect(declared, `--${flag} is declared`).toContain(flag);
      });

      it("declares every MCP property, or says why it is one-sided", () => {
        const declared = new Set([...Object.values(pairing.map), ...Object.keys(pairing.mcpOnly ?? {})]);
        for (const property of properties) expect(declared, `${property} is declared`).toContain(property);
      });
    });
  }
});
