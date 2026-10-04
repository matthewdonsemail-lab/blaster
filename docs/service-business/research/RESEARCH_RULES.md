# Rules for this research directory

Applies to everything tracked under `docs/service-business/`.

## No personal contact data, ever

No names of individuals, no email addresses, no `linkedin.com/in/` links, no
phone numbers tied to a person, no direct-message handles. Not in a table, not in
a footnote, not "just this once."

- Businesses are fine. Job postings are fine. Decision-maker **roles** are fine
  ("Director of Marketing"). A named human is not.
- If contact data is genuinely needed to work a list, it lives in
  `docs/service-business/private/` (gitignored, local only) and never enters a
  commit, a PR, or a work-log message.
- This is not only a privacy norm. The repository is **public**, so a committed
  name and work email is a permanent public disclosure of a real person's contact
  details who never consented to it.

Enforcement belongs in a pre-commit hook that fails the commit on an email or
`linkedin.com/in/` match inside `docs/service-business/`. Owner approval needed
before adding it.

## Corrections get recorded, not silently overwritten

When a source turns out to be wrong — a fee attributed to the wrong vendor, a
signal that does not exist in the data — the earlier claim is corrected in place
*and* the correction is stated in the message to the thread. Earlier messages on
the relay are permanent and stay fetchable by event ID; a rewrite that does not
name what changed leaves readers with two contradictory versions and no way to
tell which is current.

## Claims carry provenance

Any number that appears in a customer-facing quote traces to a primary source in
the Sources table, and that source is a page operated by the party charging the
fee. Vendor-published figures are never quoted as another vendor's figures.

## Findings are falsifiable or they are not findings

Separate in every document: what the tool returned, what we concluded from it,
and what remains unverified. A research note that hides its own assumptions is
worse than no note, because it gets quoted later as settled.
