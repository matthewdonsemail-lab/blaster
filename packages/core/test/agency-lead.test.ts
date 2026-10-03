import { describe, expect, test, vi } from "vitest";
import { promoteProspectToLead, leadNote } from "../src/twenty/agencyLead/index.ts";

const input = {
  prospectId: "p1",
  conversationId: "c1",
  phone: "+13125550001",
  replyBody: "yes please",
  replyAt: 1_700_000_000_000,
};

describe("promoteProspectToLead", () => {
  test("creates a lead with the backlink and a pointer note", async () => {
    const client = {
      listPage: vi.fn().mockResolvedValue({ records: [] }),
      create: vi.fn().mockResolvedValue({ id: "l1" }),
    };
    const result = await promoteProspectToLead(client as never, input);
    expect(result).toEqual({ lead: { id: "l1" }, created: true });
    expect(client.create.mock.calls[0]![1]).toMatchObject({
      agencyProspectId: "p1",
      source: "sms-reply",
      note: leadNote(input),
    });
    expect(leadNote(input)).toContain("Conversation: c1");
  });

  test("returns the existing lead instead of creating a second", async () => {
    const client = {
      listPage: vi.fn().mockResolvedValue({ records: [{ id: "l0" }] }),
      create: vi.fn(),
    };
    expect(await promoteProspectToLead(client as never, input)).toEqual({ lead: { id: "l0" }, created: false });
    expect(client.create).not.toHaveBeenCalled();
  });

  test("a retry after a failed link finds the lead the first attempt created", async () => {
    const lead = { id: "l1" };
    const client = {
      listPage: vi.fn().mockResolvedValueOnce({ records: [] }).mockResolvedValueOnce({ records: [lead] }),
      create: vi.fn().mockResolvedValue(lead),
    };
    const first = await promoteProspectToLead(client as never, input);
    const second = await promoteProspectToLead(client as never, input);
    expect([first.created, second.created]).toEqual([true, false]);
    expect(second.lead).toBe(lead);
    expect(client.create).toHaveBeenCalledTimes(1);
  });
});
