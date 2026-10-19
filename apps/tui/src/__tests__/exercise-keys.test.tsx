import { describe, test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TextareaRenderable, Renderable, ScrollBoxRenderable, InputRenderable } from "@opentui/core"
import { TextAttributes } from "@opentui/core"
import { SessionState } from "@solvebench/shared"
import { MockProvider } from "@solvebench/agent-runtime"
import { App } from "../app"
import { AppController } from "../controller"
import { createSessionStore } from "../store"
import { fixture } from "../../test/workbench-fixture"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export function find(node: Renderable, id: string): Renderable | undefined {
  if (node.id === id) return node
  for (const child of node.getChildren()) { const result = find(child, id); if (result) return result }
}
async function setup(width = 140, height = 40, onExit?: () => void) {
  const data = await fixture()
  const store = createSessionStore(SessionState.parse({ id: "test", repoRoot: data.workspace, mode: "learning", driver: "human" }))
  const controller = new AppController({ store, provider: new MockProvider(), exerciseContext: () => {
    const s = data.exercise.getState()
    return s.problem ? { source: "fixture", track: s.openedTrack!, slug: s.openedSlug!, title: s.problem.title, difficulty: s.problem.difficulty, statement: s.problem.body, solutionFiles: s.buffers } : undefined
  } })
  const render = await testRender(() => <App state={store.state} controller={controller} exercise={data.exercise} onExit={onExit} />, { width, height, kittyKeyboard: true, exitOnCtrlC: false })
  await data.exercise.init(); await render.flush()
  const cleanup = async () => { render.renderer.destroy(); await data.cleanup() }
  return { ...data, ...render, controller, store, cleanup }
}

async function waitForContent(h: Awaited<ReturnType<typeof setup>>, text: string) {
  for (let attempt = 0; attempt < 200 && !h.captureCharFrame().includes(text); attempt++) {
    await Bun.sleep(10); await h.flush()
  }
  expect(h.captureCharFrame()).toContain(text)
}

