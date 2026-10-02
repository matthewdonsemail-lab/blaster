/**
 * Regenerates convex/_generated from the local tree, no deployment required.
 *
 * `npx convex codegen` needs a login and pushes to a deployment; this script
 * is the offline path. It scans the convex tree for function modules (every
 * .ts file that exports a Convex function) and writes:
 *
 *   - `convex/_generated/api.d.ts` — the module list + fullApi map
 *   - `convex/_generated/server.d.ts` — the env-var type and builders
 *
 * The .js companions (`api.js`, `server.js`) and `dataModel.d.ts` are generated
 * from the same template and do not depend on the module list, so they are left
 * alone.
 *
 * Usage: `node scripts/convex-codegen.mjs`
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const convexDir = join(root, "convex");
const generatedDir = join(convexDir, "_generated");

/**
 * The module list for `api.d.ts`.
 *
 * Every .ts file under convex/ outside _generated/ is listed, matching the
 * glob the CLI's codegen uses. The `convex.config` file (a CLI config, not a
 * function module) and the test tree are excluded.
 */
async function listFunctionModules() {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "_generated") continue;
        await walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        out.push(
          join(dir, entry.name)
            .slice(convexDir.length + 1)
            .replace(/\\/g, "/")
            .replace(/\.ts$/, ""),
        );
      }
    }
  }
  await walk(convexDir);
  return out
    .filter((m) => m !== "convex.config" && !m.startsWith("test/"))
    .sort();
}

/** The env vars used through `convexEnv` / `env.` in the convex tree. */
async function envVarNames() {
  const names = new Set(["CONVEX_CLOUD_URL", "CONVEX_SITE_URL"]);
  const found = new Set();
  const SKIP = new Set(["_generated", "test", "test-support"]);
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (entry.name.endsWith(".ts")) {
        const src = await readFile(join(dir, entry.name), "utf8");
        for (const m of src.matchAll(/\b(?:convexEnv|env)\.([A-Z][A-Z0-9_]*[A-Z0-9])\b/g)) {
          found.add(m[1]);
        }
      }
    }
  }
  await walk(convexDir);
  for (const name of found) names.add(name);
  return names;
}

