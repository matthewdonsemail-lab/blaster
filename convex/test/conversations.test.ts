import { describe, expect, test } from "vitest";
import { required, seedPhoneNumber, seedPool, seedSequence, testBackend } from "./harness.support.js";
import { ref } from "./refs.support.js";

/**
 * Inbound: campaign attribution and the peer-wide reply check.
 *
 * `campaignFor` shipped matching `sequence.fromNumber` only, which left every
 * pool-backed thread `unassigned` — a silent wrong answer with no failing test.
 * These exercise the query and the mutation against a real runtime.
 */

type Backend = ReturnType<typeof testBackend>;

/** A stored conversation row for `(peer, blasterNumber)`, as the webhook leaves it. */
async function seedConversation(t: Backend, peer: string, blasterNumber: string) {
  return t.run(async (ctx) =>
    ctx.db.insert("conversations", {
      pairKey: [peer, blasterNumber].sort().join("|"),
      phoneNumber: peer,
      blasterNumber,
      createdAt: Date.now(),
    }),
  );
}

async function addNumberToPool(t: Backend, poolId: string, phoneNumber: string) {
  await seedPhoneNumber(t, phoneNumber);
  await t.mutation(ref.assignNumber, { poolId, phoneNumber });
}

describe("campaignFor", () => {
  test("attributes a thread to a pool-backed sequence by pool membership", async () => {
    const t = testBackend();
    const poolId = await seedPool(t, { name: "US pool" });
    await addNumberToPool(t, poolId, "+15550000009");
    const sequenceId = await seedSequence(t, {
      fromNumber: "+15550000001",
      poolId: poolId as string,
      campaignId: "cmp-pool",
    });
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
    await seedConversation(t, "+13125550001", "+15550000009");

    // campaignFor is a model function, not a Convex function; call it the same
    // way the inbox query does, against the real ctx.
    const result = await t.run(async (ctx) => {
      const { campaignFor } = await import("../conversations/model.js");
      return campaignFor(ctx as never, "+13125550001", "+15550000009");
    });
    expect(result).toEqual({ kind: "one", campaignId: "cmp-pool", sequenceId });
  });

  test("still matches a fixed-number sequence", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, {
      fromNumber: "+15550000001",
      campaignId: "cmp-fixed",
    });
    await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-2",
        to: "+13125550002",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
      }),
    );
    const result = await t.run(async (ctx) => {
      const { campaignFor } = await import("../conversations/model.js");
      return campaignFor(ctx as never, "+13125550002", "+15550000001");
    });
    expect(result).toEqual({ kind: "one", campaignId: "cmp-fixed", sequenceId });
  });

  test("a number outside the pool is unassigned", async () => {
    const t = testBackend();
    const poolId = await seedPool(t, { name: "P" });
    await addNumberToPool(t, poolId, "+15550000009");
    const sequenceId = await seedSequence(t, {
      fromNumber: "+15550000001",
      poolId: poolId as string,
      campaignId: "cmp-pool",
    });
    await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-3",
        to: "+13125550003",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
      }),
    );
    const result = await t.run(async (ctx) => {
      const { campaignFor } = await import("../conversations/model.js");
      return campaignFor(ctx as never, "+13125550003", "+15550000077");
    });
    expect(result).toEqual({ kind: "unassigned" });
  });
});

/**
 * The grouped inbox view: one row per person, folded over their pool numbers.
 *
 * The read-shape decision of `.scratch/reliable-pooled-outbound/issues/02-thread-identity.md`:
 * storage stays keyed on `(peer, blasterNumber)`; the person fold is a query
 * argument, and the person's campaign is the union of their threads' campaigns.
 */
