# 03 — TUI / UX Specification

## 1. Primary layout

```text
┌──────────────────────────────────────────────────────────┬──────────────────────────┐
│ FILE / CODE WORKSPACE                                    │ NAVIGATOR                │
│                                                          │                          │
│ Human-owned editor or review diff                        │ Goal                     │
│                                                          │ Plan                     │
│                                                          │ Current observation      │
│                                                          │ Evidence                 │
│                                                          │ Unknowns                 │
│                                                          │ Proposed action          │
├──────────────────────────────────────────────────────────┴──────────────────────────┤
│ > summon / command bar                                                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ mode:HUMAN  branch:main  file:auth.ts  diff:+21-3  diagnostics:1  model:...         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Default width allocation: 72–78% workspace, 22–28% navigator. Collapse navigator below a minimum terminal width.

## 2. Workspace pane states

The center pane is not always the same component. It can show:

- editable source buffer;
- read-only source;
- side-by-side or unified diff;
- trace path details;
- repository map;
- transaction proposal;
- test/diagnostic output.

The active state is visible in the title: `EDIT`, `DIFF`, `TRACE`, `MAP`, `TRANSACTION`.

## 3. Navigator is structured, not chat-first

Sections:

```text
NAVIGATOR
────────────────────────
GOAL
Fix refresh race

PLAN 3/6
✓ locate token flow
✓ inspect store semantics
→ implement guard
○ tests

OBSERVATION
Potential duplicate refresh

EVIDENCE
AuthMiddleware → TokenValidator
TokenStore.rotate() is destructive

UNKNOWN
Runtime adapter is dynamic

NEXT
/trace refresh-token
```

Chat transcript may be available behind a secondary view, but the main pane reflects current state.

## 4. Command bar

The bottom bar is the intentional agent invocation surface.

Commands:

- `/hint` — smallest useful hint
- `/hint more` — increase specificity one level
- `/explain [selection|symbol]`
- `/review [diff|file|selection]`
- `/trace <behavior|symbol|data>`
- `/why` — why current recommendation exists
- `/next` — next planned reading/coding step
- `/takeover` — request Agent Driver
- `/giveback` — restore Human Driver
- `/approve` — approve active transaction
- `/reject [reason]`
- `/context` — show what the agent currently knows
- `/risk` — show permission/risk state
- `/mode <pair|explore|review|trace|learning|safe>`

## 5. Agent intervention UI

The agent should not steal focus. Passive findings appear as compact markers in the navigator/status area.

Severity display:

```text
• info
△ question
⚠ risk
✖ defect
```

Only high-confidence/high-impact conditions may create an attention banner by default.

## 6. Human Driver invariant

When `driver=human`:

- typing edits only the human buffer;
- model output cannot mutate the buffer;
- agent patches render in a separate proposal view;
- Apply/Approve is a human command;
- direct filesystem mutation tools are denied.

This invariant must be covered by tests.

## 7. Agent Driver interaction

```text
TRANSACTION 2/5 — WAITING FOR REVIEW

Intent: Add refresh de-duplication
Scope: src/auth/refresh.ts
Risk: MEDIUM
Changed: +24 -5
Tests: 18/18 pass

[View diff] [Explain] [Approve] [Reject] [Edit manually] [Give back]
```

Approval should be contextual, not a generic yes/no modal.

## 8. Explore UX

Use progressive zoom and breadcrumbs:

```text
repo > backend > auth > session lifecycle > rotateRefreshToken
```

Show:

- where the user is;
- why the current file matters;
- upstream/downstream edges;
- relevant tests;
- next recommended reading node.

Do not flood the UI with a giant graph. Show a task-scoped slice.

## 9. Keyboard model

Suggested starting bindings:

- `Ctrl+P` command palette
- `Ctrl+O` file open
- `Ctrl+J/K` cycle navigator items
- `Ctrl+L` focus summon bar
- `Ctrl+E` focus editor
- `Ctrl+R` review current diff
- `Ctrl+T` trace selection/symbol
- `Ctrl+G` explore/map
- `Esc` return focus / close transient

Avoid copying bindings blindly from OpenCode; keep a compatibility layer if users expect familiar behavior.

## 10. Small-terminal behavior

Under ~110 columns:

- navigator becomes a toggleable drawer;
- status bar shortens;
- diff defaults to unified;
- map view becomes list/tree-based.

## 11. Accessibility and ergonomics

- never use color as the only risk signal;
- preserve terminal text selection where possible;
- support mouse and keyboard, keyboard must be complete;
- allow cursor style configuration;
- avoid constant animation/spinners when idle.
