# 05 — Explore, Review and Trace Modes

## A. Explore Mode — large-codebase understanding

### Goal
Create a navigable mental model instead of producing a giant textual summary.

### Entry flow

User gives a mission, e.g.:

> "I need to add another OAuth provider."

The system returns a task-scoped reading path:

```text
MISSION: Add OAuth provider
1. Provider interface
2. Existing provider implementation
3. Provider registry
4. Callback handler
5. Token persistence
6. Provider tests
```

Each step contains:

- file + symbol;
- why it matters;
- prerequisites;
- callers/callees;
- relevant tests;
- confidence/unknowns.

### Progressive zoom

```text
repository
  → subsystem
    → module
      → file
        → symbol
          → line/range
```

The user can always see a breadcrumb for their current position.

### Cartographer output contract

The model should return a structured map rather than prose-only output:

```json
{
  "mission": "...",
  "entryPoints": [],
  "readingPath": [],
  "flows": [],
  "unknowns": [],
  "suggestedNext": []
}
```

### Evidence hierarchy

Prefer:

1. language server definitions/references;
2. parsed imports/symbols;
3. test references;
4. exact text search;
5. model inference.

Inference must be labeled.

---

## B. Trace Mode — explain flows

Trace requests can target:

- function/symbol call path;
- request lifecycle;
- data object propagation;
- state machine transition;
- event publication/consumption;
- error propagation;
- configuration resolution.

### Trace result

```text
POST /auth/login
  ↓ router/auth.ts
AuthController.login
  ↓
AuthService.authenticate
  ├─ UserRepository.find
  └─ PasswordVerifier.verify
  ↓
SessionManager.create
  ↓
Redis.set
  ↓
Set-Cookie
```

Every edge stores a source and confidence. Dynamic/reflection edges are marked as unresolved or inferred.

### Trace commands

- `/trace selection`
- `/trace symbol rotateRefreshToken`
- `/trace "user presses login"`
- `/trace data SessionToken`
- `/trace state Order.status`

---

## C. Review Mode — system-context review

### Review pipeline

```text
git diff
  ↓
changed files/symbols
  ↓
graph expansion
  ↓
callers + interfaces + data paths
  ↓
known invariants
  ↓
relevant tests/coverage evidence
  ↓
findings
```

### Finding taxonomy

**Defect** — concrete incorrect behavior with a demonstrable path.  
**Risk** — plausible failure mode requiring validation.  
**Question** — intent/design cannot be safely inferred.  
**Nit** — non-behavioral quality/style concern.

### Finding shape

```ts
interface Finding {
  kind: "defect"|"risk"|"question"|"nit"
  title: string
  explanation: string
  confidence: "low"|"medium"|"high"
  impact: "low"|"medium"|"high"
  locations: LocationRef[]
  evidence: EvidenceRef[]
  affectedPaths: TraceRef[]
  suggestedValidation?: string[]
}
```

### Review rules

- Avoid generic style comments unless requested.
- A high-severity finding must include concrete evidence.
- Do not pretend static analysis can see dynamic wiring it cannot see.
- Distinguish "test missing" from "behavior broken".
- Never auto-apply review fixes in Review Mode.

---

## D. Invariant Ledger

Explore/Review can accumulate candidate invariants:

```text
AUTH-001 Refresh tokens are single-use.
AUTH-002 Access tokens are not persisted.
AUTH-003 Authentication failures do not reveal account existence.
AUTH-004 Token rotation must be atomic.
```

Each invariant has provenance:

- `declared` — user/docs explicitly say it;
- `tested` — encoded by tests;
- `derived` — inferred from implementation patterns;
- `uncertain` — hypothesis.

Only declared/tested invariants should be treated as strong constraints by default.
