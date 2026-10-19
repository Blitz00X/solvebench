# 04 — Pair Control Protocol

## 1. Principle

The model is not trusted to decide whether it is allowed to write. **Policy is enforced by code.**

## 2. Ownership matrix

| Action | Human Driver | Agent Driver | Review Locked |
|---|---:|---:|---:|
| Read files | yes | yes | yes |
| Search/index | yes | yes | yes |
| Run read-only commands | policy | policy | policy |
| Edit main buffer | human only | no | no |
| Propose patch | yes | yes | yes |
| Apply patch | human approval | gate | gate |
| Run tests | policy | policy | yes |
| Git commit | human by default | denied by default | denied |
| Push | denied by default | denied | denied |

## 3. Intervention policy

Agent observations pass through a policy function:

```ts
interface InterventionInput {
  mode: Mode
  driver: Driver
  userActivity: ActivityState
  finding: Finding
  confidence: Confidence
  impact: "low" | "medium" | "high"
  repeated: boolean
}

type InterventionDecision =
  | { kind: "suppress" }
  | { kind: "sidebar" }
  | { kind: "nudge" }
  | { kind: "attention" }
```

Defaults:

- style/nit → suppress or sidebar;
- low-confidence question → sidebar;
- medium/high risk with evidence → nudge;
- likely destructive/security defect → attention.

## 4. Progressive hint ladder

Learning/Human Driver mode uses a hint ladder:

1. point to area/concept;
2. point to symbol/file;
3. state relevant invariant;
4. outline approach;
5. show pseudocode;
6. show exact patch only if explicitly requested.

The current level is session state so `/hint more` is deterministic.

## 5. Takeover handshake

`/takeover` must not immediately edit. It creates a proposed scope:

```text
Agent requests driver control
Goal: implement retry guard
Scope: 1–2 files, <= 40 changed LOC
Tools: read/search/test/propose patch
Direct commit/push: disabled
```

Human accepts or narrows it. Only then is `driver=agent`.

## 6. Change transaction

```ts
interface ChangeTransaction {
  id: string
  intent: string
  baseRevision: string
  files: string[]
  changedSymbols: string[]
  patch: string
  linesAdded: number
  linesRemoved: number
  risk: RiskAssessment
  evidence: EvidenceRef[]
  validations: ValidationResult[]
  state: "draft"|"ready"|"approved"|"rejected"|"applied"|"failed"
}
```

A transaction should be small enough that a human can actually review it.

## 7. Approval semantics

Approval is invalid if:

- base revision changed since proposal;
- patch no longer applies cleanly;
- mandatory validation expired/stale;
- risk class requires a stronger gate;
- requested scope was exceeded.

In that case, rebase/regenerate a new proposal instead of silently applying.

## 8. Giveback

`/giveback` immediately revokes write-capable permissions and returns to Human Driver. Any unapproved transaction remains staged and inert.

## 9. No hidden autonomy

Background indexing is allowed. Background repository mutation is not. The UI must distinguish:

- reading/indexing;
- model reasoning;
- test execution;
- patch proposal;
- real working-tree mutation.
