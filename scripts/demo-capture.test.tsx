/** Offline demo: real App renderer and local Python tests; scripted hint, no model call. */
import { test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Renderable, TextareaRenderable } from "@opentui/core"
import { LocalExerciseSource } from "@solvebench/exercise"
import { SessionState } from "@solvebench/shared"
import { App } from "../apps/tui/src/app"
import { AppController } from "../apps/tui/src/controller"
import { ExerciseController } from "../apps/tui/src/exercise-controller"
import { createSessionStore } from "../apps/tui/src/store"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
function find(n: Renderable, id: string): Renderable | undefined {
  if (n.id === id) return n
  for (const c of n.getChildren()) { const match = find(c, id); if (match) return match }
}
test("capture truthful offline workflow", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "solvebench-demo-"))
  const output = process.env.SOLVEBENCH_DEMO_OUTPUT ?? join(workspace, "captures")
  await mkdir(output, { recursive: true })
  const source = new LocalExerciseSource(join(workspace, "local"))
  const imported = await source.importExercises(join(process.cwd(), "examples/local-exercises"))
  expect(imported.ok).toBe(true)
  const exercise = new ExerciseController({ source, workspace })
  const store = createSessionStore(SessionState.parse({ id: "offline-demo", repoRoot: workspace, mode: "learning", driver: "human" }))
  let calls = 0
  const controller = new AppController({ store, provider: { async chat(request) {
    calls++
    expect(request.context.exercise?.lastTest?.failed).toBeGreaterThan(0)
    expect(request.context.exercise?.solutionFiles?.["solution.py"]).toContain("a - b")
    return { text: "[Scripted offline hint] Your code subtracts b. The problem asks for a sum. Which operator adds two values?", observations: [], evidence: [], degraded: false }
  } }, exerciseContext: () => {
    const s = exercise.getState(), r = s.lastReport
    return s.problem ? { source: "local", track: s.openedTrack!, slug: s.openedSlug!, title: s.problem.title, difficulty: s.problem.difficulty, statement: s.problem.body, solutionFiles: s.buffers, ...(r ? { lastTest: { passed: r.passed, failed: r.failed, total: r.total, command: r.command, raw: r.raw, failing: [] } } : {}) } : undefined
  } })
  const h = await testRender(() => <App state={store.state} controller={controller} exercise={exercise} providerLabel="OFFLINE · scripted hint demo" />, { width: 140, height: 40, kittyKeyboard: true })
  const frames: unknown[] = []
  async function settle() { await Bun.sleep(100); await h.flush() }
  async function capture(name: string, duration: number, caption: string) {
    await settle()
    const frame = h.captureSpans()
    frames.push({ name, duration, caption, ...frame, lines: frame.lines.map(l => ({ spans: l.spans.map(s => ({ ...s, fg: s.fg.toString(), bg: s.bg.toString() })) })) })
    await writeFile(join(output, `${name}.txt`), h.captureCharFrame().split("\n").map(line => line.trimEnd()).join("\n").trimEnd() + "\n")
  }
  async function waitFor(predicate: () => boolean) {
    for (let i = 0; i < 200 && !predicate(); i++) await settle()
    expect(predicate()).toBe(true)
  }
  try {
    await exercise.init(); await settle()
    h.mockInput.pressEnter(); await waitFor(() => exercise.getState().openedSlug === "solvebench-sample-sum-two")
    await settle()
    await capture("01-problem", 5, "Open the bundled local exercise")
    h.mockInput.pressKey("e", { ctrl: true }); await settle()
    const editor = find(h.renderer.root, "editor") as TextareaRenderable
    expect(editor).toBeDefined()
    editor.setText(""); await settle()
    const wrong = "def add(a, b):\n    return a - b\n"
    for (const chunk of ["def add(a, b):\n", "    return a", " - b\n"]) {
      await h.mockInput.typeText(chunk); await capture(`02-type-${frames.length}`, 1.5, "Write a first solution in the editor")
    }
    expect(exercise.getState().buffers["solution.py"]).toBe(wrong)
    h.mockInput.pressKey("F5"); await waitFor(() => exercise.getState().lastReport !== null && !exercise.getState().runningTests)
    expect(exercise.getState().lastReport?.failed).toBeGreaterThan(0)
    await capture("03-failing-test", 6, "F5 runs the real local Python test: failure")
    h.mockInput.pressKey("l", { ctrl: true }); await settle()
    await h.mockInput.typeText("Give me a small hint, not the solution.")
    await capture("04-ask", 3, "Ask for a small hint")
    h.mockInput.pressEnter(); await waitFor(() => store.state.chat.length === 2)
    await capture("05-hint", 8, "Scripted offline hint · no AI model was called")
    expect(calls).toBe(1)
    h.mockInput.pressKey("e", { ctrl: true }); await settle()
    ;(find(h.renderer.root, "editor") as TextareaRenderable).setText("def add(a, b):\n    return a + b\n")
    await capture("06-fix", 4, "Apply the correction yourself")
    const previous = exercise.getState().lastReport
    h.mockInput.pressKey("F5"); await waitFor(() => exercise.getState().lastReport !== previous && !exercise.getState().runningTests)
    expect(exercise.getState().lastReport?.passed).toBe(3)
    expect(exercise.getState().lastReport?.failed).toBe(0)
    await capture("07-passing-test", 6, "F5: all three local examples pass")
    await writeFile(join(output, "captures.json"), JSON.stringify(frames, null, 2))
    await writeFile(join(output, "evidence.json"), JSON.stringify({ renderer: "@opentui/solid testRender (actual App)", provider: "Scripted offline provider; zero network/model requests", failed: true, passed: 3, scriptedHintCalls: calls, totalDuration: 36.5 }, null, 2))
  } finally { h.renderer.destroy(); await rm(workspace, { recursive: true, force: true }) }
}, 30000)
