import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/solid"
import { MockProvider, HttpModelProvider, HttpProviderConfig } from "@solvebench/agent-runtime"
import { bootstrapApp } from "../src/bootstrap"
import { App } from "../src/app"
import type { Renderable } from "@opentui/core"
function find(node: Renderable, id: string): Renderable | undefined {
  if (node.id === id) return node
  for (const child of node.getChildren()) { const result = find(child, id); if (result) return result }
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "solvebench-local-ui-"))
  const input = join(root, "my exercises", "sum-two")
  await mkdir(input, { recursive: true })
  await writeFile(join(input, "exercise.json"), JSON.stringify({ title: "Custom Sum", language: "python", statement: "question.md", solutionFiles: ["solution.py"], testFiles: ["test_solution.py"], testCommand: ["python3", "-m", "pytest", "test_solution.py", "-q"] }))
  await writeFile(join(input, "question.md"), "# Custom Sum\nReturn seven.")
  await writeFile(join(input, "solution.py"), "def answer():\n    return 1\n")
  await writeFile(join(input, "test_solution.py"), "from solution import answer\ndef test_answer():\n    assert answer() == 7\n")
  const app = await bootstrapApp({ repoRoot: root, modelProvider: new MockProvider() })
  await app.exercise.switchSource("local")
  return { root, input, app, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test("production local import opens real files, tests saved buffers and is available after restart", async () => {
  const h = await setup()
  try {
    const imported = await h.app.exercise.importExercises(h.input)
    expect(imported.ok).toBe(true)
    expect(h.app.exercise.deps.source.id).toBe("local")
    expect(h.app.exercise.getState().activeSlug).toBe("sum-two")
    await h.app.exercise.open("sum-two")
    expect(h.app.exercise.getState().activeFile).toBe("solution.py")
    expect(h.app.exercise.getState().testFiles["test_solution.py"]).toContain("assert answer() == 7")
    h.app.exercise.setBuffer("def answer():\n    return 7\n")
    await h.app.exercise.runTests()
    expect(h.app.exercise.getState().lastReport?.passed).toBe(1)
    expect(h.app.exercise.getState().error).toBeNull()
    expect(await readFile(join(h.root, "exercises/local/python/sum-two/solution.py"), "utf8")).toContain("return 7")
    expect(await readFile(join(h.input, "solution.py"), "utf8")).toContain("return 1")
    const restarted = await bootstrapApp({ repoRoot: h.root, modelProvider: new MockProvider() })
    await restarted.exercise.switchSource("local")
    await restarted.exercise.init()
    expect(restarted.exercise.getState().exercises[0]?.slug).toBe("sum-two")
    const duplicate = await h.app.exercise.importExercises(h.input)
    expect(duplicate.ok).toBe(false)
    expect(h.app.exercise.getState().openedSlug).toBe("sum-two")
  } finally { await h.cleanup() }
})

test("imported statements, test files and latest local test output reach the serialized AI request", async () => {
  const h = await setup()
  const requests: string[] = []
  const server = Bun.serve({ port: 0, async fetch(request) {
    requests.push(await request.text())
    return Response.json({ choices: [{ message: { content: "Consider the expected value." } }] })
  } })
  try {
    const provider = new HttpModelProvider(HttpProviderConfig.parse({ baseUrl: `http://localhost:${server.port}/v1`, model: "test" }), undefined, { SOLVEBENCH_API_KEY: "test-only" })
    const app = await bootstrapApp({ repoRoot: h.root, modelProvider: provider })
    await app.exercise.importExercises(h.input); await app.exercise.open("sum-two"); await app.exercise.runTests()
    await app.controller.ask("help")
    for (const text of ["Custom Sum", "return 1", "assert answer() == 7", "FAILED", "solutionRevision"]) expect(requests[0]).toContain(text)
    expect(requests[0]).not.toContain("test-only")
  } finally { server.stop(true); await h.cleanup() }
})

test("declared custom solution files open even when their extension is not a built-in language", async () => {
  const h = await setup()
  try {
    const manifest = JSON.parse(await readFile(join(h.input, "exercise.json"), "utf8"))
    manifest.solutionFiles = ["answer.txt"]
    await writeFile(join(h.input, "answer.txt"), "custom starter")
    await writeFile(join(h.input, "exercise.json"), JSON.stringify(manifest))
    await h.app.exercise.importExercises(h.input); await h.app.exercise.open("sum-two")
    expect(h.app.exercise.getState().activeFile).toBe("answer.txt")
  } finally { await h.cleanup() }
})

test("sample shortcut reopens a pre-rename saved attempt instead of importing a fresh starter", async () => {
  const h = await setup()
  try {
    const manifest = JSON.parse(await readFile(join(h.input, "exercise.json"), "utf8"))
    manifest.slug = "pairharness-sample-sum-two"
    await writeFile(join(h.input, "exercise.json"), JSON.stringify(manifest))
    await h.app.exercise.importExercises(h.input)
    await h.app.exercise.open(manifest.slug)
    h.app.exercise.setBuffer("saved previous attempt")
    await h.app.exercise.save()
    const result = await h.app.exercise.trySample()
    expect(result.ok).toBe(true)
    expect(h.app.exercise.getState().openedSlug).toBe(manifest.slug)
    expect(h.app.exercise.getState().buffers["solution.py"]).toBe("saved previous attempt")
    expect(h.app.exercise.getState().exercises).toHaveLength(1)
  } finally { await h.cleanup() }
})

test("built-in sample works without credentials and never overwrites a previous attempt", async () => {
  const h = await setup()
  try {
    const first = await h.app.exercise.trySample()
    expect(first.ok).toBe(true)
    expect(h.app.exercise.deps.source.id).toBe("local")
    expect(h.app.exercise.getState().openedSlug).toBe("solvebench-sample-sum-two")
    h.app.exercise.setBuffer("def add(a, b):\n    return a + b\n")
    await h.app.exercise.runTests()
    expect(h.app.exercise.getState().lastReport?.passed).toBe(3)
    const again = await h.app.exercise.trySample()
    expect(again.ok).toBe(true)
    expect(h.app.exercise.getState().buffers["solution.py"]).toContain("return a + b")
  } finally { await h.cleanup() }
})

test("a sample opened before mounting the UI seeds the editor with its actual starter", async () => {
  const h = await setup()
  await h.app.exercise.trySample()
  const ui = await testRender(() => <App state={h.app.store.state} controller={h.app.controller} exercise={h.app.exercise} />, { width: 140, height: 40, kittyKeyboard: true, exitOnCtrlC: false })
  try {
    ui.mockInput.pressKey("e", { ctrl: true }); await ui.flush()
    expect(ui.captureCharFrame()).toContain("return 0")
  } finally { ui.renderer.destroy(); await h.cleanup() }
})

test("Ctrl+O import supports pasted paths and exposes errors without losing the dialog", async () => {
  const h = await setup()
  const ui = await testRender(() => <App state={h.app.store.state} controller={h.app.controller} exercise={h.app.exercise} />, { width: 140, height: 40, kittyKeyboard: true })
  try {
    await h.app.exercise.init(); await ui.flush()
    ui.mockInput.pressKey("o", { ctrl: true }); await ui.flush()
    expect(ui.captureCharFrame()).toContain("IMPORT EXERCISES")
    await ui.mockInput.pasteBracketedText("/path/does/not/exist"); ui.mockInput.pressEnter()
    await ui.waitFor(() => ui.captureCharFrame().includes("ENOENT")); await ui.flush()
    expect(ui.captureCharFrame()).toContain("IMPORT EXERCISES")
    ui.mockInput.pressEscape(); await ui.flush()
    const button = find(ui.renderer.root, "import-exercises")!
    expect(button).toBeDefined()
    await ui.mockMouse.click(button.x + 1, button.y); await ui.flush()
    await ui.mockInput.pasteBracketedText(h.input); ui.mockInput.pressEnter()
    await ui.waitFor(() => h.app.exercise.deps.source.id === "local"); await ui.flush()
    expect(ui.captureCharFrame()).not.toContain("IMPORT EXERCISES")
    expect(ui.captureCharFrame()).toContain("Custom Sum")
    expect(ui.captureCharFrame()).not.toContain("Connect")
    ui.mockInput.pressEnter()
    await ui.waitFor(() => h.app.exercise.getState().openedSlug === "sum-two"); await ui.flush()
    expect(ui.captureCharFrame()).toContain("focus:content")
    expect(ui.captureCharFrame()).toContain("PROBLEM:")
    const count = h.app.exercise.getState().exercises.length
    ui.mockInput.pressKey("o", { ctrl: true }); await ui.flush()
    ui.mockInput.pressEscape(); await ui.flush()
    expect(h.app.exercise.getState().exercises).toHaveLength(count)
  } finally { ui.renderer.destroy(); await h.cleanup() }
})
