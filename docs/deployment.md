# Deployment

Blaster deploys to `railcode.dev` as a private app. Pushing to `main` on the
Railcode workspace triggers the build; no dashboard step is involved.

## What the build does

`railcode.json` names the Hono worker (`apps/api/src/index.ts`) and the Railcode
platform bundles it with its own bundler — there is no bundler config in this
repo. `manifest.yaml` scopes the `twenty` connector so the worker reads Twenty
through the platform rather than carrying a long-lived API key.

Convex functions deploy separately with `pnpm convex:deploy`.

## `vercel.json` is legacy

`vercel.json` and `scripts/build-api-function.mjs` remain from the Vercel era.
They are not used by the Railcode build; delete them together when the last
Vercel deployment is retired. Do not commit `api/_bundle.js` or the Vercel
function shim — the Railcode platform does its own bundling.

## Failure modes

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `railcode dev` runs locally but `/api` 404s on the deployed app | The deployed build predates a route that was added | Push to `main` and wait for the next platform build |
| Convex functions are not updating after a push | The Convex deployment and the Hono app deploy on separate tracks | Run `pnpm convex:deploy` against the target deployment |
| A route that works in `pnpm dev` fails on the deployed site | The env var is set locally but not in the deployment config | Set it in the Railcode app config, not in a local `.env` |
