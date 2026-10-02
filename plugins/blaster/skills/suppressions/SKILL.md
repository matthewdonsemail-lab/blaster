---
name: suppressions
description: Read or change Blaster's durable per-person do-not-contact list. A suppression is a fact about the E.164 peer, not the number - rotation must not walk around a STOP. Use to check who is suppressed or to lift a suppression explicitly.
---

A suppression is a durable, per-person do-not-contact fact. It is keyed on the
E.164 peer, not the sending number - so a pool that rotates numbers cannot walk
around a STOP. It is written only by an inbound `STOP`, is additive over the
`opted-out` lifecycle stage, and is checked at enroll and at send.

## Reading the list

`blaster_list_suppressions` returns every currently suppressed peer, newest
first. Check it before enrolling a prospect or building a recipient set: a
suppressed peer is refused at enroll and at send, and no sequence will reach
them until it is lifted.

## Lifting a suppression

`blaster_set_suppression` is the only door into the list, and it is an
operator action, not a keyword the recipient can trigger. Accepting an inbound
`START` or `UNSTOP` is out of scope - resumption is an explicit human resolve.
Lift it only when the operator confirms the person wants contact again.

## How a STOP gets here

The verified Telnyx webhook stores the inbound message and, in the same
transaction, writes the durable `suppressions` row when the message is a `STOP`
keyword, so the two facts cannot disagree. A plain reply stops just its
enrollment; only the deterministic `STOP` suppresses durably across every
number and sequence. See [docs/pools.md](../../../docs/pools.md), "Inbound",
and [docs/sequencer.md](../../../docs/sequencer.md) for the stop path.
