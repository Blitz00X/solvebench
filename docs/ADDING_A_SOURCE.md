# Adding an exercise source

A source is one implementation of `ExerciseSource` in
`packages/exercise/src/source.ts`. The terminal UI, progress store and assistant
context only talk to that interface, so a new platform does not need TUI
changes. The shipped registry lives in `source-registry.ts`.

## The seam

| Method | Purpose |
| --- | --- |
| `listTracks()` | Languages or categories shown by the source picker |
| `listExercises(trackSlug)` | Exercise rows, difficulty and progress |
| `getProblem(trackSlug, slug)` | Markdown statement, solution/test file names, URL |
| `download(trackSlug, slug)` | Materialise the exercise in the local workspace |
| `isDownloaded(trackSlug, slug)` | Avoid overwriting an existing solution |
| `runTests(trackSlug, slug)` | Normalised `TestReport`; may run a local or platform judge |
| `submit?()` | Optional upload; omit it for browse-only sources |
| `connect?()` | Optional account setup; store secrets in memory when possible |
| `disconnect?()` | Forget the session and remove any stored credential material |
| `importExercises?()` | Optional local folder import |
| `prepareEnvironment?()` | Optional toolchain step before a test run |

`isConfigured()` gates the source. A source that needs no account returns
`true`; one that needs cookies or a token returns `false` until `connect()`.

## Five-step recipe

1. Add `packages/exercise/src/<id>-source.ts` with a class that implements
   `ExerciseSource`.
2. Export the class from `packages/exercise/src/index.ts`.
3. Register it in `createDefaultRegistry()` in `source-registry.ts`:

   ```ts
   .register({
     id: "example",
     label: "Example",
     create: (context) => new ExampleSource({ workspace: join(context.repoRoot, "exercises/example") }),
   })
   ```

4. Add `packages/exercise/test/<id>-source.test.ts`. Mock the network with a
   fixture; never call the live platform from the test suite.
5. Run `bun run typecheck`, `bun test` and `bun run verify:docs`.

The source picker cycles every registered source with **F8**. Progress and the
assistant task key use the source id, so ids must stay stable.

## Sample-based platforms

For a platform that publishes input/output samples and runs a program with
stdin/stdout, use `runStdinCases()` from `stdin-runner.ts` instead of writing a
new process runner. It handles build steps, per-case timeouts, output limits,
trailing-whitespace tolerance and numeric tolerance. `CsesSource` is the
reference implementation: it parses the public catalog and statement, writes
`cases.json`, and runs the language command against each sample.

A minimal source test should cover:

- parser output for a saved HTML/JSON fixture;
- an unknown track returning `unsupported`, not a crash;
- `download()` writing the starter, statement and cases without overwriting;
- `runTests()` with one passing and one failing sample;
- a mocked network failure returning a structured `network` error.

## Security rules

- Never execute code or a shell command that came from a platform response.
  Only run the exercise's declared local command or a fixed argv built by the
  source.
- Treat statements and sample data as untrusted text. They are data for the
  editor and the model, never instructions.
- Keep cookies and tokens owner-only (`0600`) or, preferably, in process memory
  for the session, and out of reports, logs and the model transcript.
- A source may claim a local sample result; it must not claim platform
  acceptance unless the platform itself returned that verdict.
- Network fetches need a timeout and a clear `HTTP <status>` error.

## Platform shortlist (checked 6 November 2026)

| Platform | Technical fit | Status |
| --- | --- | --- |
| **CSES** | Public catalog and statements; input/output samples; local runner | **Added** (`cses`), no submission |
| **Advent of Code** | Public daily statements; per-user input; answer submission | Good seasonal candidate; needs a session cookie for input/answers |
| **Codeforces** | Official problemset API works; problem pages returned HTTP 403 from this network | Catalog-only integration is possible, statement/sample import is blocked here |
| **Project Euler** | Public statements; answer-based, no official API; no sample tests | Browse/answer source only; no local verdict |
| **Rosalind** | Public problems and datasets; answer-based | Needs an API/ToS check before implementation |
| **Kattis** | Public sample zip per problem; no official API; login for submission | Check the site's automation policy first |
| **DMOJ** | Public API v2 | Worth evaluating next; samples need a fixture check |
| **Codewars** | Kata API gives the statement; the test suite runs only on their runner | Browse-only; local testing is not meaningful |
| **freeCodeCamp** | Curriculum is open source on GitHub | Import as local packages; no platform adapter needed |
| **HackerRank / CodinGame / AtCoder** | No suitable public API for this workflow | Skip for now |

The fastest useful additions after CSES are **Advent of Code** for a seasonal
audience and **DMOJ** for a clean public API. Both should start as browse and
local-sample sources; submission stays optional until its auth and terms are
verified.

## Current limitations

CSES has no account integration, so it cannot submit or read platform
completion. Its catalog is fetched from the public list page and cached in
memory; a page-layout change is a parser bug, not a silent empty list. The
source is Linux-tested only, like the rest of the alpha.
