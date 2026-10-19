# 16 — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TUI editor becomes an IDE rewrite | High | High | limit editor scope; no debugger/marketplace MVP |
| Agent nags constantly | High | High | intervention policy + suppression + explicit summon |
| Review becomes generic LLM lint | Medium | High | require evidence graph and finding taxonomy |
| Static graph wrong in dynamic code | High | Medium | provenance + unknowns + confidence |
| OpenCode coupling slows project | Medium | High | keep adapter optional; own pair-core |
| OpenTUI editor gaps | Medium | Medium | prototype first; fallback to simpler buffer/external editor integration |
| Context costs explode | Medium | High | task-scoped graph, caching, explicit budgeter |
| Agent approval fatigue | Medium | High | bounded transactions, risk-based gates |
| Safe Mode marketed as formal safety | Medium | High | precise wording; no formal-verification claims |
| Model provider behavior differs | High | Medium | schema validation + provider abstraction |
| Huge repo indexing too slow | Medium | High | structural scan first, incremental/task-scoped expansion |
| User loses trust after one unauthorized edit | Low if tested | Critical | mutation guard as hard invariant |

## Kill criteria

Reconsider the product direction if repeated tests show one of these:

1. developers prefer a normal editor + passive sidecar and dislike editing inside TUI;
2. intervention quality cannot beat simple on-demand chat without unacceptable noise;
3. transaction approval costs more time than it saves even on sensitive tasks;
4. reliable graph evidence cannot be produced cheaply enough on target repositories.

These are product-learning criteria, not implementation failures.
