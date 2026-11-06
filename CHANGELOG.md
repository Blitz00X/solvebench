# Changelog

All notable changes to SolveBench are recorded here. The project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) for release tags.

## [Unreleased]

## [0.1.0-alpha.2] - 2026-11-06

### Added

- Architecture overview in `docs/ARCHITECTURE.md`.
- Contributor Covenant code of conduct.
- Pull-request template and a local Markdown link check.
- Release-tree audit (`bun run verify:release`) that checks tracked files and
  HEAD history for private paths, credential shapes, databases, symlinks and
  oversized files, and rejects a version mismatch between `package.json`,
  `install.sh` and a tag on HEAD.
- `bun run test:coverage` for a per-file coverage report.

### Changed

- Public source tree no longer carries the internal development pack, stale
  ADRs or the implementation report.
- README, security, contribution and AI setup documentation now describe the
  current exercise-first UI instead of the earlier pair-programming commands.
- Package metadata points at the public repository and states the supported Bun
  version.
- The package version, installer pin, README, changelog and validation record
  now all name `v0.1.0-alpha.2`; the installer test reads the pinned version
  instead of duplicating it.

### Fixed

- AI setup documentation referenced removed `/config`, `/chat` and `Ctrl+G`
  commands; it now uses the configuration file and assistant input.
- `bun run typecheck` now covers the scripts directory as well.

## [0.1.0-alpha.1] - 2026-10-19

First public Linux alpha source release.

### Added

- Exercise-first terminal UI with Problem, Code and Test results panes, a
  searchable exercise list and a persistent assistant.
- Local exercise import with validated manifests, copied workspaces and a
  declared test command.
- Exercism and LeetCode adapters with optional account connections.
- OpenAI-compatible assistant provider plus a deterministic offline mock.
- Save-before-run, revision-bound test reports, stale-result rejection and
  save-before-submit.
- SQLite exercise progress, managed user-local toolchains and a no-sudo
  installer with update/rollback behavior.
- Offline demo video, screenshots, installer harness and terminal smoke tests.
