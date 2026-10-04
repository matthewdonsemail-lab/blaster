# docs/API key

Local credential drop. Ignored by git except this file and the ignore rules
themselves, so nothing in here can be committed by accident.

One file per credential:

- `telnyx.<env>.md` — Telnyx API key + messaging profile IDs
- `twilio.<env>.md` — account SID, auth token
- `meta.<env>.md` — Business Manager ID, ad account IDs, app secret

Keep the real values in these files, never in `.env.local` (which is copied
around) and never in a commit. `.env.local` should reference them or hold
placeholders only.