async function main() {
  const check = process.argv.includes("--check");
  const modules = await listFunctionModules();
  const envVars = await envVarNames();
  console.log(`[convex:codegen] ${modules.length} function modules, ${envVars.size} env vars`);

  const slug = (m) => m.replace(/\//g, "_").replace(/\.ts$/, "");
  const api = `/* eslint-disable */
/**
 * Generated \`api\` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`node scripts/convex-codegen.mjs\`.
 * @module
 */

${modules.map((m) => `import type * as ${slug(m)} from "../${m}.js";`).join("\n")}
import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
${modules.map((m) => `  "${m}": typeof ${slug(m)};`).join("\n")}
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = internal.myModule.myFunction;
 * \`\`\`
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
`;
  if (check) {
    const current = await readFile(join(generatedDir, "api.d.ts"), "utf8");
    if (current !== api) {
      console.error("[convex:codegen] api.d.ts is out of date. Run `node scripts/convex-codegen.mjs` and commit the result.");
      process.exit(1);
    }
    console.log("[convex:codegen] api.d.ts is current");
  } else {
    await writeFile(join(generatedDir, "api.d.ts"), api, "utf8");
    console.log(`[convex:codegen] wrote api.d.ts`);
  }

  const varLines = [...envVars]
    .sort()
    .map((name) => {
      // Required vars: the ones the runner needs to send (Telnyx). Everything
      // else degrades to a readable configuration state, so it is optional.
      const required = name.startsWith("TELNYX_") || name === "CONVEX_CLOUD_URL" || name === "CONVEX_SITE_URL";
      return `  readonly ${name}${required ? "" : "?"}: string;`;
    })
    .join("\n");

  const server = `/* eslint-disable */
/**
 * Generated utilities for implementing server-side Convex query and mutation
 * functions.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`node scripts/convex-codegen.mjs\`.
 * @module
 */

import {
  ActionBuilder,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

/**
 * Typesafe environment variables.
 *
 * This includes platform-provided env vars and any variables read by the
 * convex/ tree (see the script; TELNYX_* are required, the rest optional).
 */
type Env = {
${varLines}
};

/**
 * Define a query in this Convex app's public API.
 *
 * This function will be allowed to read your Convex database and will be accessible from the client.
 *
 * @param func - The query function. It receives a {@link QueryCtx} as its first argument.
 * @returns The wrapped query. Include this as an \`export\` to name it and make it accessible.
 */
export declare const query: QueryBuilder<DataModel, "public">;

/**
 * Define a query that is only accessible from other Convex functions (but not from the client).
 *
 * This function will be allowed to read from your Convex database. It will not be accessible from the client.
 *
 * @param func - The query function. It receives a {@link QueryCtx} as its first argument.
 * @returns The wrapped query. Include this as an \`export\` to name it and make it accessible.
 */
export declare const internalQuery: QueryBuilder<DataModel, "internal">;

/**
 * Define a mutation in this Convex app's public API.
 *
 * This function will be allowed to modify your Convex database and will be accessible from the client.
 *
 * @param func - The mutation function. It receives a {@link MutationCtx} as its first argument.
 * @returns The wrapped mutation. Include this as an \`export\` to name it and make it accessible.
 */
export declare const mutation: MutationBuilder<DataModel, "public">;

/**
 * Define a mutation that is only accessible from other Convex functions (but not from the client).
 *
 * This function will be allowed to modify your Convex database. It will not be accessible from the client.
 *
 * @param func - The mutation function. It receives a {@link MutationCtx} as its first argument.
 * @returns The wrapped mutation. Include this as an \`export\` to name it and make it accessible.
 */
export declare const internalMutation: MutationBuilder<DataModel, "internal">;

/**
 * Define an action in this Convex app's public API.
 *
 * An action is a function which can execute any JavaScript code, including non-deterministic
 * code and code with side-effects, like calling third-party services.
 * They can be run in Convex's JavaScript environment or in Node.js using the "use node" directive.
 * They can interact with the database indirectly by calling queries and mutations using the {@link ActionCtx}.
 *
 * @param func - The action. It receives an {@link ActionCtx} as its first argument.
 * @returns The wrapped action. Include this as an \`export\` to name it and make it accessible.
 */
export declare const action: ActionBuilder<DataModel, "public">;

/**
 * Define an action that is only accessible from other Convex functions (but not from the client).
 *
 * @param func - The function. It receives an {@link ActionCtx} as its first argument.
 * @returns The wrapped function. Include this as an \`export\` to name it and make it accessible.
 */
export declare const internalAction: ActionBuilder<DataModel, "internal">;

/**
 * Define an HTTP action.
 *
 * The wrapped function will be used to respond to HTTP requests received
 * by a Convex deployment if the requests matches the path and method where
 * this action is routed. Be sure to route your httpAction in \`convex/http.js\`.
 *
 * @param func - The function. It receives an {@link ActionCtx} as its first argument
 * and a Fetch API \`Request\` object as its second.
 * @returns The wrapped function. Import this function from \`convex/http.js\` and route it to hook it up.
 */
export declare const httpAction: HttpActionBuilder;

/**
 * Typesafe environment variables.
 *
 * This includes platform-provided env vars and any variables read by the
 * convex/ tree.
 */
export declare const env: Env;

/**
 * A set of services for use within Convex query functions.
 *
 * The query context is passed as the first argument to any Convex query
 * function run on the server.
 *
 * This differs from the {@link MutationCtx} because all of the services are
 * read-only.
 */
export type QueryCtx = GenericQueryCtx<DataModel>;

/**
 * A set of services for use within Convex mutation functions.
 *
 * The mutation context is passed as the first argument to any Convex mutation
 * function run on the server.
 */
export type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * A set of services for use within Convex action functions.
 *
 * The action context is passed as the first argument to any Convex action
 * function run on the server.
 */
export type ActionCtx = GenericActionCtx<DataModel>;

/**
 * An interface to read from the database within Convex query functions.
 *
 * The two entry points are {@link DatabaseReader.get}, which fetches a single
 * document by its {@link Id}, and {@link DatabaseReader.query}, which starts
 * building a query.
 */
export type DatabaseReader = GenericDatabaseReader<DataModel>;

/**
 * An interface to read from and write to the database within Convex mutation
 * functions.
 *
 * Convex guarantees that all writes within a single mutation are
 * executed atomically, so you never have to worry about partial writes leaving
 * your data in an inconsistent state. See [the Convex Guide](https://docs.convex.dev/understanding/convex-fundamentals/functions#atomicity-and-optimistic-concurrency-control)
 * for the guarantees Convex provides your functions.
 */
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
`;
  if (check) {
    const current = await readFile(join(generatedDir, "server.d.ts"), "utf8");
    if (current !== server) {
      console.error("[convex:codegen] server.d.ts is out of date. Run `node scripts/convex-codegen.mjs` and commit the result.");
      process.exit(1);
    }
    console.log("[convex:codegen] server.d.ts is current");
  } else {
    await writeFile(join(generatedDir, "server.d.ts"), server, "utf8");
    console.log(`[convex:codegen] wrote server.d.ts`);
  }
}

main();

