/**
 * Twenty `agencyLeads`: a prospect that answered.
 *
 * Promotion is the one writer. It creates the lead with the backlink to the
 * prospect and a snapshot of the exchange, and it is idempotent per prospect:
 * a second call returns the lead that already exists instead of a duplicate.
 *
 * The lead does not own the conversation. The full message history stays in
 * Convex on the thread keyed by phone pair; the lead `note` is a snapshot taken
 * at promotion plus the Convex conversation id, so the two cannot be mistaken
 * for each other and the note going stale is expected, not a bug.
 */

import type { WriteActor } from "../actor/types.ts";
import type { TwentyClient, TwentyRecord } from "../client/index.ts";

export const AGENCY_LEADS_OBJECT = "agencyLeads";

export interface PromoteInput {
  prospectId: string;
  /** The Convex conversation the reply arrived on. */
  conversationId: string;
  /** The prospect's number, E.164. */
  phone: string;
  name?: string;
  /** The message Blaster sent, kept for A/B comparison. */
  outboundMessage?: string;
  /** The reply that triggered promotion, and when it arrived (ms). */
  replyBody: string;
  replyAt: number;
  /**
   * The campaign the lead inherits. The caller decides, because a contact can
   * sit in several; pass nothing when the thread's campaign is ambiguous.
   */
  campaignId?: string | null;
  source?: string;
}

export interface PromoteResult {
  lead: TwentyRecord;
  created: boolean;
}

/** The lead `note`: the pointer first, then the snapshot. */
export function leadNote(input: Pick<PromoteInput, "conversationId" | "outboundMessage" | "replyBody">): string {
  const lines = [`Conversation: ${input.conversationId} (Convex is the full history)`];
  if (input.outboundMessage) lines.push(`We sent: ${input.outboundMessage}`);
  lines.push(`They replied: ${input.replyBody}`);
  return lines.join("\n");
}

/** The lead already promoted from this prospect, if any. */
export async function findLeadForProspect(
  client: TwentyClient,
  prospectId: string,
): Promise<TwentyRecord | null> {
  const page = await client.listPage<TwentyRecord>(AGENCY_LEADS_OBJECT, {
    filter: `agencyProspectId[eq]:"${prospectId}"`,
    limit: 1,
  });
  return page.records[0] ?? null;
}

export async function promoteProspectToLead(
  client: TwentyClient,
  input: PromoteInput,
  actor?: WriteActor | null,
): Promise<PromoteResult> {
  const existing = await findLeadForProspect(client, input.prospectId);
  if (existing) return { lead: existing, created: false };

  const lead = await client.create<TwentyRecord>(
    AGENCY_LEADS_OBJECT,
    {
      name: input.name ?? input.phone,
      phone: { primaryPhoneNumber: input.phone },
      agencyProspectId: input.prospectId,
      source: input.source ?? "sms-reply",
      status: "NEW",
      note: leadNote(input),
      replyAt: new Date(input.replyAt).toISOString(),
      ...(input.outboundMessage ? { outboundMessage: input.outboundMessage } : {}),
      ...(input.campaignId ? { campaignIdId: input.campaignId } : {}),
    },
    actor,
  );
  if (!lead) throw new Error("Twenty created the lead but returned no record");
  return { lead, created: true };
}
