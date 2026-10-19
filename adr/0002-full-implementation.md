# ADR 0002 — Full implementation decisions

- Status: accepted
- Date: 2026-09-29
- Supersedes scope of: ADR 0001 (which covered the MVP slice)

## Context

The MVP vertical slice was complete (ADR 0001). This ADR records the decisions
made while completing the roadmap: codebase intelligence, review, safe-pair
hardening, optimization, a real provider and persistence.

## Decisions

1. **tree-sitter WASM, not a native binding.** `web-tree-sitter@0.25.10` with
   `tree-sitter-wasms@0.1.13` runs under Bun without a compiler toolchain.
   Native `tree-sitter` was rejected to keep installs reproducible. The parser
   is behind the `SyntaxParser` interface so it can be swapped.

2. **WASM asset resolution is explicit.** Bun's isolated install layout hides
   `tree-sitter-wasms` under `node_modules/.bun/...`, so `resolveWasmDirectory`
   searches known shapes. It returns null instead of throwing, and unsupported
   files are skipped silently.

3. **Two-pass extraction.** Declarations are registered before calls are
   resolved so a call to a function declared later in the file still resolves.

4. **Risk engine is a floor, not an estimate.** Path patterns, scope and fan-out
   compute a deterministic minimum; `modelSuggestedRisk` can only raise it.
   This directly implements the spec rule that the model must not decide its own
   permission state.

5. **Shadow validation uses `git worktree`.** It is the least invasive isolation
   available without a container, and it composes with the existing `GitPort`.
   A factory keeps tests off the real filesystem.

6. **`bun:sqlite`, no ORM.** Native to the runtime, zero dependencies. Schemas
   are versioned forward-only; a newer schema throws rather than resets.

7. **One real provider, mock default.** `HttpModelProvider` targets the
   OpenAI-compatible chat completions shape. The API key is read from an env var
   at call time. This satisfies "exactly one real provider" while keeping every
   test offline.

8. **`packages/storage` owns persistence; domain packages own types.** Graph
   node/edge types live in `code-intel`; `storage` depends on it rather than
   duplicating the shape or creating a cycle.

9. **No OpenCode adapter.** Still optional in the spec and still not needed;
   `pair-core` remains host-independent.

## Consequences

- The full loop (index → explore/trace/review → propose → risk → shadow →
  approve → apply → audit → persist) runs offline and is tested end to end.
- LSP-grade reference precision is not available; the graph is parser-based and
  marks uncertainty rather than guessing.
- The default sensitive-path patterns intentionally over-match filenames; hosts
  narrow them in policy. Erring toward more review is the safe direction.