describe("listConversations: person grouping", () => {
  async function seedThreadsForPeer(t: Backend, peer: string, numbers: string[]) {
    for (const blasterNumber of numbers) await seedConversation(t, peer, blasterNumber);
  }

  test("folds one person's pool-number threads into a single row", async () => {
    const t = testBackend();
    await seedThreadsForPeer(t, "+13125550009", ["+15550000001", "+15550000002", "+15550000003"]);

    const rows = await t.query(ref.listConversations, { limit: 10, groupBy: "person" });
    expect(rows).toHaveLength(1);
    const person = required(rows[0]);
    expect(person.phoneNumber).toBe("+13125550009");
    expect(person.blasterNumbers).toEqual(["+15550000001", "+15550000002", "+15550000003"]);
    expect(person.conversationIds).toHaveLength(3);
    expect(person.messageCount).toBe(0);
    expect(person.campaignGroup).toBe("unassigned");
    expect(person.campaignId).toBeNull();
  });

  test("separate people stay separate rows", async () => {
    const t = testBackend();
    await seedThreadsForPeer(t, "+13125550009", ["+15550000001", "+15550000002"]);
    await seedThreadsForPeer(t, "+13125550010", ["+15550000001"]);

    const rows = await t.query(ref.listConversations, { limit: 10, groupBy: "person" });
    expect(rows).toHaveLength(2);
    const byNumber = new Map(rows.map((row) => [row.phoneNumber, row] as [string, (typeof rows)[number]]));
    expect(byNumber.get("+13125550009")?.blasterNumbers).toHaveLength(2);
    expect(byNumber.get("+13125550010")?.blasterNumbers).toHaveLength(1);
  });

  test("a person's campaign is the union of their threads' campaigns", async () => {
    const t = testBackend();
    const seqA = await seedSequence(t, { fromNumber: "+15550000001", campaignId: "cmp-a" });
    const seqB = await seedSequence(t, { fromNumber: "+15550000002", campaignId: "cmp-b" });
    await t.run(async (ctx) => {
      await ctx.db.insert("sequenceEnrollments", {
        sequenceId: seqA as never,
        recipientId: "p1",
        to: "+13125550011",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
      });
      await ctx.db.insert("sequenceEnrollments", {
        sequenceId: seqB as never,
        recipientId: "p1",
        to: "+13125550011",
        cursor: 0,
        status: "active",
        enrolledAt: 2,
      });
    });
    await seedConversation(t, "+13125550011", "+15550000001");
    await seedConversation(t, "+13125550011", "+15550000002");

    const rows = await t.query(ref.listConversations, { limit: 10, groupBy: "person" });
    expect(rows).toHaveLength(1);
    const person = required(rows[0]);
    expect(person.campaignGroup).toBe("multiple");
    expect(person.candidateCampaignIds).toEqual(["cmp-a", "cmp-b"]);
  });

  test("threads without groupBy are returned per-number as before", async () => {
    const t = testBackend();
    await seedThreadsForPeer(t, "+13125550009", ["+15550000001", "+15550000002"]);
    const rows = await t.query(ref.listConversations, { limit: 10 });
    expect(rows).toHaveLength(2);
  });
});

describe("recordInboundMessage: a reply stops enrollments peer-wide", () => {
  test("stops an active enrollment for the peer and reports it", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-4",
        to: "+13125550004",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
        nextDueAt: 1,
      }),
    );

    const result = await t.mutation(ref.recordInboundMessage, {
      from: "+13125550004",
      to: "+15550000001",
      body: "please stop",
      providerEventId: "evt-reply-1",
      receivedAt: 2,
    });

    expect(result.status).toBe("stored");
    expect(result.stoppedEnrollments).toHaveLength(1);
    const stopped = required(result.stoppedEnrollments[0]);
    expect(stopped.status).toBe("replied");

    const enrollment = required(await t.run(async (ctx) => {
      // Test-only read of a table this test itself seeded; bounded by the test.
      // eslint-disable-next-line @convex-dev/no-collect-in-query
      const rows = await ctx.db.query("sequenceEnrollments").collect();
      return rows[0];
    }));
    expect(enrollment.status).toBe("replied");
    expect(enrollment.nextDueAt).toBeUndefined();
  });

  test("a redelivery is deduped and stops nothing the second time", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-5",
        to: "+13125550005",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
        nextDueAt: 1,
      }),
    );
    const input = {
      from: "+13125550005",
      to: "+15550000001",
      body: "hi",
      providerEventId: "evt-dup-1",
      receivedAt: 2,
    };
    const first = await t.mutation(ref.recordInboundMessage, input);
    const second = await t.mutation(ref.recordInboundMessage, input);
    expect(first.status).toBe("stored");
    expect(second.status).toBe("duplicate");
    expect(second.stoppedEnrollments).toEqual([]);
  });

  test("an opt-out stops harder than a reply", async () => {
    const t = testBackend();
    const sequenceId = await seedSequence(t, { fromNumber: "+15550000001" });
    await t.run(async (ctx) =>
      ctx.db.insert("sequenceEnrollments", {
        sequenceId: sequenceId as never,
        recipientId: "prospect-6",
        to: "+13125550006",
        cursor: 0,
        status: "active",
        enrolledAt: 1,
        nextDueAt: 1,
      }),
    );
    const result = await t.mutation(ref.recordInboundMessage, {
      from: "+13125550006",
      to: "+15550000001",
      body: "STOP",
      providerEventId: "evt-stop-1",
      receivedAt: 2,
      optedOut: true,
    });
    expect(required(result.stoppedEnrollments[0]).status).toBe("opted-out");
  });
});
