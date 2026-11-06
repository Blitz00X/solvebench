# Contributing

SolveBench is an early Linux alpha. Small, reproducible fixes to installation,
the Local exercise flow, keyboard navigation and error messages are especially
useful. Read [AGENTS.md](AGENTS.md) for the product and architecture contracts
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current package layout.
Participation is covered by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Development

Use Bun 1.4.2, Python 3 and Git. The real exercise tests also need Python's
`pytest` package and `bats`; terminal smoke scripts need Python's `pyte` package.
On Ubuntu, `python3-pytest` and `bats` are available through the package manager.
Use a Python virtual environment for `pyte` if your system restricts pip.

From the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run verify:docs
bun run verify:release
bun test
bash scripts/test-installer.sh
```

For an interactive development run, use `bun run dev`. Use a separate temporary
workspace for personal exercises. For release checks and terminal scripts, see
[docs/ALPHA_VALIDATION.md](docs/ALPHA_VALIDATION.md).

Tests use fixtures, temporary workspaces and loopback HTTP servers. Do not add
tests that require a contributor's model key, platform cookies or a live submit.
Preserve the tests for revision-bound results, browser/opened-task separation,
Unicode input and context serialization at the HTTP boundary.

## Local exercise packages

Start from [examples/local-exercises/sum-two](examples/local-exercises/sum-two).
The sample solution is deliberately incomplete so the first test run fails.
Each folder contains `exercise.json`, a Markdown question, solution files and
any test files. For example:

```json
{
  "title": "Add Two Numbers",
  "language": "python",
  "statement": "question.md",
  "solutionFiles": ["solution.py"],
  "testFiles": ["test_solution.py"],
  "testCommand": ["python3", "test_solution.py"]
}
```

Import a single exercise folder or a collection of exercise folders with Ctrl+O.
Import copies into the workspace and refuses duplicates; it does not execute
the command. F5 saves the opened solution and runs the declared argument array
in the copied exercise directory. Install that command's dependencies yourself.
An explicit `sh -c` command still executes a shell. Local commands run with your
user permissions and inherited environment; they are not sandboxed.

Keep paths relative to the exercise. Import rejects traversal and symlinks.
Optional fields include `slug`, `difficulty`, `testFiles` and `timeoutMs`.
The default timeout is 120 seconds, with a maximum of 600 seconds. Local
exercises have no platform submission action.

## Changes and reports

Describe the failing behavior, your change and the checks you ran. Add a focused
regression test for behavioral fixes. Keep unrelated refactors separate and do
not include downloaded exercises, credentials, personal provider configuration,
databases or terminal captures containing private content.

For bugs, use the repository's bug report form at
<https://github.com/Blitz00X/solvebench/issues>. Never attach API keys, session
cookies or unredacted configuration. Use the pull-request template and list the
checks you ran. See [SECURITY.md](SECURITY.md) for sensitive reports.
