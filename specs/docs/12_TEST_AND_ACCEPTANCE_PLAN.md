# 12 — Test and Acceptance Plan

## 1. Unit tests

### pair-core
- driver transition legality;
- intervention policy;
- hint ladder;
- transaction state transitions;
- permission decisions;
- stale approval rejection.

### patch engine
- clean proposal generation;
- rejected patch leaves working tree unchanged;
- stale base fails;
- apply/rollback atomicity;
- line/file limits.

### context engine
- ignore/secret rules;
- deterministic priority selection;
- stale artifact invalidation;
- token/size budgets.

### graph
- node/edge extraction;
- changed-file reindex;
- evidence provenance;
- bounded traversal.

## 2. Integration tests

Use fixture repositories:

1. tiny TypeScript repo;
2. medium monorepo;
3. repo with dynamic imports;
4. repo with auth-sensitive paths;
5. repo with failing tests.

Scenarios:

- Human Driver edits file, agent reviews, no mutation.
- `/takeover`, agent proposes, human rejects, tree unchanged.
- approve valid transaction, patch applies once.
- base changes after proposal, approval is blocked.
- Review Mode traces a changed function to caller/test.
- LSP unavailable → degraded but functional behavior.

## 3. TUI tests

- focus never gets trapped;
- resize behavior;
- small terminal fallback;
- mouse optional, keyboard complete;
- command bar and editor do not steal each other's input;
- navigator updates without resetting cursor.

OpenTUI in-memory render tests should be used where practical.

## 4. Security regression tests

- agent cannot invoke direct write in Human Driver;
- destructive commands denied;
- secret-glob files excluded from provider context;
- path traversal rejected;
- symlink escape considered;
- malicious repository instructions do not override permission policy;
- patch cannot modify outside repo root.

## 5. Product acceptance tests

### HPA test
Give a developer an unfamiliar issue. Success:

- they can describe the affected flow afterwards;
- agent does not write code unless requested;
- useful hints arrive progressively;
- no high-noise constant commentary.

### APH test
Ask agent to implement a small fix. Success:

- work is split into reviewable blocks;
- each block has rationale and evidence;
- no working-tree changes before approval;
- rejection is safe.

### Review test
Run on real diffs. Track:

- actionable findings;
- false positives;
- findings requiring system context;
- time to understand finding.

## 6. MVP release gate

All must pass:

- zero unauthorized working-tree mutation in test suite;
- end-to-end approve/reject works;
- Explore and Trace return bounded evidence-backed output;
- Review findings show confidence/evidence;
- TUI usable at 120×35 and reasonable at ~90 columns;
- startup and normal edit loop remain responsive without model access.
