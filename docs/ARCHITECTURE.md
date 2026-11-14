# Architecture

SolveBench is an exercise-first terminal workbench. The opened exercise and the
current solution buffers are the product's source of truth; the browser cursor,
test results and assistant context are all derived from them.

## Runtime shape

| Area | Location | Responsibility |
| --- | --- | --- |
| TUI and composition | `apps/tui` | Bootstrap, Solid/OpenTUI views, keyboard and mouse handling, session controller |
| Exercise workflow | `packages/exercise` | Local, Exercism, LeetCode and CSES adapters, registered through one source registry; workspace files, runners, toolchain preparation |
| Assistant runtime | `packages/agent-runtime` | Provider configuration, OpenAI-compatible HTTP client, deterministic mock, prompt and context serialization |
| Persistence | `packages/storage` | SQLite exercise progress and test counts |
| Shared contracts | `packages/shared` | Session state, chat messages, result unions and Zod schemas |

`apps/tui/src/bootstrap.ts` is the composition root. It resolves the workspace,
opens the database, loads provider configuration, constructs the exercise
sources and wires the assistant to the exercise controller. Tests use the same
bootstrap instead of a separate mock composition.

## Request and data flow

1. `ExerciseController` lists tracks and exercises, opens one task and owns its
   solution buffers, active file and revision.
2. **F5** saves dirty buffers, prepares the language environment if needed,
   runs the adapter's test command and records the report against the revision
   that produced it.
3. **F6** requires a passing, current report unless the caller explicitly forces
   submission. A report whose revision no longer matches the buffer cannot
   authorize submission.
4. The assistant input builds a fresh `ChatRequest` for every message. The
   exercise statement, current buffers, test files and latest raw test output
   are serialized inside `HttpModelProvider.chat`, at the actual HTTP boundary.
5. Exercise progress is written to SQLite. Chat lives in memory and is cleared
   when the opened task changes.

## Invariants

- Run and submit act on the saved buffer of the **opened** task, never on the
  highlighted browser row.
- A test report belongs to one solution revision. Editing makes it stale; a
  stale report cannot authorize submission.
- Browsing a selection never retargets the editor, test target or chat context.
- Chat context is assembled from the current state on every message; it is not
  cached across task switches.
- The model returns text only. It has no file-writing or command-execution tool.
- Imported Local packages are validated and staged before publication. Paths
  are relative, symlinks and traversal are rejected, and duplicate identifiers
  never overwrite an existing solution.
- Credential files are owner-only (`0600` on Unix) and live in gitignored
  workspace paths. LeetCode session cookies are the exception: they stay in
  process memory for the session, are never written to disk, and are sent only
  to `leetcode.com`. The assistant key is read from the environment variable
  named by `apiKeyEnv` and is sent only in the HTTP `Authorization` header.

## Workspace layout

The workspace is selected with `--repo`, `SOLVEBENCH_WORKSPACE` or the managed
installation workspace. A typical workspace contains:

```text
<workspace>/
├── exercises/                     # copied/downloaded exercise files
├── .solvebench/
│   ├── solvebench.db              # progress and test counts
│   └── toolchains/                # user-local language toolchains
├── .exercism-cli/                 # isolated Exercism CLI configuration
├── solvebench.config.json         # optional provider configuration
└── .env                           # optional local environment (never committed)
```

Legacy `.pairharness/`, `pairharness.config.json` and `PAIRHARNESS_*` variables
are read when the new names are absent. They are compatibility inputs, not part
of the new data model.

## Adapters

- **Local** imports a folder with `exercise.json`, a Markdown statement,
  solution files and a declared test command. The command is an argument array,
  runs with the user's permissions and is not sandboxed.
- **Exercism** uses an isolated CLI configuration and the public API. Submission
  uploads the solution and then completes the exercise to unlock the next task.
- **LeetCode** reads a bundled catalog snapshot, fetches only the opened
  problem's statement, and, with the user's session cookies held in memory, runs
  and submits through the platform judge.
- **CSES** reads the public problem catalog and statement, imports the published
  samples and runs them with the selected language toolchain. It has no account
  integration, so it never submits or claims a platform verdict.

Every adapter is created by `source-registry.ts`; the TUI renders whatever the
registry returns. [`ADDING_A_SOURCE.md`](ADDING_A_SOURCE.md) is the recipe for a
new platform. Adapters expose supported actions and connection fields. A missing
capability is reported in the UI instead of being emulated silently.

## Tests and checks

- `bun test` covers the controller, adapters, storage, HTTP boundary, rendering
  and keyboard behavior.
- `bun run test:acceptance` focuses on the exercise workflow.
- `bun run verify:persistence` and `bun run verify:runner` narrow the storage and
  runner suites.
- `bash scripts/test-installer.sh` exercises install, update, rollback and data
  preservation with isolated directories.
- `scripts/pty-*.py` drive the real launcher through a terminal emulator.

Release-blocking behavior is listed in [`AGENTS.md`](../AGENTS.md) and the
current boundaries in [`KNOWN_LIMITATIONS.md`](../KNOWN_LIMITATIONS.md).
