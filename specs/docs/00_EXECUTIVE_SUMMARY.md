# 00 — Executive Summary

## Problem

Current coding-agent UX usually assumes the agent is the main actor. That is effective for throughput, but creates weaknesses in three situations:

- **learning:** the agent solves the problem faster than the developer can internalize it;
- **large codebases:** the agent can modify code before the human has formed a mental model;
- **high-assurance work:** a final diff review is too late and too coarse as the primary control boundary.

SolveBench changes the unit of interaction from **prompt → autonomous execution → review** to a continuous, reversible pair-programming loop.

## Core abstraction: Driver / Navigator

The system always has an explicit driver.

### Human Driver

The human owns the editable buffer and working-tree writes. The agent observes relevant state and may:

- stay silent;
- raise a nudge;
- explain;
- answer a question;
- trace an execution/data path;
- review the current change;
- propose a patch that remains separate until approved.

### Agent Driver

The agent may produce code, but only as bounded **change transactions**. Each transaction has:

- intent;
- scope;
- touched symbols/files;
- rationale;
- risk level;
- proposed diff;
- expected tests;
- approval status.

The transaction is not applied until the configured gate is satisfied.

## Core modes

- **Pair:** normal Human Driver / Agent Driver handoff.
- **Explore:** maps a large codebase progressively from repository → subsystem → module → symbol.
- **Trace:** answers "what happens when X occurs?" using call/data/state paths.
- **Review:** reviews a change using repository context, callers, invariants and tests—not only the diff.
- **Safe Pair:** applies stricter permissions, smaller change blocks and mandatory gates.
- **Learning:** prevents direct solution dumping and uses progressive hints.

## Product differentiator

The differentiator is not the editor and not the underlying LLM. It is the **interaction protocol**:

1. explicit code ownership;
2. explicit control transfer;
3. intervention policy;
4. bounded proposals;
5. system-context review;
6. visible evidence and uncertainty;
7. persistent codebase map/invariants.

## Recommended architecture

```text
TUI (OpenTUI + Solid)
      │
      ▼
pair-core
 ├── driver state machine
 ├── intervention policy
 ├── change transactions
 ├── permission engine
 ├── command router
 └── session state
      │
      ├─────────────┐
      ▼             ▼
code-intel       agent-runtime
 ├ LSP            ├ provider adapter
 ├ tree-sitter    ├ prompt assembler
 ├ git            ├ context budgeter
 ├ search         ├ tool policy
 └ repo graph     └ structured outputs
```

Keep `pair-core` independent from OpenCode and the TUI so other hosts can be built later.

## Upstream strategy

Use OpenCode as a **reference and optional adapter**, not as the foundation of the product's state model. Use OpenTUI as the TUI rendering substrate.

A short OpenCode plugin spike is still valuable because the current plugin system provides full-screen custom routes, keymap layers, sidebar content slots, app slots, host state and SDK access. This can validate whether the UX feels right before the standalone shell is finished. However, plugin limitations around direct prompt/editor control make it unsuitable as the only long-term architecture for the central human-owned editor.

## MVP target

A credible MVP should be roughly 4 vertical slices:

1. **Editor + Navigator + Command Bar**
2. **Human Driver review/hint loop**
3. **Agent Driver proposed patch + approval transaction**
4. **Explore/Trace/Review using a lightweight repository graph**

Anything beyond these slices is secondary.
