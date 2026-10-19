# 11 — Implementation Roadmap

## Phase 0 — Feasibility spike (1–2 focused days)

Goal: validate the interaction, not architecture perfection.

Deliver:

- OpenTUI window with 3-pane layout;
- editable center textarea;
- right structured navigator mock;
- bottom command bar;
- basic focus/keymap;
- optional OpenCode `/pair` plugin route proving the same layout.

Exit: user can actually type code in center and issue `/hint` in bottom bar without focus confusion.

## Phase 1 — Pair core vertical slice

Deliver:

- `pair-core` state machine;
- Human Driver invariant;
- provider interface;
- explicit `/hint`, `/explain`, `/review` commands;
- active file + diff context packet;
- navigator structured output;
- tests for forbidden agent mutation.

Exit: use it on a small real repository for 30+ minutes.

## Phase 2 — Agent proposal transactions

Deliver:

- in-memory patch proposal;
- diff view;
- approve/reject;
- stale-base detection;
- `git apply --check` validation;
- `/takeover`, `/giveback`;
- max LOC/files scope.

Exit: agent can implement a small change without touching the working tree before approval.

## Phase 3 — Codebase intelligence

Deliver:

- repository scan;
- tree-sitter symbols/imports;
- LSP adapter where available;
- graph storage;
- `/trace symbol`;
- mission-scoped Explore path.

Exit: unfamiliar medium-size repo navigation is visibly better than text search alone.

## Phase 4 — System-context Review

Deliver:

- diff → symbols → callers/tests expansion;
- finding taxonomy;
- evidence/confidence display;
- invariant ledger v1;
- targeted test suggestions.

Exit: run on 10 real diffs and manually grade signal/noise.

## Phase 5 — Safe Pair hardening

Deliver:

- deterministic permission engine;
- sensitive path rules;
- shell command classifier;
- shadow worktree validation;
- audit log;
- risk gates.

Exit: destructive/mutating paths are blocked by tests, not by model obedience.

## Phase 6 — Optimization

Deliver:

- content-addressed cache;
- incremental graph updates;
- context budget visualization;
- provider prompt caching integration;
- latency instrumentation.

## Prioritization rule

Whenever a feature competes with protocol quality, choose protocol quality.

Do **not** prioritize:

- marketplace;
- desktop GUI;
- remote collaboration;
- autonomous background agents;
- complex visual graphs;
- many providers;

until the Human Driver / Agent Driver loop is demonstrably useful.
