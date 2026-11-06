# AGENTS.md — SolveBench implementation rules

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current package
layout and data flow. This file records the contracts that must not regress.

## Mission
Build an exercise-first coding workbench for Exercism, LeetCode and CSES. The user chooses a task, edits its solution, runs tests, submits on sources that support it and asks an always-context-aware AI assistant. The current task and current solution are the product's single source of truth.

## Product contract
- No slash commands are required in the UI. Visible actions, mouse and keyboard must reach the same operations.
- Save the current task's buffers before running or submitting. A test result belongs to a specific solution revision, never to a different task or later edit.
- Verify AI context at the serialized HTTP boundary, not only with mock-provider spies.
- Keep browsing selection separate from the opened exercise. Switching a selection must never silently change the editor, test target or chat context.
- Exercise adapters declare supported actions and languages. Toolchain readiness includes version and project dependencies, not just executable existence.
- Prefer user-local toolchain installation; report installation progress and failures in the workbench.

## Architecture rules

1. The exercise workflow owns file saves: run/submit always act on the saved buffer of the opened task.
2. A test result records the solution revision it was produced from; later edits make it stale, and a stale run cannot authorize submission.
3. Chat context is assembled fresh on every message and serialized at the actual HTTP boundary.
4. The model can never mutate the workspace; it describes changes for the human to apply.
5. Browsing selection is separate from the opened exercise; switching selection never retargets editor, tests or chat.
6. Prefer OpenTUI + Solid for the standalone TUI.
7. Build thin vertical slices before broad features.

## Engineering style

- TypeScript strict mode.
- Validate external/model data with Zod (or equivalent) at the boundary.
- Explicit Result/error unions for platform adapters.
- No silent catch-and-continue around save, test or submission failures.
- Keep files small enough to review; avoid giant manager classes.
- Use dependency injection/interfaces for provider, exercise-source and toolchain boundaries.

## Test rules

Release-blocking tests:

- A stale test result cannot authorize submission.
- Switching the browser selection never retargets the opened exercise.
- A test run and a submission belong to the revision that produced them.
- Secret values never appear in serialized provider context.
- Real Unicode input works through the real launcher.

## Scope rules

Out of scope for the alpha:

- debugger;
- extension marketplace;
- remote collaboration;
- autonomous background issue solving;
- 3D graph visualization;
- many model providers;
- cloud backend.

## UX rules

- The right pane is the persistent exercise assistant and ordinary text sends a message.
- Problem, code, tests and submission status are fully accessible, including long statements and long outputs.
- The interface must work with keyboard and mouse; no pane traps focus.
- Exercise workspace startup must not require a git repository or scan the harness source tree.

## Upstream use

Study OpenCode/OpenTUI source, but avoid a permanent whole-repo fork. Any future
OpenCode integration stays adapter-scoped rather than changing the exercise
workflow or the human-owned editor.
