import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MockProvider } from "@solvebench/agent-runtime"
import { bootstrapApp } from "../src/bootstrap"
import { fixture } from "./workbench-fixture"
import { openDatabase, ExerciseProgressRepository } from "@solvebench/storage"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "solvebench-bootstrap-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("bootstrapApp (shipping wiring)", () => {
  test("reuses the previous application's progress database without creating an empty replacement", async () => {
    const db = openDatabase(join(dir, ".pairharness", "pairharness.db"))
    new ExerciseProgressRepository(db).markStarted("local", "python", "previous-attempt")
    db.close()
    const app = await bootstrapApp({ repoRoot: dir, modelProvider: new MockProvider() })
    expect(app.exercise.deps.progress?.get("local", "python", "previous-attempt")?.status).toBe("started")
    expect(await Bun.file(join(dir, ".solvebench", "solvebench.db")).exists()).toBe(false)
  })
  test("boots with DEFAULT options (no dbPath) — regression: bun run dev must work", async () => {
    // `bun run dev` passes no options, so the default .solvebench path must
    // work and no git repository may be required.
    const app = await bootstrapApp({ repoRoot: dir })
    expect(app.controller).toBeDefined()
    expect(app.exercise).toBeDefined()
    expect(await Bun.file(join(dir, ".solvebench", "solvebench.db")).exists()).toBe(true)
  })

  test("the exercise workflow shares the same store and provider as the chat", async () => {
    const h = await fixture()
    try {
      const app = await bootstrapApp({
        repoRoot: h.workspace,
        dbPath: join(h.workspace, "state.db"),
        exerciseSource: h.source,
        modelProvider: new MockProvider(),
        prepareEnvironment: false,
      })
      await app.exercise.init()
      expect(app.exercise.getState().tracks.length).toBeGreaterThan(0)
      await app.controller.ask("hello")
      expect(app.controller.state.chat).toHaveLength(2)
    } finally {
      await h.cleanup()
    }
  })
})
