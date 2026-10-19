# 15 — Implementation Backlog

These are ordered so they can be copied into GitHub issues.

## Epic A — Shell and editor

### A1 Create OpenTUI/Solid application skeleton
Acceptance: renders workspace/nav/command/status panes; resize works.

### A2 Editable code buffer
Acceptance: open/save text file, cursor, selection, undo/redo baseline, syntax display if available.

### A3 Focus/keymap manager
Acceptance: deterministic focus transitions; command bar does not corrupt editor input.

### A4 File opener
Acceptance: fuzzy file list; respects gitignore/config exclusions.

## Epic B — Pair core

### B1 Driver state machine
### B2 Mode state machine
### B3 Intervention policy
### B4 Command router
### B5 Human Driver mutation guard

B5 is release-blocking.

## Epic C — Agent runtime

### C1 Provider interface + one provider implementation
### C2 Context packet builder
### C3 Structured observation schema
### C4 Navigator renderer
### C5 Progressive hint ladder

## Epic D — Transactions

### D1 Patch proposal format
### D2 Proposal diff view
### D3 approve/reject
### D4 base-revision validation
### D5 scope/risk calculation
### D6 shadow validation (post-MVP if needed)

## Epic E — Repository intelligence

### E1 repository scanner
### E2 tree-sitter symbol/import extraction
### E3 LSP adapter
### E4 graph store/query
### E5 task-scoped graph slice
### E6 trace renderer

## Epic F — Review

### F1 changed-symbol extraction
### F2 caller/test expansion
### F3 finding schema
### F4 invariant ledger
### F5 review navigator UI

## Epic G — Safety

### G1 PermissionService
### G2 command classifier
### G3 sensitive paths
### G4 secret/context exclusion
### G5 audit events

## Epic H — Optional OpenCode spike

### H1 `/pair` TUI plugin route
### H2 sidebar navigator slot
### H3 plugin command/keymap
### H4 record plugin limitations and delete spike if not reusable

The spike should never become a dependency of `pair-core`.
