# ADR 0001 — MVP scope, stack and deviations

- Status: accepted
- Date: 2026-09-29

## Context

We built the first working version of SolveBench from the development pack in
`specs/`. The pack recommends Bun + TypeScript + Solid + OpenTUI and a monorepo
(`apps/tui`, `packages/pair-core`, `code-intel`, `agent-runtime`, `patch-engine`,
`shared`, optional `opencode-adapter`).

## Decisions

1. **Stack confirmed.** `@opentui/core` 0.5.12 + `@opentui/solid` 0.5.12 +
   `solid-js` 1.9.12 (the exact peer version), Bun 1.4.2, TypeScript 5.9.2.
   Headless rendering is done through `@opentui/core/testing` and
   `@opentui/solid`'s `testRender`.

2. **No separate `context-engine` package.** Context assembly lives in
   `packages/agent-runtime` (provider, prompt assembly and context budgeting
   belong to the same runtime boundary per `specs/docs/09`). This avoids a
   package with a single consumer.

3. **No `storage` package in the MVP.** Session state is in memory. SQLite is
   deferred; schemas are zod so migration is mechanical.

4. **No OpenCode adapter spike.** The prompt marks it optional and conditional
   on remaining time. It is not implemented; `pair-core` stays free of any
   OpenCode coupling by construction.

5. **`AGENTS.md` lives at the repo root, not duplicated under `specs/`.** It is
   the file coding agents read; a second copy would drift.

6. **Mock provider only.** The loop must run offline and deterministically, so a
   real provider adapter (spec step 9) is deferred and documented as a next task.

7. **Minimal trace instead of a graph engine.** `/trace` is bounded literal
   search with definition-like hits ranked first and an explicit `unresolved`
   flag, per `specs/docs/08` §8 ("do not build a force-directed graph for MVP").

## Consequences

- The MVP runs and is verifiable with no network and no API key.
- Real-provider, risk-engine, shadow-worktree, diagnostics and persistence work
  remain; they are listed in `IMPLEMENTATION_REPORT.md`.
- `pair-core` remains host-independent and import-pure, verified by grep in the
  validation suite.
