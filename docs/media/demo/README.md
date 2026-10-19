# SolveBench alpha demo

- `solvebench-offline-demo.mp4`: 36.54 seconds, 1920×1080, silent H.264, 24 fps.
- `solvebench-offline-demo.gif`: compact 1200px-wide preview.
- `05-hint.png`: representative failure + hint screenshot.
- `07-passing-test.png`: representative passing test screenshot.
- `index.html`, `hyperframes.json`, `BRIEF.md`: HyperFrames composition using the same captured frames.
- `captures.json` and text snapshots preserve the actual UI output.

This is a paced sequence of actual `@opentui/solid` production App renderer captures. It is not a continuous terminal recording. Real local Python tests run first against a handwritten subtraction implementation (failure), then against an addition implementation (three examples pass). The provider is an explicitly labelled **scripted offline demonstration**. No AI model, provider API, Exercism submission, or platform judge was called. It demonstrates the interaction flow, not the quality of a live model's hints.

Regenerate from the repository root:

```sh
SOLVEBENCH_DEMO_OUTPUT="$PWD/docs/media/demo" bun test scripts/demo-capture.test.tsx
python3 scripts/demo-render.py
```

The capture requires Bun and the installed repository dependencies. Raster/encode requires Python Pillow, DejaVu fonts at the paths in `demo-render.py`, and ffmpeg. Encoding uses actual captured character spans/colors. The FFmpeg fallback produces the delivered video; the companion HyperFrames source remains editable.

HyperFrames 0.8.174 `check --json` passed with the browser enabled: zero errors in lint/runtime/layout/motion/contrast. One reviewed warning remains because the deliberately sequential 9-capture flow shares a single visual track. The contrast audit sees PNG images and therefore performs zero text checks; readable text was visually inspected in the rendered captures. No motion assertions apply to static capture holds.

Workflow installer limitation: the initial npm cache was unavailable (`ENOTDIR` at `~/.npm`), and the default Node 20 was below the CLI minimum. A task-local cache plus existing Node 24 resolved CLI startup. The workflow Git clone then stalled and was terminated; installation exited 1 with `No valid skills found`. The core composition contract was used for the companion source; the specialized workflow was not executed. The delivered MP4/GIF was encoded with FFmpeg from actual UI captures, not rendered by HyperFrames.
