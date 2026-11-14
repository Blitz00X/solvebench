# SolveBench alpha.4 demo

- `solvebench-alpha4-offline-demo.mp4`: 43.54 seconds, 1920×1080, silent H.264, 24 fps.
- `solvebench-alpha4-offline-demo.gif`: compact 1200×675 preview, 174 frames.
- `01-problem.png`: the bundled local exercise and the alpha.4 source selector.
- `02-editor.png`: a first solution in the editor.
- `03-failing-test.png`: the real local Python test failing after F5.
- `05-hint.png`: the explicitly labelled offline hint.
- `07-passing-test.png`: all three local examples passing after the fix.
- `08-leetcode-catalog.png`: the source selector, the bundled LeetCode catalog and
  the `Disconnect` action; no account is connected.

This is a paced sequence of actual `@opentui/solid` production App renderer
captures. It is not a continuous terminal recording. Real local Python tests run
first against a handwritten subtraction implementation (failure), then against
an addition implementation (three examples pass). The provider is an explicitly
labelled **scripted offline demonstration**. No AI model, provider API, Exercism
submission, or platform judge was called.

The LeetCode scene reads the problem index bundled with the source. No account is
connected, no cookie is used, and no catalog or problem request is made; opening
a problem would fetch that single problem from `leetcode.com` and requires a
session, so the recording stops at the catalog.

Captured from the `v0.1.0-alpha.4` tree (`58135b7`). The previous 19 October demo
is kept at `docs/media/demo/` for history.
