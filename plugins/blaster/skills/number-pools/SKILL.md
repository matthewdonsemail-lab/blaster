---
name: number-pools
description: Work with Blaster number pools - the ordered groups of sending numbers that decide which number sends each message, each inside its own rate budget. Use to plan, inspect, or change pool membership and order.
---

A pool is an ordered group of sending numbers worked one at a time, each inside
its own rate budget. Assigning a pool to a sequence makes the pool, not a fixed
`fromNumber`, decide which number sends each message.

## Read the pool state

`blaster_list_pools` returns every pool newest first with its status, active
number count, and the instant it is next able to send. `blaster_get_pool` gives
one pool with its numbers in order, each carrying its live rate state:
`status`, `sentToday`, and `nextAvailableAt`. A number's budget is spent only
once a step is claimed, so the state you read is the state a dispatch will see.

## Changing membership and order

`blaster_add_pool_number` appends a number (or reactivates a removed one); it is
a soft operation, so an in-flight send still resolves. `blaster_remove_pool_number`
soft-removes a number - the membership row is kept and the order compacts.
`blaster_reorder_pool` sets the order the pool works its numbers in. None of
these touch the sequence that is assigned; they change capacity and pacing only.

## Assigning a pool to a sequence

`blaster_set_sequence_pool` writes `sequences.poolId`. A sequence with a pool
takes its sending number from the pool per send, in pool order and inside each
number's rate budget. Omit the pool to clear the assignment; a sequence with no
pool keeps its fixed `fromNumber`, so existing behaviour is unchanged.

## The selection rule, and why the two rate authorities agree

`selectSender` starts after the pool's cursor, walks the active members in order
wrapping, and picks the first that may send now (`nextAvailableAt <= now` and,
if a daily cap is set, `sentToday < cap`). If none may send it returns the
soonest instant any active member becomes available; the runner defers the
enrollment to that instant rather than pushing the message into the carrier's
limit queue. The pool is the selection authority; the send rate limiter in
`convex/rateLimit.ts` is the admission control. The pool's `minSpacingMs`
defaults to the limiter's per-number period, so the two agree instead of
competing. A number that may not send now is deferred, never dropped.

The full rule, the status fields, and the surfaces are in
[docs/pools.md](../../../docs/pools.md).
