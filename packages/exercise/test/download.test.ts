import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ExercismSource } from "../src/exercism-source"
import { resolveExercismConfig } from "../src/config"
import type { ExercismApi } from "../src/exercism-api"
import type { ExerciseSource } from "../src/source"

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "solvebench-ex-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function sourceWithWorkspace(runCli: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>, api?: ExercismApi) {
  const config = resolveExercismConfig({
    projectRoot: root,
    token: "test-token",
    fallbackToUserConfig: false,
  })
  const source: ExerciseSource = new ExercismSource({ config, runCli, ...(api ? { api } : {}) })
  return { source, config }
}

describe("ExercismSource.download", () => {
  test("runs the CLI and reads back the downloaded files", async () => {
    const workspace = join(root, "exercises")
    const calls: string[][] = []
    const { source, config } = sourceWithWorkspace(async (args) => {
      calls.push(args)
      // Emulate the CLI creating the exercise directory.
      const dir = join(workspace, "python", "hello-world")
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, "hello_world.py"), "def hello():\n    return 'Hello, World!'\n")
      await writeFile(join(dir, "hello_world_test.py"), "def test_x():\n    assert True\n")
      await mkdir(join(dir, ".exercism"), { recursive: true })
      await writeFile(join(dir, ".exercism", "config.json"), JSON.stringify({ files: { solution: ["hello_world.py"] } }))
      return { code: 0, stdout: "downloaded", stderr: "" }
    })

    const result = await source.download("python", "hello-world")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.directory).toBe(join(workspace, "python", "hello-world"))
    const paths = result.value.files.map((f) => f.path).sort()
    expect(paths).toContain("hello_world.py")
    expect(paths).toContain("hello_world_test.py")
    // The CLI was asked for exactly this exercise.
    expect(calls[0]).toEqual(["download", "--track", "python", "--exercise", "hello-world"])
    expect(config.workspace).toBe(workspace)
  })

  test("does not run the CLI again when the exercise is already present", async () => {
    const workspace = join(root, "exercises")
    const dir = join(workspace, "python", "two-fer")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "two_fer.py"), "def two_fer():\n    pass\n")
    let called = 0
    const { source } = sourceWithWorkspace(async () => {
      called++
      return { code: 0, stdout: "", stderr: "" }
    })
    const result = await source.download("python", "two-fer")
    expect(result.ok).toBe(true)
    expect(called).toBe(0)
  })

  test("a locked exercise maps to a not-unlocked error, not a generic failure", async () => {
    const { source } = sourceWithWorkspace(async () => ({
      code: 1,
      stdout: "",
      stderr: "Error: You have not unlocked this exercise",
    }))
    const result = await source.download("python", "ghost-gobble-arcade-game")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("not-unlocked")
  })

  test("a generic CLI failure is preserved in the error detail", async () => {
    const { source } = sourceWithWorkspace(async () => ({ code: 1, stdout: "", stderr: "network unreachable" }))
    const result = await source.download("python", "two-fer")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("failed")
    expect(result.error.detail).toContain("network unreachable")
  })

  test("isDownloaded reflects the workspace on disk", async () => {
    const workspace = join(root, "exercises")
    const { source } = sourceWithWorkspace(async () => ({ code: 0, stdout: "", stderr: "" }))
    expect(await source.isDownloaded("python", "hello-world")).toBe(false)
    await mkdir(join(workspace, "python", "hello-world"), { recursive: true })
    expect(await source.isDownloaded("python", "hello-world")).toBe(true)
  })
})

describe("ExercismSource.getProblem with a downloaded exercise", () => {
  test("reads the README as the statement and config.json for the file list", async () => {
    const workspace = join(root, "exercises")
    const dir = join(workspace, "python", "hello-world")
    await mkdir(join(dir, ".exercism"), { recursive: true })
    await writeFile(join(dir, "README.md"), "# Hello World\n\nSay hello.\n\n## Instructions\n\nReturn the string.")
    await writeFile(
      join(dir, ".exercism", "config.json"),
      JSON.stringify({ files: { solution: ["hello_world.py"], test: ["hello_world_test.py"] } }),
    )
    const api: ExercismApi = {
      listTracks: async () => [],
      listExercises: async () => [{ slug: "hello-world", title: "Hello World", difficulty: "easy" }],
      listCompletedSlugs: async () => new Set(),
      completeSolution: async () => ({ unlocked: [] }),
    }
    const { source } = sourceWithWorkspace(async () => ({ code: 0, stdout: "", stderr: "" }), api)
    const result = await source.getProblem("python", "hello-world")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.title).toBe("Hello World")
    expect(result.value.body).toContain("Say hello")
    expect(result.value.body).toContain("# Hello World") // raw markdown is kept for rendering
    expect(result.value.solutionFiles).toEqual(["hello_world.py"])
    expect(result.value.testFiles).toEqual(["hello_world_test.py"])
  })
})

describe("isolation from the user's exercism setup", () => {
  test("the resolved config never points at ~/.config/exercism", () => {
    const config = resolveExercismConfig({ projectRoot: root, fallbackToUserConfig: false })
    expect(config.configHome.startsWith(root)).toBe(true)
    expect(config.workspace.startsWith(root)).toBe(true)
    expect(config.configHome).not.toContain(".config/exercism")
  })

  test("seedCliConfig writes a 0600 user.json in the isolated config home", async () => {
    const config = resolveExercismConfig({
      projectRoot: root,
      token: "seed-token",
      fallbackToUserConfig: false,
    })
    const source = new ExercismSource({ config })
    await source.seedCliConfig()
    const path = join(config.configHome, "user.json")
    expect(existsSync(path)).toBe(true)
    const written = JSON.parse(await Bun.file(path).text()) as { token: string; workspace: string; apibaseurl: string }
    expect(written.token).toBe("seed-token")
    expect(written.workspace).toBe(config.workspace)
  })
})
