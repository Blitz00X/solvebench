# Changelog

All notable changes to SolveBench are recorded here. The project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) for release tags.

## [Unreleased]

### Added

- Architecture overview in `docs/ARCHITECTURE.md`.
- Contributor Covenant code of conduct.
- Pull-request template and a local Markdown link check.

### Changed

- Public source tree no longer carries the internal development pack, stale
  ADRs or the implementation report.
- README, security, contribution and AI setup documentation now describe the
  current exercise-first UI instead of the earlier pair-programming commands.
- Package metadata points at the public repository and states the supported Bun
  version.

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
