# Alpha validation record

Target: `v0.1.0-alpha.1`, Linux. This document distinguishes executable checks
from work that requires a release host, platform accounts or another person.
It is not evidence that an unpublished release URL works.

## Repeatable local checks

From the source root, with Bun 1.4.2, Python 3, pytest and bats installed:

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bash scripts/test-installer.sh
```

For real terminal checks, install `pyte` into a Python environment and run:

```sh
python3 scripts/pty-local-import.py
python3 scripts/pty-installed-sample.py
bash scripts/check-launcher.sh
```

If `pyte` is in a virtual environment, use its Python executable for the first
command and set `WORKBENCH_TEST_PYTHON` to that executable for the second.
The Local smoke script uses a temporary workspace and does not call a model
or submit a solution. The renderer tests additionally exercise narrow screens,
Unicode input, focus transitions, scrolling, drafts and fullscreen state.

Do not copy historical test totals into a release announcement. The table records the
actual final command results and runtime version. The source tree is exported
as the local `v0.1.0-alpha.1` tag after these checks. GitHub Actions must be checked separately after
the workflow has run on the public host.

| Check | Current release evidence |
| --- | --- |
| Frozen dependency install, typecheck, complete test suite | 2026-10-19: Bun 1.4.2, frozen install and typecheck passed; 225 tests passed, 0 failed, 715 assertions across 29 files |
| Installer failure/reinstall/update/data-preservation harness | 2026-10-19: pre-rename baseline: 13 cases passed; renamed installer: 12 offline harness cases and a real cache-only installation/PTY passed; rollback, concurrency, foreign launcher and saved data covered |
| Real Local import/edit/save/test/reopen in PTY | 2026-10-19: real launcher import/edit/failing and passing F5 passed; installed-sample PTY also passed save/exit/reopen |
| Fullscreen/Unicode/keyboard launcher PTY | 2026-10-19: real launcher passed Markdown heading style, center/AI fullscreen, Unicode input, focus navigation, F5 and narrow-screen resize |
| Clean installed `solvebench --sample` | 2026-10-19: temporary HOME/prefix, no provider/platform credentials; help/version without runtime state, populated starter, failing F5, edit, cancel/save exit, restart and 3 passing examples verified |
| Clean Linux container (pre-rename baseline) | 2026-10-19: Python 3.12 Debian slim container, Bun 1.4.2, fresh frozen install; UID 1000 with no personal configuration: typecheck, 219 tests/686 assertions, 12 installer cases and installed sample PTY all passed |
| Hosted GitHub Actions | Not run on a public repository |
| Fresh public release download/tag URL | Blocked until repository identity and release exist |
| Live Exercism account workflow | Configured exercise open and local F5 verified by launcher PTY; live submit/completion not validated |
| Live LeetCode account workflow | Not validated for this alpha |
| macOS / Windows | Not validated; no support claim |
| Independent person's first-install trial | Not performed |
| Demo recording | 36.54-second 1080p MP4 and GIF from actual rendered UI captures and real Local test runs; scripted offline provider explicitly labelled; see media/demo/README.md |

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

## Source-tree and history audit

The 2026-10-19 development-history audit found runtime database snapshots in
old commits, containing session and source-graph metadata and personal paths.
They are absent from the current tracked source tree. The one historical
credential-format match inspected was a documented example key in a test
fixture. Pattern searches are not proof that every possible secret is absent.

**Do not publish the old development history.** The intended `public-alpha`
export is a new root commit from the audited final source tree, with no parent
link to development history. Keep development refs private; verify the public
ref's complete reachable history and packaged files before pushing. Merely
deleting a file in the latest commit does not remove it from earlier commits.
The export is created and audited locally as the `public-alpha` root and
`v0.1.0-alpha.1` tag. Neither development refs nor the public ref have been pushed.

Audit source files, untracked files selected for release and the exported Git
tree for credential formats, personal paths, runtime databases, downloaded
platform content and oversized files. The committed sample is intentionally
incomplete project example code; users' imported exercises are not release
assets. Keep credential values out of audit output. An archive/installer must
include only the reviewed source, licenses, docs, scripts and intended sample.

## Publication gates

Before public sharing, choose the actual GitHub repository owner/name and
visibility, review the export, create the alpha tag and test its real download
and setup commands. Confirm CI on that exact revision. Record any manual
platform tests honestly, arrange an independent installation trial and check
the target community's current posting rules. A Reddit draft is prepared in
[REDDIT_DRAFT.md](REDDIT_DRAFT.md); nothing in this checklist authorizes posting.

## Review evidence

The final source candidate audit on 2026-10-19 checked 179 tracked/nonignored
files: no detected credential formats, actual personal paths, runtime databases,
symlinks or files larger than 1 MB. Local Markdown links resolved. This is a
pattern-based review, not a guarantee that arbitrary secrets are detectable.
The public-root archive is checked separately after creation.

Regression tests cover a pre-mounted sample initially rendering an empty editor,
and background mouse actions mutating the exercise while exit confirmation was
open. Both failures were reproduced before their fixes and pass afterward.
Read-only import storage was tested under an unprivileged user; save-failure
confirmation keeps the dirty solution and reports the error.

The initial clean restart test exposed a missing explicit controller initialization
in the test itself when Local was already the default source. It was corrected
and the complete suite was rerun successfully under UID 1000 in the container.

## SolveBench rename verification — 2026-10-19

The renamed tree passed typecheck and 224 tests / 702 assertions. Installer
failure/reinstall/data-preservation checks passed under the new command name.
A fresh temporary-HOME installation using only the existing local Bun cache
passed the installed-sample terminal flow. Demo captures and MP4/GIF were
regenerated with the SolveBench title. Compatibility regressions cover old
configuration, the previous API-key environment variable, persisted progress
and an older saved sample attempt. Both private naming schemes are excluded.

Target repository: `Blitz00X/solvebench`, public, authorized by the owner.
Publication is pending. The owner requires waiting for a hotspot before any
further GitHub/SSH network attempt; do not switch ports or try another route.
