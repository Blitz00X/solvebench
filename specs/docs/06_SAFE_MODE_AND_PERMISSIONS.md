# 06 — Safe Mode and Permission Model

## 1. Objective

Safe Mode is not a claim of formal verification. It is an interaction regime that reduces accidental or opaque change by enforcing deterministic constraints.

## 2. Permission categories

### Read
- read source/config/docs
- git status/diff/log
- symbol/search/index

### Non-mutating execution
- tests
- linters
- static analyzers
- build/typecheck

### Controlled mutation
- stage patch in shadow tree
- modify working tree after approval
- dependency changes
- generated files

### High-risk mutation
- database migrations
- secrets/auth/security policies
- deployment config
- destructive shell/file commands
- git reset/clean/rebase
- commit/push

## 3. Default Safe Pair profile

```text
Agent direct working-tree writes   OFF
Patch proposals                     ON
Max files / transaction             2
Max changed LOC / transaction       60
Dependency changes                  explicit approval
Security-sensitive paths            elevated review
Database migrations                 elevated review
Destructive shell                   DENY
Git commit                           HUMAN ONLY
Git push                             DENY
Network writes                       DENY unless configured
```

## 4. Risk engine

Risk is deterministic + heuristic. Inputs:

- path patterns (`auth/`, `security/`, migrations, infra);
- command class;
- line/file scope;
- public API changes;
- dependency manifest changes;
- schema/config changes;
- graph centrality / fan-out;
- test coverage evidence;
- model-provided rationale (low trust input).

The model can suggest a risk level, but policy computes the effective gate.

## 5. Approval levels

- **L0:** read-only; no prompt.
- **L1:** run safe local validation; visible but no gate.
- **L2:** apply small normal patch; explicit human approval.
- **L3:** sensitive/cross-cutting patch; approval + required validation.
- **L4:** destructive/external side effect; denied by default in MVP.

## 6. Sensitive-path examples

Configurable patterns:

```text
**/auth/**
**/security/**
**/migrations/**
**/terraform/**
**/k8s/**
**/.github/workflows/**
**/payments/**
**/crypto/**
```

## 7. Transaction validation

Before approval, show:

- clean apply check;
- typecheck/lint status;
- targeted tests;
- changed public symbols;
- affected callers;
- unresolved unknowns.

## 8. Audit trail

Store locally:

- transaction ID/time;
- intent;
- exact patch hash;
- base revision;
- validations;
- approval/rejection;
- policy decision reasons.

Do not store chain-of-thought. Store concise rationales and evidence only.
