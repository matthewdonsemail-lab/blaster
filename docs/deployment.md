# Deployment

Blaster deploys to `railcode.dev` as a private app. Pushing to `main` on the
Railcode workspace triggers the build; no dashboard step is involved.

## What the build does

`railcode.json` names the Hono worker (`apps/api/src/index.ts`) and the Railcode
platform bundles it with its own bundler — there is no bundler config in this
repo. `manifest.yaml` scopes the `twenty` connector so the worker reads Twenty
through the platform rather than carrying a long-lived API key.

Convex functions deploy separately with `pnpm convex:deploy`.

## What is actually serving today (checked 2026-10-04)

The only documented entry point is **`https://blaster.listeningkit.com`** (an `A` record in the
Cloudflare zone for `listeningkit.com`, DNS only, pointing at Vercel and attached to the project as a
custom domain). It serves the API and the MCP endpoint (`/mcp`). The older
`blaster-web-nine.vercel.app` hostname still answers but is not to be documented or shared; `blaster login`
still defaults to it because the Twenty OAuth redirect URI is registered against it, and moving login means
registering a new redirect URI first. The hosted API is the **Vercel** project
`blaster-web`, deployed on every push to `main` of the GitHub repo
(`matthewdonsemail-lab/blaster`; see the repo's Deployments). So `vercel.json`
and `scripts/build-api-function.mjs` are live, not legacy: a route that needs a
public path must be listed in `vercel.json` `rewrites`, or Vercel serves the
single-page app for it (a POST to `/mcp` returned 405 until it was added).
The Railcode build described above is the intended target; until it replaces
Vercel, treat `vercel.json` as the source of truth for what is reachable.

Convex is hosted only. "Dev" and "production" are not local versus remote; they
are which deployment URL and which environment variables a process is given.
Today the hosted API, the CLI session and the runner all use one deployment,
`bold-caribou-638`, so there is one body of data. Env is set on it with
`npx convex env set` (unset `CONVEX_SELF_HOSTED_URL` and
`CONVEX_SELF_HOSTED_ADMIN_KEY` for that command if they are exported).

## Failure modes

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `railcode dev` runs locally but `/api` 404s on the deployed app | The deployed build predates a route that was added | Push to `main` and wait for the next platform build |
| Convex functions are not updating after a push | The Convex deployment and the Hono app deploy on separate tracks | Run `pnpm convex:deploy` against the target deployment |
| A route that works in `pnpm dev` fails on the deployed site | The env var is set locally but not in the deployment config | Set it in the Railcode app config, not in a local `.env` |
