# 14 — Observability and Metrics

## Why measure

The product can easily become noisy, slow or over-autonomous. Metrics should test whether the pair protocol actually improves control and understanding.

## Local session metrics

- model calls per 10 minutes of editing;
- suppressed vs surfaced observations;
- hint ladder depth;
- driver switch count;
- proposed/approved/rejected transactions;
- average transaction LOC/files;
- review findings by type/confidence;
- context packet size by category;
- cache hit rate;
- graph expansion size;
- time to first useful trace;
- validation latency.

## Quality metrics

- false-positive review rate (manual label);
- percentage of high-severity findings with deterministic evidence;
- rejected transaction rate;
- unauthorized mutation count (must remain zero);
- "agent interrupted me unnecessarily" user rating;
- "I understand the changed code" user rating.

## Context observability

Expose `/context` and optionally a debug panel:

```text
Context 18.4k tokens
active file       2.1k
current diff      3.8k
callers           4.0k
module summaries  2.7k
invariants        0.4k
recent decisions  1.3k
other             4.1k
```

## Logging

Use structured local logs with event IDs. Never log full source/provider prompts by default. Add a developer-only verbose mode.
