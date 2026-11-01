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

The composition source is editable. The delivered MP4/GIF was encoded with
FFmpeg from the actual UI captures. The HyperFrames `check --json` report in
`hyperframes-check.json` is the source for its lint/runtime/layout/motion
results; it is not a claim that the video was rendered by HyperFrames.
