# 09 — Agent Runtime and Prompt Contracts

## 1. Provider abstraction

```ts
interface ModelProvider {
  complete<T>(request: StructuredRequest<T>): Promise<ModelResult<T>>
  capabilities(): ProviderCapabilities
}
```

Do not expose provider-specific concepts to `pair-core`.

## 2. Structured outputs

Major agent actions should use validated schemas:

- observation;
- finding;
- trace proposal;
- mission map;
- change transaction plan;
- patch rationale;
- review result.

If structured parsing fails, retry once with repair; otherwise degrade to plain text in navigator, never to automatic action.

## 3. Tool model

Tools are capability objects checked by PermissionService.

```text
read_file
search_text
symbol_lookup
references
run_validation
read_git_diff
propose_patch
```

`write_file`, `shell_mutate`, `git_commit`, `network_write` are not direct default tools.

## 4. Navigator prompt behavior

The Navigator should:

- prefer silence over redundant narration;
- identify concrete evidence;
- distinguish known from inferred;
- avoid completing the user's implementation unless asked;
- give progressive hints in Learning mode;
- never claim a change was applied unless transaction state says `applied`.

## 5. Reviewer prompt behavior

Reviewer must:

- inspect diff + system context;
- focus on behavioral defects/risks first;
- attach evidence paths;
- label confidence;
- avoid style noise;
- explicitly state unresolved dynamic behavior.

## 6. Cartographer prompt behavior

Cartographer must:

- build a reading path rather than dump a repo summary;
- favor deterministic graph evidence;
- explain why each node matters to the mission;
- keep maps bounded;
- maintain breadcrumbs and unknowns.

## 7. Safe Driver prompt behavior

Agent Driver must:

- propose one bounded transaction at a time;
- never expand scope silently;
- stop at approval gates;
- report validation failures;
- prefer a smaller patch when equivalent;
- return control when policy requests it.

## 8. Model routing (optional later)

Possible routing:

- cheap/fast model: summaries, classification, low-risk observations;
- strong reasoning model: architecture/review/ambiguous traces;
- coding model: patch proposal only.

MVP can use one provider/model to reduce complexity. The architecture should make routing pluggable.
