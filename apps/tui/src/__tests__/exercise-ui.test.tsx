import { test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { App } from "../app"
import { AppController } from "../controller"
import { createSessionStore } from "../store"
import { MockProvider } from "@solvebench/agent-runtime"
import { SessionState } from "@solvebench/shared"
import { fixture } from "../../test/workbench-fixture"

test("persistent assistant, explicit actions, scrollable complete problem and result content", async () => {
  const data = await fixture()
  const store = createSessionStore(SessionState.parse({ id: "ui", repoRoot: data.workspace, mode: "learning", driver: "human" }))
  const controller = new AppController({ store, provider: new MockProvider() })
  const h = await testRender(() => <App state={store.state} controller={controller} exercise={data.exercise} />, { width: 140, height: 40 })
  try {
    await data.exercise.init(); await h.flush()
    const frame = h.captureCharFrame()
    for (const label of ["SOLVEBENCH", "EXERCISES", "PROBLEM", "AI · CHAT", "Test · F5", "Submit · F6", "Next task"]) expect(frame).toContain(label)
    await data.exercise.open("answer"); await h.flush()
    // The problem has 42 lines; it is retained in full, not clipped to ten lines.
    expect(data.exercise.getState().problem?.body).toContain("FINAL INSTRUCTION")
    for (let i = 0; i < 40 && !h.captureCharFrame().includes("FINAL INSTRUCTION"); i++) {
      await h.mockMouse.scroll(60, 25, "down", { delayMs: 10 })
    }
    await h.flush()
    expect(h.captureCharFrame()).toContain("FINAL INSTRUCTION")
  } finally { h.renderer.destroy(); await data.cleanup() }
})
