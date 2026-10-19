# 08 — Codebase Graph Engine

## 1. Purpose

The graph is the persistent substrate shared by Explore, Trace and Review. It should be useful even if the LLM is temporarily unavailable.

## 2. Node types

- repository
- package/module
- file
- symbol/function/class/type
- endpoint
- test
- config key
- event/topic
- database entity (later)
- invariant

## 3. Edge types

- contains
- imports
- defines
- calls
- references
- implements
- extends
- reads
- writes
- publishes
- subscribes
- tested_by
- configured_by
- may_flow_to

Every edge has provenance:

```ts
interface EdgeEvidence {
  source: "lsp"|"parser"|"search"|"test"|"model"
  confidence: number
  location?: LocationRef
  revision: string
}
```

## 4. Indexing phases

### Phase 1 — cheap structural scan
- file tree/ignore rules
- manifests
- language detection
- imports
- top-level symbols

### Phase 2 — language intelligence
- LSP definitions/references
- diagnostics
- call hierarchy where supported

### Phase 3 — task-scoped expansion
Only expand graph around the current mission/diff/selection.

### Phase 4 — inferred flows
Use the model to hypothesize edges only when deterministic tools cannot resolve them; mark them as inferred.

## 5. Graph query examples

```text
neighbors(symbol, depth=2)
callers(symbol)
implementations(interface)
tests_covering(symbol)
paths(entrypoint, target)
affected_by(changed_symbols)
```

## 6. Review expansion strategy

For each changed symbol:

1. direct callers;
2. implemented/implementing interfaces;
3. state/data sinks;
4. tests;
5. high-centrality dependent symbols;
6. only then broader module context.

Use hard limits to avoid graph explosion.

## 7. Mission map

Explore Mode stores a `MissionGraph` separate from the full repository graph:

```ts
interface MissionGraph {
  mission: string
  rootNodes: NodeId[]
  readingPath: NodeId[]
  relevantNodes: NodeId[]
  relevantEdges: EdgeId[]
  unknowns: Unknown[]
}
```

## 8. Visualization

For MVP, do not build a force-directed graph. Use:

- indented tree;
- flow list;
- breadcrumb;
- inbound/outbound lists;
- trace chain.

A graphical/3D map can be a later experiment.
