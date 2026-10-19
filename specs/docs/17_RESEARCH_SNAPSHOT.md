# 17 — Research Snapshot (2026-09-29)

This file records upstream facts used for the architecture decision. Re-check before relying on exact APIs because these projects move quickly.

## OpenCode

- Repository package metadata identifies the main OpenCode package as MIT-licensed and the project currently uses Bun workspaces.
- OpenCode's TUI is being/has been extracted to `packages/tui` as `@opencode-ai/tui`, with the SDK as its intended backend boundary.
- Current TUI stack includes OpenTUI core/Solid/keymap.
- Current TUI plugin spec supports custom routes, keymap layers, UI/dialogs, synced state/client/events and slots such as sidebar content, app content and prompt-related areas.
- Plugin docs also show full-screen custom routes.
- A recent OpenCode issue documents that TUI plugins still lack a supported facade for directly reading/driving/annotating the host prompt textarea, demonstrating an important host-control limitation.

Sources:
- https://github.com/anomalyco/opencode/blob/dev/specs/tui-package.md
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/specs/tui-plugins.md
- https://github.com/anomalyco/opencode/blob/dev/packages/tui/src/component/prompt/index.tsx
- https://github.com/anomalyco/opencode/issues/38962
- https://github.com/anomalyco/opencode/blob/dev/package.json
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/package.json

## OpenTUI

- OpenTUI is a terminal UI library with TypeScript bindings and Solid/React renderers.
- It provides layout/input primitives and examples for editable text areas, syntax-highlighted code, line numbers, selections, extmarks and keymaps.
- OpenTUI is MIT-licensed.

Sources:
- https://github.com/anomalyco/opentui
- https://github.com/anomalyco/opentui/blob/main/packages/examples/src/code-demo.ts
- https://github.com/anomalyco/opentui/blob/main/packages/examples/src/index.ts

## Pi

- Pi describes itself as a minimal extensible terminal coding harness.
- It supports TypeScript extensions, custom tools/commands/UI, SDK/RPC-style embedding and local customization.
- It is a plausible alternate agent-runtime adapter if SolveBench should avoid rebuilding provider/session/tool machinery.

Sources:
- https://github.com/earendil-works/pi
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/index.md

## Kilo

- Kilo CLI exposes multiple modes including architect/ask/debug/orchestrator and local review commands.
- It is useful as competitive reference for mode UX, but SolveBench's ownership protocol remains the differentiator.

Source:
- https://github.com/Kilo-Org/kilocode

## Important implementation note

Do not assume upstream docs are always synchronized with current paths. A 2026 OpenCode issue explicitly noted stale contributing/config documentation during the TUI move. Verify source paths before copying imports.
