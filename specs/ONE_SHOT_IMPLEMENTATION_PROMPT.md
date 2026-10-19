# One-shot implementation prompt

You are implementing the first working version of **SolveBench**, a human-agent pair-programming TUI.

Read **all** of these first:

1. `AGENTS.md`
2. `docs/00_EXECUTIVE_SUMMARY.md`
3. `docs/01_PRODUCT_REQUIREMENTS.md`
4. `docs/02_SYSTEM_ARCHITECTURE.md`
5. `docs/03_TUI_UX_SPEC.md`
6. `docs/04_PAIR_CONTROL_PROTOCOL.md`
7. `docs/05_EXPLORE_REVIEW_TRACE_MODES.md`
8. `docs/06_SAFE_MODE_AND_PERMISSIONS.md`
9. `docs/07_CONTEXT_AND_CACHE_ENGINE.md`
10. `docs/08_CODEBASE_GRAPH_ENGINE.md`
11. `docs/09_AGENT_RUNTIME_AND_PROMPTS.md`
12. `docs/10_OPENCODE_OPENTUI_STRATEGY.md`
13. `docs/11_IMPLEMENTATION_ROADMAP.md`
14. `docs/12_TEST_AND_ACCEPTANCE_PLAN.md`

Then execute the following plan without broadening scope.

## Goal of this run

Produce a **runnable vertical-slice MVP**, not a design-only repository.

The MVP must provide:

- OpenTUI + Solid terminal shell;
- center editable file buffer;
- right structured Navigator pane;
- bottom summon/command bar;
- status bar showing mode and driver;
- file open/save for normal text source files;
- Human Driver mode as default;
- `/hint`, `/explain`, `/review`, `/takeover`, `/giveback` commands;
- provider abstraction plus a deterministic mock provider so tests run without network/API keys;
- agent patch proposals kept separate from the working tree;
- approve/reject transaction flow;
- explicit mutation guard preventing agent writes in Human Driver mode;
- git diff context;
- minimal repository scanner and text/symbol-ish search sufficient for a basic `/trace`;
- unit/integration tests for ownership and transaction invariants.

## Recommended repo structure

```text
apps/tui
packages/pair-core
packages/code-intel
packages/agent-runtime
packages/patch-engine
packages/shared
packages/opencode-adapter   # optional spike only
```

Use Bun + TypeScript + Solid + OpenTUI unless a current upstream incompatibility forces an adjustment. Document any adjustment in an ADR.

## Strict implementation order

### Step 1 — scaffold and render
Create workspace, strict TS config, OpenTUI/Solid shell and an in-memory render smoke test.

### Step 2 — pair-core before model integration
Implement Driver/Mode/session state, transitions, command router, intervention types and PermissionService interfaces. Cover with tests.

### Step 3 — editor shell
Open/save file, edit center buffer, command bar focus, right navigator. Ensure model is not required for normal editing.

### Step 4 — mock navigator loop
Use a deterministic mock provider. `/hint` and `/explain` update structured navigator state without touching files.

### Step 5 — mutation boundary
Create a single guarded repository mutation service. Add a test that simulates an agent attempting a write in Human Driver mode and proves it is rejected.

### Step 6 — patch transaction
Implement proposed unified diff stored outside the working tree. Add diff view, approve, reject, stale-base detection and `git apply --check` or equivalent validation.

### Step 7 — driver handoff
`/takeover` requires an explicit scope confirmation in UI/state before setting Agent Driver. `/giveback` immediately revokes write-capable permission.

### Step 8 — minimal review/trace
Review current git diff and show findings with kind/confidence/evidence fields. Implement basic repository scan/search and `/trace <symbol/text>` with evidence locations. Do not overbuild the graph yet.

### Step 9 — real provider adapter
Add exactly one real configurable provider adapter only after mock tests pass. Keep secrets out of config files committed to source.

### Step 10 — acceptance pass
Run typecheck, unit tests and integration tests. Manually exercise TUI. Update README with exact run instructions and known limitations.

## Important behavior

The main invariant is:

> When the driver is HUMAN, an agent cannot mutate the user's main editor buffer or working tree. It may only create a proposal.

Implement this in code, not only prompts.

The second invariant is:

> An unapproved/rejected/stale transaction cannot modify the working tree.

## UX acceptance

At launch:

```text
workspace/code            | navigator
                           |
                           |
---------------------------+---------
> command bar
mode:HUMAN ...
```

The navigator must display sections such as Goal/Plan/Observation/Evidence/Unknown/Next, not only raw chat text.

## Do not do in this run

- no autonomous background agent loops;
- no database/cloud backend;
- no debugger;
- no plugin marketplace;
- no fancy graph visualization;
- no multi-agent orchestration;
- no more than one real provider;
- no full OpenCode fork.

## Optional OpenCode spike

Only after the standalone vertical slice works, and only if time remains, create a tiny OpenCode TUI plugin under `packages/opencode-adapter` that registers a `/pair` custom route and reproduces the layout using current public TUI plugin APIs. Record which required behaviors are blocked or awkward. Do not make the main app depend on this spike.

## Deliverables at the end

- runnable source;
- passing tests;
- README with setup/run;
- `KNOWN_LIMITATIONS.md`;
- `adr/` entries for any major deviation;
- short `IMPLEMENTATION_REPORT.md` containing what works, what is stubbed, test results and next 5 tasks.

Do not stop at scaffolding. Continue until the vertical slice runs or you reach a concrete external blocker; if blocked, document the exact blocker and leave the repository in a passing state.
