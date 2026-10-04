import { describe, expect, test } from "vitest";
import { seedSequence, testBackend } from "./harness.js";
import { inboundRef, linkRef } from "./refs.js";

describe("linkConversation", () => {
  async function seed(t: ReturnType<typeof testBackend>) {
    return t.run(async (ctx) =>
      ctx.db.insert("conversations", {
        pairKey: "+13125550001|+15550000001",
        phoneNumber: "+13125550001",
        blasterNumber: "+15550000001",
        createdAt: 1,
      }),
    );
  }

  test("promotion adds the lead to the same thread and is idempotent", async () => {
    const t = testBackend();
    const id = await seed(t);
    expect((await t.mutation(linkRef, { conversationId: id, prospectId: "p1" })).status).toBe("linked");
    expect((await t.mutation(linkRef, { conversationId: id, prospectId: "p1", leadId: "l1" })).status).toBe("linked");
    expect((await t.mutation(linkRef, { conversationId: id, prospectId: "p1", leadId: "l1" })).status).toBe("unchanged");
    const row = await t.run(async (ctx) => ctx.db.get("conversations", id));
    expect(row).toMatchObject({ prospectId: "p1", leadId: "l1" });
  });

  test("refuses to rebind a thread to another prospect or lead", async () => {
    const t = testBackend();
    const id = await seed(t);
    await t.mutation(linkRef, { conversationId: id, prospectId: "p1", leadId: "l1" });
    expect(await t.mutation(linkRef, { conversationId: id, prospectId: "p2" })).toMatchObject({ status: "conflict", field: "prospectId" });
    expect(await t.mutation(linkRef, { conversationId: id, prospectId: "p1", leadId: "l2" })).toMatchObject({ status: "conflict", field: "leadId" });
  });
});

describe("inbound reply binds the thread to its prospect", () => {
  test("a single-prospect peer links on the first reply, and the link survives later replies", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001", campaignId: "cmp" });
    await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-1",
        to: "+13125550001",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
      }),
    );
    const first = await t.mutation(inboundRef, {
      from: "+13125550001",
      to: "+15550000001",
      body: "yes",
      providerEventId: "e1",
    });
    expect(first).toMatchObject({ status: "stored", prospectId: "prospect-1", leadId: null });
    const second = await t.mutation(inboundRef, {
      from: "+13125550001",
      to: "+15550000001",
      body: "tell me more",
      providerEventId: "e2",
    });
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.prospectId).toBe("prospect-1");
  });

  test("an unenrolled peer stays unlinked", async () => {
    const t = testBackend();
    const result = await t.mutation(inboundRef, { from: "+13125550009", to: "+15550000001", body: "hi", providerEventId: "e9" });
    expect(result.prospectId).toBeNull();
  });

  test("a peer enrolled under two different prospects stays unlinked", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001", campaignId: "cmp" });
    for (const recipientId of ["prospect-1", "prospect-2"]) {
      await t.run(async (ctx) =>
        ctx.db.insert("sequenceEnrollments", {
          sequenceId: sequenceId as never,
          recipientId,
          to: "+13125550002",
          cursor: 0,
          status: "completed",
          enrolledAt: 1,
        }),
      );
    }
    const result = await t.mutation(inboundRef, { from: "+13125550002", to: "+15550000001", body: "yes", providerEventId: "e3" });
    expect(result.prospectId).toBeNull();
  });
});

test("linkConversation reports a missing thread", async () => {
  const t = testBackend();
  const id = await t.run(async (ctx) => {
    const made = await ctx.db.insert("conversations", { pairKey: "a|b", phoneNumber: "a", blasterNumber: "b", createdAt: 1 });
    await ctx.db.delete("conversations", made);
    return made;
  });
  expect((await t.mutation(linkRef, { conversationId: id, prospectId: "p1" })).status).toBe("not-found");
});
