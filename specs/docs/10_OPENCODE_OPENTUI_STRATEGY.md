# 10 — OpenCode / OpenTUI Strategy

## 1. Decision

**Primary recommendation:** build SolveBench as its own OpenTUI + Solid application, while borrowing architectural patterns from OpenCode and optionally validating UX through an OpenCode TUI plugin spike.

Do not begin by permanently forking the whole OpenCode application.

## 2. Why OpenTUI

OpenTUI already provides the terminal primitives needed for the concept:

- layout/flexbox;
- text editing via textarea/edit buffers;
- code rendering and syntax highlighting;
- line numbers and selection;
- mouse/keyboard input;
- keymap support;
- scrollable panes;
- Solid renderer.

This lets development focus on the pair protocol rather than terminal rendering.

## 3. What to learn/reuse from OpenCode

Study and, where license/API allows, adapt patterns for:

- layout and focus handling;
- keymap layering;
- prompt/textarea ergonomics;
- diff rendering;
- themes;
- status/context indicators;
- command palette;
- provider/session presentation;
- async state synchronization.

Do not copy large internal trees unless necessary. Prefer public packages/APIs and small isolated patterns.

## 4. OpenCode plugin spike

Current TUI plugin APIs support:

- custom full-screen routes;
- commands and key bindings;
- custom UI slots;
- sidebar content;
- host prompt rendering in plugin UI;
- access to synced state/client/events.

That is enough to create a prototype route such as `/pair` with:

```text
custom center pane | sidebar navigator
bottom summon prompt
```

Use this spike to validate:

- split proportions;
- navigator usefulness;
- command vocabulary;
- driver switching mental model.

## 5. Why plugin is not the long-term core

The product needs strong ownership of an editable **code** buffer, cursor/selection state, annotations, staged proposals and permission-enforced writes. Current OpenCode plugin boundaries are optimized around extending OpenCode, and there have been explicit gaps around directly reading/driving the host prompt/edit buffer. SolveBench should own this surface.

## 6. Why not a full fork first

A full fork creates immediate coupling to:

- OpenCode's session model;
- internal provider/server assumptions;
- upstream refactors;
- existing autonomous-agent UX assumptions;
- merge maintenance.

SolveBench's primary IP is the interaction model, so the core should stay portable.

## 7. Alternative: Pi

Pi is attractive as an embedded runtime because it is intentionally minimal and extensible, exposes TypeScript extensions/custom UI and can be embedded or used through RPC. It is a reasonable adapter candidate if building provider/tool plumbing from scratch becomes wasteful.

Still keep the SolveBench domain and TUI state outside Pi so replacing the agent runtime remains possible.

## 8. Kilo

Kilo has rich agent modes and review commands, but its product model is still agent-execution oriented. It is useful for competitive study, less attractive as the foundational state model for a human-owned editor.

## 9. Decision gates

After the plugin spike, ask:

1. Can custom route own a proper code editing surface cleanly?
2. Can driver ownership be enforced outside prompt convention?
3. Can proposals stay isolated from the working tree?
4. Can code-intel graph state live independently?
5. Would plugin updates force frequent breakage?

If any of 1–3 is no, move directly to standalone OpenTUI (expected outcome).
