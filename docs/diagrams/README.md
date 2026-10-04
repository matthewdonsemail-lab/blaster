# Diagrams

Mermaid sources for the Blaster architecture. Each file is a standalone `.mmd`;
the ones that matter are also embedded in the [README](../../README.md) and in
the prose docs.

Read these three first if you want to understand what Blaster does:

| Start here | What it answers |
| --- | --- |
| [enrollment-state-machine.mmd](enrollment-state-machine.mmd) | What happens to one person over the life of a sequence, and which states only an operator can leave |
| [sequence-runner-tick.mmd](sequence-runner-tick.mmd) | What one cron tick does, and why the two claims are taken in that order |
| [entrypoints-and-transports.mmd](entrypoints-and-transports.mmd) | Every way in, which credential each way needs, and which routes deliberately skip the operator gate |

| Diagram | What it shows |
| --- | --- |
| [enrollment-state-machine.mmd](enrollment-state-machine.mmd) | The enrollment statechart verbatim from `machine.ts`, including the top-level events and the three states that need explanation |
| [sequence-runner-tick.mmd](sequence-runner-tick.mmd) | The cron, the due queue, every skip and defer reason, and the capacity-then-claim ordering |
| [entrypoints-and-transports.mmd](entrypoints-and-transports.mmd) | The four caller-facing surfaces, the two HTTP surfaces that are not interchangeable, both MCP transports, and the ungated routes |
| [guidance-and-ai-prompts.mmd](guidance-and-ai-prompts.mmd) | The eight deterministic reply templates, the one real LLM call, and why `@clack/prompts` is neither of them |
| [system-overview.mmd](system-overview.mmd) | The whole system: surfaces, domain library, Convex backend, two providers |
| [surfaces-and-core.mmd](surfaces-and-core.mmd) | Why the domain library is separate, and how the capability registry stops the surfaces drifting |
| [sequence-builder.mmd](sequence-builder.mmd) | Building, previewing, enrolling and activating - the part an operator controls, with no sends |
| [data-model.mmd](data-model.mmd) | Where state lives: Twenty as the system of record, Convex holding only what Twenty cannot represent, all 15 tables |
| [messaging-profile-resolution.mmd](messaging-profile-resolution.mmd) | The decision that has to happen before a send: bound number, then country, then default, with an unregistered country reported rather than absorbed |
| [send-message-sequence.mmd](send-message-sequence.mmd) | One message end to end, including the inbound webhook and the honest verification branch |
| [prospect-batch-send.mmd](prospect-batch-send.mmd) | A prospect batch: filters as definitions, eligibility split before the send, a per-recipient outcome |
| [breakdown-and-notifications.mmd](breakdown-and-notifications.mmd) | Twenty rows to counts to firing notifications, and the state key that stops a poller repeating an unchanged condition |
| [twenty-auth-paths.mmd](twenty-auth-paths.mmd) | The wall in front of Twenty and which credential opens what; prose version in [identity.md](../identity.md) |
| [deployment-and-gates.mmd](deployment-and-gates.mmd) | What actually serves today on Vercel, the intended Railcode target, and the twenty-one pre-push gates in order |

## Rendering

Any Mermaid renderer takes these directly. GitHub renders fenced `mermaid`
blocks, so a diagram embedded in a Markdown file is the same source as the file
here rather than a second copy that can drift. If the table above lists fewer
files than the directory holds, the table is stale, not the directory.

`pnpm check:diagrams` parses every file here, plus every `mermaid` block
embedded in the README and in `docs/`, with Mermaid's own parser.

### One trap worth knowing about

A bare `%%` line breaks Mermaid. It is not a valid empty comment: the parser
strips `%% text` and leaves `%%` behind, which then fails to parse. Use `%% ---`
for a blank comment line. Nine of these files carried bare `%%` lines on
2026-10-04 and did not render at all; that is the class of bug the gate exists
to catch, because a diagram that does not render still looks correct in a diff.

## Keeping them honest

These describe code, so a diagram that no longer matches the code is a defect.

**Five of these were wrong before 2026-10-04 and were corrected on that date.**
`system-overview.mmd` named a `convex/blaster.ts` that does not exist and three
mounted components that were removed from `convex.config.ts`, and said 13 tables
where the schema composes 15. `data-model.mmd` listed 9 tables.
`sequence-builder.mmd` drew a send loop that is not how the send path works.
`deployment-and-gates.mmd` described only the Railcode target while Vercel is
what is serving, and said eighteen gates where `pnpm check` chains twenty-one.
`enrollment-state-machine.mmd` claimed four top-level events where
`machine.ts` declares three - RESUME is state-local, not global - and never drew
the three that are.

The places that most often drift are the profile resolution order, the outbound
skip rules, the enrollment state machine, the two-claim ordering in the runner,
the set of tables in `convex/schema.ts`, and the mounted components in
`convex/convex.config.ts`.

**What is pinned, and by what.** The profile resolution order and the outbound
skip rules are pinned by tests. Since 2026-10-04 the counts are pinned too, by
`pnpm check:diagrams`: a diagram opts in by carrying a machine-readable
annotation in its header, and the gate re-derives the value from the source and
fails if the two disagree.

```text
%% fact: schema-tables 15
%% fact: machine-top-level-events 3
```

The eleven facts currently available are `schema-tables`, `schema-modules`,
`mounted-components`, `cron-interval-seconds`, `cron-limit`,
`machine-top-level-events`, `registry-entries`, `mcp-tools`, `guidance-seeds`,
and `check-chain-steps`. Adding one means adding it to `facts()` in
`scripts/check-diagrams.mjs`, which is the only supported way to make a
diagram checkable.

The gate never edits. A checker that rewrites documentation hides the drift
instead of surfacing it, and a diagram nobody had to think about is not one
anybody should trust. If a fact is genuinely right and the code is wrong, fix
the code; if the annotation is wrong, fix the annotation in the same commit
that changed the code.
