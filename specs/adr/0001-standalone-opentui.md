# ADR-0001 — Standalone OpenTUI host

**Status:** accepted for MVP

## Decision
Build the canonical SolveBench UI as a standalone OpenTUI + Solid application rather than a permanent OpenCode fork.

## Reasons
- SolveBench needs its own editor ownership semantics.
- Domain state should not inherit autonomous-agent assumptions.
- OpenTUI supplies the low-level terminal substrate already.
- OpenCode remains useful as reference and optional adapter.

## Consequences
We must implement our own application shell, editor state and model integration, but gain control and portability.
