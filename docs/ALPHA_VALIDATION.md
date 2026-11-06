# Alpha validation record

Target: `v0.1.0-alpha.2`, Linux. This document separates executable checks from
work that needs a release host, platform accounts or another person. It is not
evidence that a published download URL works from every network.

## Repeatable local checks

From the source root, with Bun 1.4.2, Python 3, pytest and bats installed:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run verify:docs
bun run verify:release
bun test
bun run test:coverage   # optional per-file coverage report
bash scripts/test-installer.sh
```

For real terminal checks, install `pyte` into a Python environment and run:

```sh
python3 scripts/pty-local-import.py
python3 scripts/pty-installed-sample.py
python3 scripts/pty-workbench.py   # needs a downloaded Exercism task
```

If `pyte` is in a virtual environment, use its Python executable for the first
command and set `WORKBENCH_TEST_PYTHON` to that executable for the second. The
Local smoke script uses a temporary workspace and does not call a model or
submit a solution.

## Results

| Check | Evidence |
| --- | --- |
| Frozen dependency install, typecheck, documentation links, complete test suite | 2026-11-01: Bun 1.4.2; frozen install and typecheck passed; documentation link check passed; 225 tests passed, 0 failed, 715 assertions across 29 files |
| `v0.1.0-alpha.2` release-tree audit and local checks | 2026-11-06: Bun 1.4.2; typecheck passed; 26 documentation links passed; release audit found no private paths, credential shapes, databases, symlinks or oversized files across 147 tracked files and HEAD history; version, installer pin and tag agree; 225 tests passed, 0 failed, 715 assertions across 29 files |
| Installer failure/reinstall/update/data-preservation harness | 2026-11-01 and 2026-11-06: 12 offline cases passed, including rollback, concurrency, foreign launcher, symlink and saved-data cases; the harness now reads the pinned version from `install.sh` |
| Clean source installation with a temporary HOME | 2026-11-01: `bash install.sh --source "$PWD"` installed under a temporary HOME/prefix; `solvebench --help` and `--version` worked without creating runtime state |
| Clean installed `solvebench --sample` | 2026-11-01: temporary HOME/prefix, no provider or platform credentials; populated starter, failing F5, edit, cancel/save exit, restart and 3 passing examples verified |
| Real Local import/edit/save/test/reopen in PTY | 2026-11-01: import of the bundled collection, editor paste, failing and passing F5, saved copy and persistent restart passed |
| Fullscreen/Unicode/keyboard launcher PTY | 2026-11-01: Markdown heading style, center/AI fullscreen, Unicode input, focus navigation, F5 and narrow-screen resize passed against a downloaded Exercism task |
| Hosted GitHub Actions | Workflow is committed; this environment did not observe a run on the public host |
| Live Exercism account workflow | A configured exercise can be opened and tested locally; live submit/completion was not validated |
| Live LeetCode account workflow | Not validated for this alpha |
| macOS / Windows | Not validated; no support claim |
| Independent person's first-install trial | Not performed |
| Demo recording | 36.54-second 1080p MP4 and GIF from actual rendered UI captures and real Local test runs; the scripted offline provider is labelled; see [media/demo/README.md](media/demo/README.md) |

Test totals change as the suite grows. The command output, not a copied number,
is authoritative for a given revision.

## Clean Local acceptance flow

1. Use a clean temporary HOME/workspace without copied provider configuration
   or platform credentials. Install from the audited local source with
   `bash install.sh --source "$PWD"` and follow the printed PATH guidance.
2. Run `solvebench --help` and `solvebench --version` without a TUI, then
   `solvebench --sample`. The sample needs Python 3, not pytest or an account.
3. Open Add Two Numbers. Run F5 and confirm that the deliberately incomplete
   solution fails. Change its implementation to `return a + b`, save and run
   F5 again. Check a passing result belongs to that solution revision.
4. Edit again and test the exit behavior. Cancel exit if appropriate, then
   save/exit. Restart in the same workspace and reopen the same solution.
   Confirm the saved file remains and progress survives.
5. Reinstall/update without replacing the workspace. Confirm the edited
   solution is preserved. Interrupt/fail an update and verify the previous
   launcher still works.
6. Exercise invalid/missing import paths, duplicate import, unavailable test
   tools, unwritable storage and timeout. Report actionable errors without
   disclosing credentials or silently replacing solutions.

## Release checklist

Before sharing a build, verify the exact revision that will be published:

- The public tree contains only reviewed source, licenses, docs, scripts and the
  intended sample.
- `bun run verify:release` passes and reports no credential, cookie, personal
  path, runtime database, symlink or oversized file in the tree or HEAD history.
- GitHub private vulnerability reporting is enabled, so `SECURITY.md` points at
  a working private channel rather than a public issue.
- CI passes on the public host for that revision.
- The real download command and tag resolve from a clean machine.
- Manual platform tests are recorded honestly; an independent installation trial
  is arranged where possible.
- The target community's current posting rules are checked separately from this
  technical checklist.

## Review evidence

The release candidate audit checks tracked and nonignored files for credential
formats, personal paths, runtime databases, symlinks and oversized files. Local
Markdown links are checked by `bun run verify:docs`. Pattern searches reduce
risk; they are not proof that every possible secret is absent.

Regression tests cover a pre-mounted sample initially rendering an empty editor,
and background mouse actions mutating the exercise while exit confirmation is
open. Both failures were reproduced before their fixes and pass afterward.
Read-only import storage was tested under an unprivileged user; save-failure
confirmation keeps the dirty solution and reports the error.
