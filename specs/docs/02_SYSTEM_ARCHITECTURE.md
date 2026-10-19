# 02 — System Architecture

## 1. Package boundaries

Recommended monorepo:

```text
solvebench/
├─ apps/
│  └─ tui/                     # OpenTUI + Solid host
├─ packages/
│  ├─ pair-core/               # pure domain state + policies
│  ├─ code-intel/              # indexing, search, graph, LSP adapters
│  ├─ agent-runtime/           # provider/tool/prompt adapters
│  ├─ patch-engine/            # isolated proposals + apply/rollback
│  ├─ storage/                 # sqlite/json persistence
│  ├─ shared/                  # schemas/types
│  └─ opencode-adapter/        # optional plugin/spike only
├─ prompts/
├─ tests/
└─ docs/
```

The most important boundary is: **pair-core never depends on a model SDK or TUI renderer.**

## 2. Domain model

```ts
type Driver = "human" | "agent" | "review_locked"
type Mode = "pair" | "explore" | "review" | "trace" | "learning" | "safe"

type InterventionLevel =
  | "silent"
  | "nudge"
  | "hint"
  | "explain"
  | "propose_patch"
  | "request_takeover"

type FindingKind = "defect" | "risk" | "question" | "nit"
type Confidence = "low" | "medium" | "high"
```

### Session state

```ts
interface PairSession {
  id: string
  repoRoot: string
  mode: Mode
  driver: Driver
  goal?: Goal
  plan: PlanStep[]
  focus: FocusState
  permissions: PermissionPolicy
  learning?: LearningState
  transactions: ChangeTransaction[]
  findings: Finding[]
  contextLedger: ContextLedger
}
```

## 3. State machine

```text
HUMAN_DRIVER
  ├─ /takeover + approval ───────────► AGENT_DRIVER
  ├─ /review ────────────────────────► REVIEW_LOCKED
  └─ safe policy violation ──────────► REVIEW_LOCKED

AGENT_DRIVER
  ├─ proposal ready ─────────────────► REVIEW_LOCKED
  ├─ /giveback ──────────────────────► HUMAN_DRIVER
  └─ transaction limit reached ──────► REVIEW_LOCKED

REVIEW_LOCKED
  ├─ approve transaction ────────────► AGENT_DRIVER or HUMAN_DRIVER
  ├─ reject transaction ─────────────► AGENT_DRIVER or HUMAN_DRIVER
  └─ cancel ─────────────────────────► HUMAN_DRIVER
```

Driver switching is a domain transition, not a prompt convention.

## 4. Event bus

Use typed events to decouple editor, graph, runtime and UI.

Representative events:

- `editor.file_opened`
- `editor.buffer_changed`
- `editor.selection_changed`
- `git.diff_changed`
- `diagnostic.updated`
- `graph.index_updated`
- `agent.observation_ready`
- `agent.finding_emitted`
- `transaction.proposed`
- `transaction.approved`
- `transaction.rejected`
- `permission.requested`
- `driver.changed`

Keystrokes must not directly invoke the model. Buffer changes are debounced and summarized into meaningful edit events.

## 5. Services

### EditorService
Owns buffers, file open/save, cursor, selection and undo/redo. Enforces ownership before writes.

### RepositoryService
File tree, git state, ignore rules, working-tree snapshots and branch metadata.

### CodeIntelService
Symbols, definitions, references, import graph, diagnostics and semantic/text search.

### GraphService
Stores codebase nodes/edges, task-scoped slices, traces and confidence metadata.

### ContextService
Builds minimal context packets from active file/symbol/diff/graph/test evidence.

### AgentService
Provider-agnostic structured LLM invocation. No direct filesystem access without tools and policy.

### TransactionService
Creates isolated agent patches, calculates risk/scope, runs validation, applies or discards atomically.

### PermissionService
Deterministic decision engine for tool calls and transaction application.

### ReviewService
Coordinates diff → changed symbols → graph expansion → tests → invariant checks → findings.

## 6. Storage

Use SQLite for durable structured state once needed. MVP can start with JSON but schemas should make migration straightforward.

Suggested logical tables:

- sessions
- goals
- plan_steps
- graph_nodes
- graph_edges
- invariants
- findings
- transactions
- learning_concepts
- context_artifacts

Do not store provider secrets in SQLite. Use environment variables / OS credential store later.

## 7. Isolation for agent proposals

Preferred order:

1. compute patch in memory;
2. apply patch to an ephemeral shadow worktree or temporary tree;
3. run diagnostics/tests there;
4. show diff to human;
5. only then apply to real working tree.

For MVP, an in-memory/unified diff plus `git apply --check` is acceptable, but production should support shadow-worktree validation.

## 8. Failure behavior

- If LSP dies: degrade to tree-sitter/text search and show reduced confidence.
- If model call fails: preserve editor/session state; no write is allowed as a side effect.
- If transaction validation fails: transaction remains unapproved.
- If graph is stale: tag evidence with revision/hash and re-index changed files.
- If terminal closes: unapproved patches remain out of the working tree.
