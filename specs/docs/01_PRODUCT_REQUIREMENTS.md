# 01 — Product Requirements Document

## 1. Vision

Build a coding environment where AI increases developer capability without silently taking ownership of the code. The product should make it obvious **who is driving, what the agent knows, what it wants to change, and what evidence supports its advice**.

## 2. Primary users

### A. Developer learning a repository
Needs orientation, guided reading, tracing and feedback without losing the opportunity to understand the code.

### B. Experienced developer in a large codebase
Needs fast system navigation, dependency impact, invariant awareness and bounded assistance.

### C. High-assurance / sensitive development team
Needs explicit permissions, review-before-write, reproducible evidence and auditable change transactions.

### D. Open-source contributor
Needs issue-oriented onboarding: "what must I understand before touching this issue?" and a guided path through relevant files/symbols/tests.

## 3. Jobs to be done

- "Help me understand this codebase without replacing the act of understanding it."
- "Watch what I am implementing and warn me before I drift into a bad design."
- "When I am stuck, reveal the smallest useful hint first."
- "If you write code, let me review it before it becomes my code."
- "Review this diff in the context of the system, not just the changed lines."
- "Show me the path affected by this change."
- "Do not execute dangerous actions without an explicit, contextual gate."

## 4. Functional requirements

### FR-1 Driver ownership
The UI must always show one of `HUMAN`, `AGENT`, or `REVIEW-LOCKED` as the current driver.

### FR-2 Human-owned editor
In Human Driver mode, the agent cannot directly alter the main editable buffer or working tree.

### FR-3 Agent proposals
The agent can propose a patch in a separate staging area. Applying it requires a permission decision.

### FR-4 Change transactions
Agent Driver mode must break implementation into bounded transactions. Configurable limits include files, changed LOC and risk class.

### FR-5 Summon bar
The bottom command bar supports at least:

`/hint`, `/hint more`, `/explain`, `/review`, `/trace`, `/why`, `/next`, `/takeover`, `/giveback`, `/approve`, `/reject`, `/mode`, `/risk`, `/context`.

### FR-6 Navigator pane
The right panel shows structured state, not a pure chat log. It includes goal, plan, current observation, evidence, warnings, unknowns and proposed actions.

### FR-7 Explore Mode
The system can create a task-scoped map of relevant files, symbols, entrypoints, tests and flows.

### FR-8 Review Mode
Review must consider changed symbols, callers/callees, interfaces, tests and known invariants.

### FR-9 Trace Mode
User can trace a behavior, symbol, request, state transition or data object through the repository.

### FR-10 Uncertainty
Every non-trivial review finding must expose confidence and evidence type. Unknown or dynamically-resolved edges must be surfaced as unknown, not invented.

### FR-11 Safe Mode
Safe Mode enforces stricter tool permissions and approval gates. Dangerous commands are denied by default.

### FR-12 Local-first
Repository indexing, graph storage, diff staging and policy state should work locally. Provider calls may be remote depending on user configuration.

## 5. Non-functional requirements

- Responsive on repositories with 100k–1M LOC by using incremental indexing and task-scoped context.
- No full-repository prompt stuffing.
- No keystroke-to-LLM streaming by default.
- Crash-safe transaction staging; rejected agent changes must not leak into the working tree.
- Deterministic policy enforcement outside the model.
- Clear terminal focus and predictable keyboard behavior.
- Provider abstraction so model choice is not coupled to product logic.

## 6. Non-goals for MVP

- replacing VS Code/JetBrains;
- full debugger implementation;
- extension marketplace;
- cloud collaboration;
- autonomous background issue completion;
- CI/CD deployment automation;
- full semantic compiler for every language;
- perfect call graph under reflection/dynamic loading.

## 7. User-visible modes

| Mode | Driver | Agent role | Writes |
|---|---|---|---|
| Pair / Human | Human | navigator/reviewer | proposal only |
| Pair / Agent | Agent | bounded implementer | gated transaction |
| Explore | Human | cartographer | none |
| Review | Human | reviewer | none by default |
| Trace | Human | investigator | none |
| Learning | Human | Socratic mentor | none by default |
| Safe Pair | varies | restricted pair | strict gates |

## 8. MVP success criteria

A developer should be able to complete a real small issue in an unfamiliar repository and report that:

- the code remains understandable to them;
- agent interventions are useful rather than noisy;
- control transfer is obvious;
- accidental agent writes are impossible in Human Driver mode;
- Review Mode finds at least one system-context issue that diff-only review would be less likely to surface.
