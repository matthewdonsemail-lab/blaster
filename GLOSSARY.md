# Blaster Domain Glossary

Blaster is an automated outbound SMS delivery, sequencing, and conversation engine integrating Convex, Twenty CRM, and Telnyx messaging profiles.

## Language

**Sequence**:
An ordered multi-step outbound messaging workflow bound to a sender or number pool, a campaign, rate options, and steps.
_Avoid_: Drip, cadence, campaign workflow

**Sequence Draft**:
An uncommitted, resumable builder draft checkpointed in Convex during interactive creation before being committed into a live sequence.
_Avoid_: Unfinished sequence, local draft, temp sequence

**Number Pool**:
A managed group of owned phone numbers rotated sequentially for outbound message delivery with dispatch spacing and per-number daily send ceilings.
_Avoid_: Phone group, sender list, number rotator

**Pool Membership**:
The association and sequential ordering of an owned phone number within a number pool, tracking active/removed state and daily dispatch quota.
_Avoid_: Pool entry, number mapping

**Enrollment**:
A prospect queued in a sequence with a step cursor, delivery status, and next scheduled due timestamp.
_Avoid_: Sequence run, subscriber, recipient queue

**Suppression**:
A durable per-person do-not-contact record keyed on the E.164 peer number, halting outbound communication across all sequences and pools.
_Avoid_: Blacklist, blocklist, DNC entry, opt-out flag

**Purchase Ledger**:
The Convex `phoneNumbers` table recording ordered Telnyx phone numbers, order IDs, monthly costs, 10DLC compliance verification, and messaging profile bindings that Twenty CRM cannot represent.
_Avoid_: Phone inventory, phone cache, number registry

**Agency Phone**:
A workspace phone number record mirrored into Twenty CRM (`agencyPhones`) for operator visibility and sender resolution.
_Avoid_: Sender phone, system phone

**Prospect**:
A target contact in Twenty CRM (`agencyProspects`) eligible for filtered batch outreach and sequence enrollment.
_Avoid_: Recipient (when referring to CRM entity), contact

**Conversation**:
An SMS communication thread between an external peer phone number and a workspace number, maintaining bidirectional message history and delivery receipts.
_Avoid_: Thread, chat