describe("workbench keyboard and mouse flow", () => {
  test("exit confirmation blocks background mouse actions without saving or switching tasks", async () => {
    const h = await setup(140, 40, () => {})
    try {
      h.mockInput.pressEnter(); await h.waitFor(() => h.exercise.getState().openedSlug === "answer"); await h.flush()
      ;(find(h.renderer.root, "editor") as TextareaRenderable).setText("unsaved answer"); await h.flush()
      h.mockInput.pressCtrlC(); await h.flush()
      await h.mockMouse.click(34, 37); await h.flush()
      expect(h.exercise.getState().openedSlug).toBe("answer")
      expect(h.exercise.getState().dirty).toBe(true)
      expect(await readFile(join(h.workspace, "python/answer/solution.py"), "utf8")).toContain("return 1")
      expect(h.captureCharFrame()).toContain("UNSAVED CHANGES")
    } finally { await h.cleanup() }
  })
  test("Ctrl+C asks before discarding edits and Save exits only after writing the solution", async () => {
    let exits = 0
    const h = await setup(140, 40, () => { exits++ })
    try {
      h.mockInput.pressEnter(); await h.waitFor(() => h.exercise.getState().openedSlug === "answer"); await h.flush()
      ;(find(h.renderer.root, "editor") as TextareaRenderable).setText("def answer():\n    return 7\n"); await h.flush()
      h.mockInput.pressCtrlC(); await h.flush()
      expect(h.captureCharFrame()).toContain("UNSAVED CHANGES")
      h.mockInput.pressEscape(); await h.flush()
      expect(exits).toBe(0)
      expect(h.exercise.getState().dirty).toBe(true)
      h.mockInput.pressCtrlC(); await h.flush()
      h.mockInput.pressEnter(); await h.waitFor(() => exits === 1)
      expect(await readFile(join(h.workspace, "python/answer/solution.py"), "utf8")).toContain("return 7")
      expect(h.exercise.getState().dirty).toBe(false)
    } finally { await h.cleanup() }
  })
  test("discard exits without writing, while a save failure keeps the exit dialog and dirty buffer", async () => {
    let exits = 0
    const h = await setup(140, 40, () => { exits++ })
    try {
      h.mockInput.pressEnter(); await h.waitFor(() => h.exercise.getState().openedSlug === "answer"); await h.flush()
      ;(find(h.renderer.root, "editor") as TextareaRenderable).setText("unsaved"); await h.flush()
      h.exercise.deps.write = async () => { throw new Error("disk is read-only") }
      h.mockInput.pressCtrlC(); await h.flush()
      h.mockInput.pressEnter(); await h.waitFor(() => h.captureCharFrame().includes("disk is read-only"))
      expect(exits).toBe(0)
      expect(h.exercise.getState().dirty).toBe(true)
      h.mockInput.pressArrow("right"); h.mockInput.pressEnter(); await h.flush()
      expect(exits).toBe(1)
      expect(await readFile(join(h.workspace, "python/answer/solution.py"), "utf8")).toContain("return 1")
    } finally { await h.cleanup() }
  })
  test("problem and assistant markdown have styled headings and emphasis instead of raw syntax", async () => {
    const h = await setup(170, 50)
    try {
      const body = "# Styled heading\n\nPlain text with **bold words**, *italic words* and `inline_code`.\n\n```python\nreturn 7\n```\n\n| Name | Value |\n| --- | --- |\n| One | 1 |"
      const getProblem = h.source.getProblem
      h.source.getProblem = async (track, slug) => {
        const problem = await getProblem(track, slug)
        if (problem.ok) problem.value.body = body
        return problem
      }
      await h.exercise.open("answer"); await h.flush()
      await waitForContent(h, "Styled heading")
      const checkStyles = () => {
        const spans = h.captureSpans().lines.flatMap(line => line.spans)
        expect(spans.some(span => span.text.includes("Styled heading") && (span.attributes & TextAttributes.BOLD) !== 0)).toBe(true)
        expect(spans.some(span => span.text.includes("bold words") && (span.attributes & TextAttributes.BOLD) !== 0)).toBe(true)
        expect(spans.some(span => span.text.includes("italic words") && (span.attributes & TextAttributes.ITALIC) !== 0)).toBe(true)
        expect(h.captureCharFrame()).not.toContain("**bold words**")
        expect(h.captureCharFrame()).not.toContain("```python")
        expect(h.captureCharFrame()).toContain("return 7")
        expect(h.captureCharFrame()).toContain("One")
      }
      checkStyles()
      h.store.appendChat({ role: "assistant", text: body, at: 1, degraded: false })
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      h.mockInput.pressEscape(); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      await waitForContent(h, "inline_code")
      checkStyles()
    } finally { await h.cleanup() }
  })
  test("f maximizes the center pane, keeps code and tabs usable, and restores the layout", async () => {
    const h = await setup()
    try {
      h.mockInput.pressTab(); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("EXERCISES:")
      expect(h.captureCharFrame()).not.toContain("AI · CHAT")
      expect((find(h.renderer.root, "content-pane")!).width).toBeGreaterThan(130)
      h.mockInput.pressArrow("right"); await h.flush()
      expect(h.captureCharFrame()).toContain("EDIT")
      await h.mockInput.typeText("f"); await h.flush()
      expect(h.captureCharFrame()).toContain("EXERCISES:")
      expect(h.captureCharFrame()).toContain("AI · CHAT")
    } finally { await h.cleanup() }
  })
  test("assistant reading focus can maximize with f while typed f and drafts stay intact", async () => {
    const h = await setup()
    try {
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      await h.mockInput.typeText("draft f"); await h.flush()
      expect(h.captureCharFrame()).toContain("EXERCISES:")
      h.mockInput.pressEscape(); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("EXERCISES:")
      expect(h.captureCharFrame()).not.toContain("PROBLEM:")
      expect(find(h.renderer.root, "assistant")!.width).toBeGreaterThan(130)
      h.mockInput.pressEnter(); await h.flush()
      expect((find(h.renderer.root, "chat-input") as InputRenderable).value).toBe("draft f")
      await h.mockInput.typeText("f"); await h.flush()
      expect((find(h.renderer.root, "chat-input") as InputRenderable).value).toBe("draft ff")
      h.mockInput.pressEscape(); await h.flush()
      h.mockInput.pressEscape(); await h.flush()
      expect(h.captureCharFrame()).toContain("EXERCISES:")
      expect(h.captureCharFrame()).toContain("AI · CHAT")
    } finally { await h.cleanup() }
  })
  test("fullscreen preserves editor identity, dirty code and the problem's reading position", async () => {
    const h = await setup()
    try {
      const getProblem = h.source.getProblem
      h.source.getProblem = async (track, slug) => {
        const result = await getProblem(track, slug)
        if (result.ok) result.value.body = "# Long problem\n\n" + Array.from({ length: 300 }, (_, i) => `Line ${i}`).join("\n")
        return result
      }
      await h.exercise.open("answer"); await h.flush()
      await waitForContent(h, "Long problem")
      h.mockInput.pressTab(); await h.flush()
      for (let i = 0; i < 5; i++) h.mockInput.pressKey("\x1b[6~")
      await h.flush()
      const problem = find(h.renderer.root, "problem") as ScrollBoxRenderable
      const position = problem.scrollTop
      expect(position).toBeGreaterThan(0)
      await h.mockInput.typeText("f"); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(find(h.renderer.root, "problem")).toBe(problem)
      expect(problem.scrollTop).toBe(position)
      h.mockInput.pressArrow("right"); h.mockInput.pressEnter(); await h.flush()
      const editor = find(h.renderer.root, "editor") as TextareaRenderable
      editor.setText("unsaved code"); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(h.exercise.getState().buffers["solution.py"]).toContain("f")
      const code = h.exercise.getState().buffers["solution.py"]
      h.mockInput.pressEscape(); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(find(h.renderer.root, "editor")).toBe(editor)
      expect(h.exercise.getState().buffers["solution.py"]).toBe(code)
      expect(h.exercise.getState().dirty).toBe(true)
    } finally { await h.cleanup() }
  })
  test("fullscreen mouse actions and Tab never leave focus in a hidden pane", async () => {
    const h = await setup(80, 24)
    try {
      const button = find(h.renderer.root, "content-fullscreen")!
      expect(button).toBeDefined()
      await h.mockMouse.click(button.x + 1, button.y); await h.flush()
      expect(h.captureCharFrame()).not.toContain("EXERCISES:")
      h.mockInput.pressTab(); await h.flush()
      expect(h.captureCharFrame()).toContain("AI · CHAT")
      h.mockInput.pressEscape(); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(find(h.renderer.root, "assistant")!.width).toBeGreaterThan(70)
      h.mockInput.pressEscape(); await h.flush()
      h.mockInput.pressEscape(); await h.flush()
      expect(h.captureCharFrame()).toContain("EXERCISES:")
    } finally { await h.cleanup() }
  })
  test("clicking readable pane content selects which pane f expands", async () => {
    const h = await setup()
    try {
      const log = find(h.renderer.root, "chat-log")!
      await h.mockMouse.click(log.x + 2, log.y + 2); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("EXERCISES:")
      expect(h.captureCharFrame()).toContain("AI · CHAT")
      await h.mockInput.typeText("f"); await h.flush()
      const problem = find(h.renderer.root, "problem")!
      await h.mockMouse.click(problem.x + 2, problem.y + 2); await h.flush()
      await h.mockInput.typeText("f"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("AI · CHAT")
      expect(h.captureCharFrame()).toContain("PROBLEM:")
    } finally { await h.cleanup() }
  })
  test("Tab and Shift+Tab reach every region including leaving chat on a narrow screen", async () => {
    const h = await setup(80)
    try {
      for (const region of ["content", "command", "actions", "header", "list"]) {
        h.mockInput.pressKey("TAB"); await h.flush()
        expect(h.captureCharFrame()).toContain(`focus:${region}`)
        if (region === "command") expect(h.captureCharFrame()).toContain("AI · CHAT")
        if (region === "list") expect(h.captureCharFrame()).toContain("EXERCISES")
      }
      h.mockInput.pressKey("TAB", { shift: true }); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:header")
    } finally { await h.cleanup() }
  })
  test("keyboard search can be left with Esc and does not trap Tab", async () => {
    const h = await setup()
    try {
      await h.mockInput.typeText("/"); await h.flush()
      await h.mockInput.typeText("Other"); await h.flush()
      expect(h.captureCharFrame()).toContain("1 tasks")
      h.mockInput.pressKey("ESCAPE"); await h.flush()
      h.mockInput.pressKey("TAB"); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:content")
    } finally { await h.cleanup() }
  })
  test("narrow-screen region switching preserves the chat draft and visible search filter", async () => {
    const h = await setup(80)
    try {
      await h.mockInput.typeText("/"); await h.flush()
      await h.mockInput.typeText("Other"); await h.flush()
      h.mockInput.pressEscape(); await h.flush()
      h.mockInput.pressKey("t", { ctrl: true }); await h.flush()
      await h.mockInput.typeText("Python"); await h.flush()
      expect(h.captureCharFrame()).toContain("1 tasks")
      h.mockInput.pressEscape(); await h.flush()
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      await h.mockInput.typeText("yardım et?"); await h.flush()
      h.mockInput.pressTab(); await h.flush()
      expect(h.captureCharFrame()).toContain("Other")
      expect((find(h.renderer.root, "exercise-search") as InputRenderable).value).toBe("Other")
      h.mockInput.pressTab({ shift: true }); await h.flush()
      expect(h.captureCharFrame()).toContain("yardım et?")
    } finally { await h.cleanup() }
  })
  test("question mark opens help, modal keys do not open tasks, and chat keeps punctuation", async () => {
    const h = await setup()
    try {
      await h.mockInput.typeText("?"); await h.flush()
      expect(h.captureCharFrame()).toContain("KEYBOARD SHORTCUTS")
      h.mockInput.pressKey("F7"); await h.flush()
      expect(h.exercise.getState().openedSlug).toBeUndefined()
      h.mockInput.pressKey("ESCAPE"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("KEYBOARD SHORTCUTS")
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      await h.mockInput.typeText("why?"); await h.flush()
      expect(h.captureCharFrame()).toContain("why?")
      expect(h.captureCharFrame()).not.toContain("KEYBOARD SHORTCUTS")
    } finally { await h.cleanup() }
  })
  test("keyboard tabs scroll the full problem and return from the editor without changing code", async () => {
    const h = await setup()
    try {
      await h.exercise.open("answer"); await h.flush()
      const before = h.exercise.getState().buffers["solution.py"]
      // Markdown highlighting uses a real worker outside the renderer's manual clock.
      for (let attempt = 0; attempt < 200 && !h.captureCharFrame().includes("Return seven."); attempt++) {
        await Bun.sleep(10); await h.flush()
      }
      expect(h.captureCharFrame()).toContain("Return seven.")
      h.mockInput.pressKey("TAB"); await h.flush()
      h.mockInput.pressKey("END"); await h.flush()
      expect(h.captureCharFrame()).toContain("FINAL INSTRUCTION")
      h.mockInput.pressKey("HOME"); await h.flush()
      expect(h.captureCharFrame()).toContain("Return seven.")
      h.mockInput.pressKey("ARROW_RIGHT"); await h.flush()
      h.mockInput.pressEnter(); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:editor")
      h.mockInput.pressKey("ESCAPE"); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:content")
      expect(h.exercise.getState().buffers["solution.py"]).toBe(before)
      h.mockInput.pressKey("ARROW_RIGHT"); await h.flush()
      expect(h.captureCharFrame()).toContain("TEST RESULTS")
    } finally { await h.cleanup() }
  })
  test("editor Tab inserts indentation and Code navigation reaches another solution file", async () => {
    const h = await setup()
    try {
      const getProblem = h.source.getProblem
      h.source.getProblem = async (track, slug) => {
        const result = await getProblem(track, slug)
        if (result.ok) result.value.solutionFiles.push("helper.py")
        return result
      }
      await h.source.download("python", "answer")
      await writeFile(join(h.workspace, "python", "answer", "helper.py"), "second file")
      await h.exercise.open("answer")
      h.mockInput.pressKey("e", { ctrl: true }); await h.flush()
      const editor = find(h.renderer.root, "editor") as TextareaRenderable
      editor.setText(""); await h.flush()
      h.mockInput.pressTab(); await h.flush()
      expect(h.exercise.getState().buffers["solution.py"]).toMatch(/^(\t| +)$/)
      expect(h.captureCharFrame()).toContain("focus:editor")
      h.mockInput.pressEscape(); await h.flush()
      h.mockInput.pressArrow("down"); await h.flush()
      expect(h.exercise.getState().activeFile).toBe("helper.py")
      h.mockInput.pressEnter(); await h.flush()
      expect(h.captureCharFrame()).toContain("second file")
    } finally { await h.cleanup() }
  })
  test("F8 switches platforms and footer Ask AI is reachable without a mouse", async () => {
    const h = await setup()
    try {
      h.exercise.deps.sources = { fixture: h.source, other: { ...h.source, id: "other", label: "Other Platform" } }
      h.mockInput.pressKey("F8")
      await h.waitFor(() => h.exercise.deps.source.id === "other" && !h.exercise.getState().loading)
      await h.flush()
      h.mockInput.pressTab({ shift: true }); await h.flush()
      h.mockInput.pressTab({ shift: true }); await h.flush()
      for (let i = 0; i < 3; i++) h.mockInput.pressArrow("right")
      await h.flush(); h.mockInput.pressEnter(); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:command")
    } finally { await h.cleanup() }
  })
  test("keyboard scrolling reaches the final test output and older chat messages", async () => {
    const h = await setup()
    try {
      h.source.runTests = async () => ({ ok: true, value: {
        trackSlug: "python", slug: "answer", passed: 1, failed: 0, total: 1,
        cases: [], raw: "OUTPUT START\n" + "output line\n".repeat(100) + "OUTPUT END",
        durationMs: 1, command: "fixture", exitCode: 0,
      } })
      await h.exercise.open("answer"); await h.flush()
      h.mockInput.pressKey("F5")
      await h.waitFor(() => h.exercise.getState().lastReport !== null); await h.flush()
      h.mockInput.pressTab(); await h.flush()
      h.mockInput.pressKey("END"); await h.flush()
      expect(h.captureCharFrame()).toContain("OUTPUT END")
      h.mockInput.pressKey("HOME"); await h.flush()
      expect(h.captureCharFrame()).toContain("OUTPUT START")
      for (let i = 0; i < 16; i++) await h.controller.ask(`message ${i}`)
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      const chat = find(h.renderer.root, "chat-log") as ScrollBoxRenderable
      const bottom = chat.scrollTop
      expect(bottom).toBeGreaterThan(0)
      h.mockInput.pressKey("\x1b[5~"); await h.flush()
      expect(chat.scrollTop).toBeLessThan(bottom)
      h.mockInput.pressKey("\x1b[6~"); await h.flush()
      expect(chat.scrollTop).toBe(bottom)
    } finally { await h.cleanup() }
  })
  test("short terminals can scroll help to its final shortcut and close it", async () => {
    const h = await setup(80, 20)
    try {
      await h.mockInput.typeText("?"); await h.flush()
      expect(h.captureCharFrame()).toContain("KEYBOARD SHORTCUTS")
      h.mockInput.pressKey("END"); await h.flush()
      expect(h.captureCharFrame()).toContain("Esc or ? to close")
      await h.mockInput.typeText("?"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("KEYBOARD SHORTCUTS")
    } finally { await h.cleanup() }
  })
  test("F7 opens the next exercise and header buttons open Connect by keyboard", async () => {
    const h = await setup()
    try {
      await h.exercise.open("answer"); await h.flush()
      h.mockInput.pressKey("F7")
      await h.waitFor(() => h.exercise.getState().openedSlug === "other"); await h.flush()
      h.mockInput.pressKey("ESCAPE"); await h.flush()
      h.mockInput.pressKey("ESCAPE"); await h.flush()
      h.mockInput.pressKey("TAB", { shift: true }); await h.flush()
      h.mockInput.pressKey("ARROW_RIGHT"); h.mockInput.pressKey("ARROW_RIGHT"); await h.flush()
      h.mockInput.pressEnter(); await h.flush()
      expect(h.captureCharFrame()).toContain("Connection ·")
      h.mockInput.pressKey("ESCAPE"); await h.flush()
      expect(h.captureCharFrame()).not.toContain("Connection ·")
    } finally { await h.cleanup() }
  })
  test("language picker reaches the end of a long catalog and cannot choose unsupported tracks", async () => {
    const h = await setup()
    try {
      h.source.supportedTracks = ["python", "last"]
      h.source.listTracks = async () => ({ ok: true, value: [
        { sourceId: "fixture", slug: "python", title: "Python", language: "python" },
        ...Array.from({ length: 40 }, (_, i) => ({ sourceId: "fixture", slug: `track${i}`, title: `Track ${i}`, language: `track${i}` })),
        { sourceId: "fixture", slug: "last", title: "Last Language", language: "last" },
      ] })
      // Refresh the catalog through the public adapter connection operation.
      h.source.connect = async () => {}
      await h.exercise.connect({}); await h.flush()
      h.mockInput.pressKey("t", { ctrl: true }); await h.flush()
      h.mockInput.pressKey("ARROW_DOWN"); h.mockInput.pressEnter(); await h.flush()
      expect(h.exercise.getState().activeTrack).toBe("python")
      h.mockInput.pressKey("END"); await h.flush()
      expect(h.captureCharFrame()).toContain("Last Language")
      h.mockInput.pressEnter(); await h.flush()
      expect(h.exercise.getState().activeTrack).toBe("last")
      expect(h.captureCharFrame()).not.toContain("Search languages")
    } finally { await h.cleanup() }
  })
  test("Enter opens the selected task, code is editable, Ctrl+E leaves the editor", async () => {
    const h = await setup()
    try {
      expect(h.captureCharFrame()).toContain("focus:list")
      h.mockInput.pressEnter()
      await h.waitFor(() => h.exercise.getState().openedSlug === "answer")
      await h.flush()
      expect(h.captureCharFrame()).toContain("focus:editor")
      expect(h.captureCharFrame()).toContain("return 1")
      h.mockInput.pressKey("e", { ctrl: true }); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:list")
    } finally { await h.cleanup() }
  })
  test("F5 runs the current on-screen buffer from the editor; F6 submits the same revision", async () => {
    const h = await setup()
    try {
      h.mockInput.pressEnter(); await h.waitFor(() => h.exercise.getState().openedSlug === "answer"); await h.flush()
      const editor = find(h.renderer.root, "editor") as TextareaRenderable
      editor.setText("def answer():\n    return 7\n")
      await h.flush()
      expect(h.exercise.getState().buffers["solution.py"]).toContain("return 7")
      h.mockInput.pressKey("F5")
      await h.flush()
      expect(h.exercise.getState().runningTests || h.exercise.getState().lastReport !== null).toBe(true)
      // Await the real child process; the renderer's manual clock advances
      // timers but cannot speed up pytest's process lifetime.
      await h.runFinished
      await h.waitFor(() => h.exercise.getState().lastReport !== null)
      await h.flush()
      expect(h.tested[0]).toContain("return 7")
      expect(h.exercise.getState().lastReport?.passed).toBe(1)
      expect(h.captureCharFrame()).toContain("1/1 passed")
      h.mockInput.pressKey("e", { ctrl: true }); await h.flush()
      h.mockInput.pressKey("F6")
      await h.waitFor(() => h.exercise.getState().lastSubmit !== null)
      expect(h.sent[0]).toContain("return 7")
      expect(h.exercise.getState().lastSubmit?.status).toBe("submitted")
      await h.flush()
      expect(h.captureCharFrame()).toContain("focus:content")
      h.mockInput.pressTab(); await h.flush()
      expect(h.captureCharFrame()).toContain("focus:command")
    } finally { await h.cleanup() }
  })
  test("mouse buttons open tasks and focus the chat; Turkish text and paste use a real input", async () => {
    const h = await setup()
    try {
      const row = find(h.renderer.root, "exercises")!
      await h.mockMouse.click(row.x + 5, row.y + 3)
      await h.waitFor(() => h.exercise.getState().openedSlug === "answer")
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      await h.mockInput.typeText("yardım et")
      h.mockInput.pressEnter()
      await h.waitFor(() => h.controller.state.chat.length === 2)
      expect(h.controller.state.chat[0]?.text).toBe("yardım et")
    } finally { await h.cleanup() }
  })
  test("Send from a dirty editor saves and tests automatically before uploading", async () => {
    const h = await setup()
    try {
      h.mockInput.pressEnter(); await h.waitFor(() => h.exercise.getState().openedSlug === "answer"); await h.flush()
      const editor = find(h.renderer.root, "editor") as TextareaRenderable
      editor.setText("def answer():\n    return 7\n"); await h.flush()
      h.mockInput.pressKey("F6"); await h.flush()
      await h.runFinished
      await h.submitFinished
      await h.waitFor(() => h.exercise.getState().lastSubmit !== null)
      expect(h.sent).toHaveLength(1)
      expect(h.sent[0]).toBe(h.tested[0]!)
    } finally { await h.cleanup() }
  })
  test("an 80-column screen offers reachable AI and work views", async () => {
    const h = await setup(80)
    try {
      expect(h.captureCharFrame()).toContain("AI →")
      h.mockInput.pressKey("l", { ctrl: true }); await h.flush()
      expect(h.captureCharFrame()).toContain("AI · CHAT")
      await h.mockInput.typeText("merhaba"); h.mockInput.pressEnter()
      await h.waitFor(() => h.controller.state.chat.length === 2)
    } finally { await h.cleanup() }
  })
})
