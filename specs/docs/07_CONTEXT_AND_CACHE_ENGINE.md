# 07 — Context and Cache Engine

## 1. Goal

Keep the agent aware of the relevant repository state without streaming the whole repository or every keystroke.

## 2. Context packet

Each model call receives a structured packet assembled from selected artifacts:

```ts
interface ContextPacket {
  mode: Mode
  goal?: string
  driver: Driver
  activeFile?: FileSlice
  activeSymbol?: SymbolSummary
  selection?: TextRange
  recentSemanticDiff?: DiffSummary
  diagnostics?: Diagnostic[]
  graphSlice?: GraphSlice
  relevantTests?: TestRef[]
  invariants?: Invariant[]
  terminalSummary?: TerminalEvent[]
  priorDecisions?: DecisionSummary[]
  unknowns?: Unknown[]
}
```

## 3. Edit event strategy

Do not call a model on every edit.

```text
keystrokes
  ↓
editor buffer
  ↓ debounce (e.g. 750–1500 ms)
syntax/AST change detection
  ↓
meaningful semantic delta?
  ├─ no → no model work
  └─ yes → update local summaries/cache
```

Model invocation occurs on explicit summon, review checkpoints, high-confidence policy triggers, or configured idle checkpoints.

## 4. Cache layers

### L0 process cache
Parsed files, symbols, open buffers.

### L1 repository artifact cache
Hash-keyed parse/symbol/reference results.

### L2 graph cache
Edges and task-scoped subgraphs keyed by file/symbol hashes.

### L3 prompt artifact cache
Stable summaries such as module purpose, API contracts and known tests. Invalidate based on source hashes.

### L4 provider-side prompt caching
Use provider capabilities when available, but never rely on them for correctness.

## 5. Content-addressing

Use hashes:

```text
artifact_key = hash(repo_id, relative_path, content_hash, parser_version)
```

Graph edges carry source revision/hash so stale evidence is detectable.

## 6. Context budgeter

Priority order:

1. direct user selection/current symbol;
2. current diff;
3. direct callers/callees relevant to task;
4. explicit invariants;
5. diagnostics/tests;
6. recent decisions;
7. broader module summaries.

Drop broad summaries before dropping direct evidence.

## 7. Explainable context

`/context` should show the actual categories sent to the agent:

```text
Current symbol        420 tok
Current diff          860 tok
3 callers             720 tok
2 invariants          110 tok
Diagnostics            90 tok
Plan                   160 tok
```

This provides observability and helps diagnose bad agent advice.

## 8. Privacy

Before provider calls, allow path/content rules:

- never-send globs;
- secret scanner/redaction;
- local-only files;
- maximum file size;
- binary exclusion.

Context selection must honor these rules before serialization.
