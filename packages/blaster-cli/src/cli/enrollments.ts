/**
 * `blaster enrollments`: act on one prospect's place in a campaign.
 * cancel is for good; pause keeps the place and resume puts it back, due now.
 */

import { BlasterApiError } from "@blaster/core";
import { liveClient } from "./accounts.ts";
import type { CliFlags } from "./inbox.ts";

export const ENROLLMENTS_USAGE = `Usage: blaster enrollments <action> <enrollment-id>

  cancel <id> [--reason <text>]   Stop this prospect for good; they can be enrolled again
  pause <id>                      Stop sending, keep the place
  resume <id>                     Put a paused enrollment back, due now

Find ids with "blaster sequence status <sequence-id>".

Options
  --api-url <url>                 The API to use, defaulting to the signed-in one
  --json                          Machine-readable output`;

const ACTIONS = new Set(["cancel", "pause", "resume"]);

export async function enrollmentsMain(rest: string[], flags: CliFlags, json: boolean, root: string = process.cwd()): Promise<number> {
  const [action, id] = rest;
  if (action === "help" || action === undefined) {
    console.log(ENROLLMENTS_USAGE);
    return action === undefined ? 1 : 0;
  }
  if (!ACTIONS.has(action)) {
    console.error(`blaster enrollments: unknown action "${action}"\n${ENROLLMENTS_USAGE}`);
    return 1;
  }
  if (!id) {
    console.error(`blaster enrollments ${action}: an enrollment id is required\n${ENROLLMENTS_USAGE}`);
    return 1;
  }
  const client = await liveClient(flags, json, root, "enrollments");
  if (typeof client === "number") return client;
  try {
    const reason = typeof flags.get("reason") === "string" ? (flags.get("reason") as string) : undefined;
    const result =
      action === "cancel" ? await client.cancelEnrollment(id, reason) : action === "pause" ? await client.pauseEnrollment(id) : await client.resumeEnrollment(id);
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : result.changed === false
          ? `Nothing changed: the enrollment is ${result.status}.`
          : `Enrollment is now ${result.status}.`,
    );
    return 0;
  } catch (error) {
    console.error(`blaster enrollments: ${error instanceof BlasterApiError ? `${error.message} (${error.status})` : error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
