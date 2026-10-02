---
name: send-sms
description: Send a jurisdiction-correct SMS through the Telnyx messaging profile a recipient resolves to. Use when the operator asks to text a prospect or number, or to preview what a batch would do before sending.
disable-model-invocation: true
---

Send an SMS through Blaster, which resolves the Telnyx messaging profile from
the recipient before sending so a message never lands on the wrong registration.

## Resolve first, send second

`blaster_messaging_profile` answers which profile a recipient resolves to and
why. Run it before `blaster_send_message` for any recipient you are not certain
about. The resolution order is: the profile bound to the sending number (when an
operator set one), then the country profile for the recipient, then the default.
A country with no dedicated profile falls back to the default and returns a
warning naming the variable to set - that warning is a deployment gap, not an
error to work around.

## Single send

`blaster_send_message` takes the recipient, the sending number, and the text.
It needs Twenty and Telnyx configured; when they are not, the tool says so
rather than failing obscurely. Check the response's `profileId` and `warnings`:
a send that returns a warning named a country is the one to flag to the operator,
not retry.

## Batch send

`blaster_list_records` reads the prospect object; the batch path previews with
`blaster_preview_sequence` or the prospect search tool before the run. Eligibility
is decided before anything is sent - a row with no sendable phone, or one in a
terminal lifecycle stage, is skipped with a reason. Every recipient gets its own
outcome; one batch reports what happened to each rather than an all-or-nothing
number.

## Quiet hours

Marketing texts may not be sent outside 08:00-21:00 in the recipient's local
time. A step that comes due in quiet hours is pushed to the next allowed instant,
not dropped. A recipient that cannot be placed in a time zone is parked
`awaiting-human` rather than guessed at. See [docs/sequencer.md](../../../docs/sequencer.md)
for the full rule and the enforcement.

## Do not invent a profile

A batch or a single send inherits the sending number's own `agencyPhones` record
as the profile authority. Do not pass a messaging profile id the record does not
carry; Blaster does not fall back to a global profile when the number's record
has none.

The per-number rate budget and the account send rate limiter are separate. A
send is admitted only when the limiter grants capacity; a refusal defers, it does
not fail. See [docs/pools.md](../../../docs/pools.md), "The pool and the send
rate limiter".
