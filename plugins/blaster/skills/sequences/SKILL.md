---
name: sequences
description: Build, validate, and dry-run a multi-step SMS sequence in Blaster. A sequence is a sending number (or pool), a campaign, a set of options, and an ordered list of steps. Use to plan outreach, check a draft, or preview who would receive each step.
---

A sequence is a sending number, a campaign, a set of options, and an ordered
list of steps. Build it, dry-run it, then turn it on.

## The three operations

- `blaster_validate_sequence` checks a draft and reports every problem at once:
  a step with no text, a missing stop condition, a negative delay.
- `blaster_preview_sequence` runs the real statechart over a set of recipients
  and shows who would receive the next step and who is skipped, with the reason.
  It sends nothing - it is the compliance plan before anything is turned on.
- The recorded-draft lifecycle (`blaster sequence new|list|show|edit|run|rm`
  in the CLI) keeps a draft in `.blaster/sequences.json` so it can be built
  once and reused.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `stopOnReply` | `true` | Stops the sequence as soon as the recipient replies |
| `respectDoNotContact` | `true` | Never sends to an opted-out prospect |
| `requireProfileForCountry` | `true` | Skips a recipient whose country has no registered profile |
| `dailyCapPerRecipient` | `0` | Ceiling on messages per recipient per day; `0` means no cap |

Eligibility is checked twice: in the dry run, so an operator sees who is
skipped, and again at send time, because a recipient can opt out between the
two. The send-time check is the one that counts.

## Enrolling prospects

`blaster_enroll_recipients` walks `agencyProspects` with the send filter DSL,
enrolls the matching prospects, and mirrors `outboundState` back. The filters
are the same definitions the prospect search uses; they are validated against
the shared menu on the server, so a raw query is never submitted.

The full rule, the quiet-hours behaviour, and the reply-stops-the-sequence
guarantee are in [docs/sequencer.md](../../../docs/sequencer.md).
