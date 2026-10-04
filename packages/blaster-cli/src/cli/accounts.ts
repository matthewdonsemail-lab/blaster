/**
 * `blaster accounts`: the Telnyx accounts sender numbers belong to.
 *
 * Credentials never pass through here. Registering an account names the Convex
 * env var that must hold its key; the operator sets that out of band. Burning or
 * disabling an account takes every number on it out of pool selection at once.
 * Scriptable and prompt-free, like the other operator commands.
 */

import {
  BlasterApiError,
  createBlasterApiClient,
  type BlasterApiClient,
  type TelnyxAccountRow,
} from "@blaster/core";
import { ensureLiveSession, loadHome, loginMain } from "./login.ts";
import type { CliFlags } from "./inbox.ts";
import { isInteractive } from "./prompt.ts";

export const ACCOUNTS_USAGE = `Usage: blaster accounts <action>

  list                          Accounts, their state, and whether each key is set
  add <ref> [--label <text>]    Register an account (prints the env var to set its key)
  burn <ref> [--note <text>]    Mark an account burned: its numbers stop being selected
  disable <ref> [--note <text>] Take an account out of use without calling it burned
  activate <ref>                Put an account back in use
  assign --number <e164> [--ref <ref>]
                                Attach a number to an account; no --ref returns it to the default

The API key is never stored by Blaster. Set it with:
  npx convex env set TELNYX_API_KEY__<REF> <key>      (ref upper-cased, other characters as _)
A number with no account uses the deployment default key.

Options
  --api-url <url>               The API to use, defaulting to the signed-in one
  --json                        Machine-readable output

Reads the operator session written by "blaster login".`;

export async function liveClient(
  flags: CliFlags,
  json: boolean,
  root: string,
  label = "accounts",
): Promise<BlasterApiClient | number> {
  const home = loadHome(root);
  const explicit = typeof flags.get("api-url") === "string" ? (flags.get("api-url") as string) : null;
  const apiUrl =
    (explicit !== null && explicit !== "" ? explicit : null) ??
    home.config.apiUrl ??
    Object.keys(home.sessions)[0] ??
    null;
  if (!apiUrl) {
    console.error(`blaster ${label}: no signed-in API. Run "blaster login" first, or pass --api-url.`);
    return 1;
  }
  let session = await ensureLiveSession(root, apiUrl);
  if (!session) {
    if (!isInteractive(json)) {
      console.error(`blaster ${label}: no live session for ${apiUrl}. Run "blaster login" first.`);
      return 1;
    }
    const code = await loginMain(new Map([["api-url", apiUrl]]), json, root);
    if (code !== 0) return code;
    session = await ensureLiveSession(root, apiUrl);
    if (!session) {
      console.error(`blaster ${label}: no live session for ${apiUrl}. Run "blaster login" first.`);
      return 1;
    }
  }
  return createBlasterApiClient({ baseUrl: apiUrl, accessToken: session.accessToken });
}

function report(error: unknown, json: boolean): number {
  if (error instanceof BlasterApiError) {
    if (error.kind === "unauthorized") {
      const message = 'The operator token is not accepted. Run "blaster login" again.';
      console.error(json ? JSON.stringify({ error: message, kind: error.kind }, null, 2) : `blaster accounts: ${message}`);
      return 1;
    }
    console.error(
      json
        ? JSON.stringify({ error: error.message, kind: error.kind, status: error.status }, null, 2)
        : `blaster accounts: ${error.message} (${error.status})`,
    );
    return error.kind === "unavailable" || error.kind === "server" ? 2 : 1;
  }
  console.error(`blaster accounts: ${error instanceof Error ? error.message : String(error)}`);
  return 1;
}

const asJson = (value: unknown): string => JSON.stringify(value, null, 2);
const text = (value: string | boolean | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

export function formatAccounts(rows: TelnyxAccountRow[]): string {
  if (rows.length === 0) return "No accounts registered. Every number uses the default key.";
  return rows
    .map(
      (row) =>
        `${row.ref}  [${row.status}]  key ${row.keyConfigured ? "set" : `MISSING (${row.keyEnvName})`}` +
        (row.label ? `  ${row.label}` : "") +
        (row.note ? `  - ${row.note}` : ""),
    )
    .join("\n");
}

const ACCOUNT_ACTIONS = new Set(["list", "ls", "add", "burn", "disable", "activate", "assign"]);

export async function accountsMain(
  rest: string[],
  flags: CliFlags,
  json: boolean,
  root: string = process.cwd(),
): Promise<number> {
  const action = rest[0];
  if (action === "help" || action === undefined) {
    console.log(ACCOUNTS_USAGE);
    return action === undefined ? 1 : 0;
  }
  if (!ACCOUNT_ACTIONS.has(action)) {
    console.error(`blaster accounts: unknown action "${action}"
${ACCOUNTS_USAGE}`);
    return 1;
  }
  const client = await liveClient(flags, json, root);
  if (typeof client === "number") return client;

  try {
    switch (action) {
      case "list":
      case "ls": {
        const rows = await client.listAccounts();
        console.log(json ? asJson({ count: rows.length, accounts: rows }) : formatAccounts(rows));
        return 0;
      }
      case "add": {
        const ref = text(flags.get("ref")) ?? rest[1];
        if (!ref) {
          console.error(`blaster accounts add: a ref is required\n${ACCOUNTS_USAGE}`);
          return 1;
        }
        const label = text(flags.get("label"));
        const result = await client.setAccount({ ref, ...(label === undefined ? {} : { label }) });
        console.log(
          json
            ? asJson(result)
            : `Registered ${result.ref}. Set its key with: npx convex env set ${result.keyEnvName} <key>`,
        );
        return 0;
      }
      case "burn":
      case "disable":
      case "activate": {
        const ref = text(flags.get("ref")) ?? rest[1];
        if (!ref) {
          console.error(`blaster accounts ${action}: a ref is required\n${ACCOUNTS_USAGE}`);
          return 1;
        }
        const status = action === "burn" ? "burned" : action === "disable" ? "disabled" : "active";
        const note = text(flags.get("note"));
        const result = await client.setAccount({ ref, status, ...(note === undefined ? {} : { note }) });
        console.log(json ? asJson(result) : `${result.ref} is now ${result.status}.`);
        return 0;
      }
      case "assign": {
        const phoneNumber = text(flags.get("number"));
        if (!phoneNumber) {
          console.error(`blaster accounts assign: --number is required\n${ACCOUNTS_USAGE}`);
          return 1;
        }
        const ref = text(flags.get("ref"));
        const result = await client.assignNumberAccount({ phoneNumber, ...(ref === undefined ? {} : { ref }) });
        console.log(
          json
            ? asJson(result)
            : result.accountRef
              ? `${result.phoneNumber} now belongs to ${result.accountRef}.`
              : `${result.phoneNumber} now uses the default account.`,
        );
        return 0;
      }
      default: {
        console.error(`blaster accounts: unknown action "${action}"\n${ACCOUNTS_USAGE}`);
        return 1;
      }
    }
  } catch (error) {
    return report(error, json);
  }
}
