# Exercise Workbench rebuild

## Product changes

- Exercise-first shipping screen with platform selection, language search, task search,
  Problem/Code/Results tabs, file tabs, persistent assistant and visible actions.
- A single exercise session owns the opened task and buffers. Browser selection cannot
  retarget test or submit. Empty buffers remain valid solutions, and saves reject path
  traversal and symlink escapes.
- Save-before-run and save-before-submit, solution hashes on results and stale-run
  rejection. Platform acceptance and local test success are separate.
- Actual HTTP serialization of task statement, solutions, tests and raw test output.
  The prior implementation populated a controller object but discarded its exercise
  field at the HTTP boundary; the new production-bootstrap integration test covers it.
- Toolchain readiness and local installation, progress reporting and project dependencies.
- LeetCode public catalog/detail/starter files, authorized session connection, platform
  execution polling and accepted/rejected submission results using the common adapter.
- Startup no longer indexes the harness source tree or requires a git commit. Legacy
  graph/pair libraries remain isolated support code, not the shipping product workflow.

## Evidence

- Final verification: `bun run typecheck` exit 0; **383 tests pass, 0 fail** across
  49 files; exercise acceptance suite **10 pass, 0 fail**; `git diff --check` clean.

- Session tests execute a real pytest child process on saved buffers and prove submission
  sees the same bytes, edits invalidate green tests, and switching tasks preserves work.
- HTTP boundary test uses the production bootstrap and a local compatible HTTP server;
  full statement, current solutions, test files, raw failures and revisions arrive there.
- Render/key/mouse tests cover Enter, editor→browser, F5/F6, Unicode message input,
  long problem scrolling and the 80-column fallback.
- Real PTY/VT-emulator check: launcher starts, an Exercism task opens, Ctrl+E exits
  editing, F5 runs tests and Unicode text reaches the message input.
- Live catalog check: Exercism 84 tracks / Python 146 exercises; LeetCode 4,073 questions
  and the Two Sum statement.
- Real managed Go download/extraction with absent-tool discovery, followed by a 1/1 test.
- Live Ollama Cloud response to “yardım et”: identifies the current passing Hello World
  solution and recommends the correct next step, without asking for code or a task name.

Authenticated LeetCode judge behavior is fixture-tested, not claimed live-tested.
See `KNOWN_LIMITATIONS.md` for remaining platform and installer coverage boundaries.
