# SolveBench — Development Pack

**Project name:** SolveBench
**Date:** 2026-09-29  
**Purpose:** A human-agent coding harness where control can deliberately switch between **Human Driver / Agent Navigator** and **Agent Driver / Human Reviewer**.

This package is written so it can be handed to a coding agent as a single implementation brief. Start with `ONE_SHOT_IMPLEMENTATION_PROMPT.md`, then let the agent read `AGENTS.md` and the documents under `docs/`.

## Product thesis

Most coding agents optimize for autonomy: give a goal, let the agent edit the repository, review afterwards. SolveBench optimizes for **controlled cooperation**.

Two symmetric operating modes are first-class:

- **HumanPairAgent (HPA):** human writes code; agent observes, maps the codebase, hints, reviews, traces impact, and intervenes only according to policy.
- **AgentPairHuman (APH):** agent proposes small, explainable changes; human reviews and approves each bounded transaction before it reaches the working tree.

The same primitives also support:

- onboarding into large repositories,
- code review with system context rather than diff-only context,
- safety-sensitive development,
- learning and deliberate practice,
- controlled refactors and migrations.

## Recommended technical direction

Do **not** begin with a hard fork of OpenCode. Build a reusable `pair-core` and a standalone OpenTUI/Solid TUI. Before that, optionally build a **short OpenCode TUI plugin spike** to validate layout and interaction cheaply.

Why this direction:

1. OpenCode's TUI is now separated around `@opencode-ai/tui` and uses OpenTUI/Solid.
2. OpenCode's TUI plugin system can register full-screen routes, keymaps, sidebar slots and prompt-related UI, which is useful for a fast UX experiment.
3. Current plugin boundaries still do not expose enough control over the host prompt/editor for SolveBench's central "human-owned editor" semantics. A standalone TUI avoids fighting the host.
4. OpenTUI already provides editable text areas, code rendering, syntax highlighting primitives, keymaps, layout, mouse handling and terminal rendering.

## Package map

- `docs/00_EXECUTIVE_SUMMARY.md` — product and architecture in one document
- `docs/01_PRODUCT_REQUIREMENTS.md` — PRD, users, scope, non-goals
- `docs/02_SYSTEM_ARCHITECTURE.md` — package boundaries, services, state machines
- `docs/03_TUI_UX_SPEC.md` — exact UI behavior and key interactions
- `docs/04_PAIR_CONTROL_PROTOCOL.md` — driver ownership and intervention protocol
- `docs/05_EXPLORE_REVIEW_TRACE_MODES.md` — large-repo understanding and review modes
- `docs/06_SAFE_MODE_AND_PERMISSIONS.md` — bounded changes, approvals, risk gates
- `docs/07_CONTEXT_AND_CACHE_ENGINE.md` — efficient context assembly and caching
- `docs/08_CODEBASE_GRAPH_ENGINE.md` — repo graph, flows, invariants, trace engine
- `docs/09_AGENT_RUNTIME_AND_PROMPTS.md` — model/runtime policy and prompt contracts
- `docs/10_OPENCODE_OPENTUI_STRATEGY.md` — reuse/fork/plugin decision
- `docs/11_IMPLEMENTATION_ROADMAP.md` — milestones and ordered delivery
- `docs/12_TEST_AND_ACCEPTANCE_PLAN.md` — test matrix and acceptance criteria
- `docs/13_SECURITY_PRIVACY_THREAT_MODEL.md` — threat model and defaults
- `docs/14_OBSERVABILITY_AND_METRICS.md` — measurements without surveillance
- `docs/15_BACKLOG_AND_ISSUES.md` — ready-to-create implementation backlog
- `docs/16_RISK_REGISTER.md` — technical/product risks and mitigations
- `docs/17_RESEARCH_SNAPSHOT.md` — dated upstream research snapshot
- `prompts/` — baseline role prompts
- `schemas/` — machine-readable config schema
- `wireframes/` — ASCII layouts
- `adr/` — architecture decision records
- `AGENTS.md` — repository-level instructions for coding agents
- `ONE_SHOT_IMPLEMENTATION_PROMPT.md` — direct handoff prompt

## MVP definition

The MVP is successful when a developer can:

1. launch the TUI in a local git repository;
2. open and edit a file in the center pane;
3. see an agent-owned navigator pane on the right;
4. invoke `/hint`, `/review`, `/trace`, `/explain`, `/takeover`, `/giveback` from the bottom command bar;
5. keep human edits and agent proposals visibly separate;
6. switch between Human Driver and Agent Driver;
7. inspect an agent patch before approving it;
8. reject a patch without modifying the working tree;
9. run Explore Mode to get a bounded code-flow map;
10. run Review Mode against the current diff with evidence/callers/tests shown.

No cloud backend is required for MVP. Keep the core local-first and provider-agnostic.
