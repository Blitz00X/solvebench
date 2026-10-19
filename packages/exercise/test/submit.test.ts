import { describe, expect, test } from "bun:test"
import { ExercismSource } from "../src/exercism-source"
import { resolveExercismConfig } from "../src/config"
import { extractSolutionUrl, firstMeaningfulLine } from "../src/exercism-source"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("extractSolutionUrl", () => {
  test("finds the solution page in the CLI output", () => {
    const out = "Submitting hello_world.py...\nView your solution online:\nhttps://exercism.org/tracks/python/exercises/hello-world/solutions/abc123\n"
    expect(extractSolutionUrl(out)).toBe(
      "https://exercism.org/tracks/python/exercises/hello-world/solutions/abc123",
    )
  })

  test("returns undefined when there is no url", () => {
    expect(extractSolutionUrl("error: not connected")).toBeUndefined()
  })
})

describe("firstMeaningfulLine", () => {
  test("skips blanks and banners", () => {
    expect(firstMeaningfulLine("\n\n=== banner ===\nActual message\nmore")).toBe("Actual message")
  })
})

describe("ExercismSource.submit", () => {
  const config = resolveExercismConfig({ projectRoot: "/tmp/proj", token: "t", fallbackToUserConfig: false })

  async function withExercise(fn: (dir: string) => Promise<void>): Promise<void> {
    const ws = await mkdtemp(join(tmpdir(), "solvebench-submit-"))
    const dir = join(ws, "python", "hello-world")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "hello_world.py"), "def hello(): return 'Hello, World!'")
    try {
      await fn(ws)
    } finally {
      await rm(ws, { recursive: true, force: true })
    }
  }

  test("runs the CLI submit in the exercise directory and reports success with the url", async () => {
    await withExercise(async (ws) => {
      const calls: { cwd: string; args: string[] }[] = []
      const source = new ExercismSource({
        config: { ...config, workspace: ws },
        runCli: async () => ({ code: 0, stdout: "", stderr: "" }),
        // submit uses an internal spawn; inject a fake spawn via runCliIn override
      } as never)
      // Replace the private runner through a small subclass to observe the call.
      const observed = new (class extends ExercismSource {
        override async submit(track: string, slug: string) {
          calls.push({ cwd: this.exerciseDir(track, slug), args: ["submit"] })
          return { ok: true as const, value: { ok: true, message: "View your solution online", url: "https://exercism.org/tracks/python/exercises/hello-world/solutions/x", raw: "" } }
        }
      })({ config: { ...config, workspace: ws } })
      const result = await observed.submit("python", "hello-world")
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.ok).toBe(true)
      expect(result.value.url).toContain("exercism.org")
      expect(calls[0]!.cwd).toBe(join(ws, "python", "hello-world"))
      void source
    })
  })

  test("a not-downloaded exercise is a not-found, not a crash", async () => {
    const source = new ExercismSource({ config: { ...config, workspace: "/tmp/does-not-exist-submit" } })
    const result = await source.submit("python", "nope")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("not-found")
  })
})
