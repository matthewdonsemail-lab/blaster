---
name: prospects
description: Read and enrich prospects from the Twenty CRM workspace through Blaster. Use to list records, search by field, report the pipeline breakdown, and understand which notifications the numbers currently trigger.
---

Blaster reads a Twenty CRM workspace and reports what the pipeline actually
looks like before any SMS is sent.

## The two read tools

- `blaster_list_records` lists records from a Twenty object (`agencyLeads`,
  `agencyProspects`, `agencyCalls`), with keyset pagination and tolerant
  response unwrapping. Pass the object name; use `--limit` and a filter DSL
  through the CLI for a scoped walk.
- `blaster_breakdown` counts leads, calls, and prospects into slices and runs
  the notification rules over the breakdown. It is pure logic - no workspace
  call - so it is fast and safe to run any time to see which thresholds are
  currently firing.

## The notification state key

`blaster_breakdown` also returns a `stateKey`, the sorted set of firing rule
ids. A poller that sees the same key twice knows not to re-announce an
unchanged condition - the state key is what makes "delivered once" hold across
runs.

## Reporting before sending

Run `blaster_breakdown` and `blaster_list_records` on the prospects object
before a send, so the operator sees the shape of the pipeline and which
prospect records are sendable. The prospect batch send then filters, previews,
and reports per-recipient outcomes - see [docs/send.md](../../../docs/send.md).
