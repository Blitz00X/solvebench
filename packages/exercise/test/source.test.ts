import { describe, expect, test } from "bun:test"
import { Err, Ok } from "@solvebench/shared"
import type { ExerciseSource } from "../src/source"
import { sourceError } from "../src/source"
import { ExercismSource } from "../src/exercism-source"
import { resolveExercismConfig, isConfigured } from "../src/config"
import type { ExerciseSummary, Problem, TestReport, Track } from "../src/types"

/** A second implementation proves the seam works without the real platform. */
class FakeSource implements ExerciseSource {
  readonly id = "fake"
  readonly label = "Fake"
  constructor(private readonly completed = false) {}
  async isConfigured() {
    return true
  }
  async listTracks() {
    return Ok<Track[]>([{ sourceId: this.id, slug: "python", title: "Python", language: "python", numExercises: 1 }])
  }
  async listExercises(): ReturnType<ExerciseSource["listExercises"]> {
    return Ok<ExerciseSummary[]>([
      {
        sourceId: this.id,
        trackSlug: "python",
        slug: "two-fer",
        title: "Two Fer",
        difficulty: "easy",
        progress: this.completed ? "completed" : "available",
        blurb: "",
      },
    ])
  }
  async getProblem(): ReturnType<ExerciseSource["getProblem"]> {
    return Ok<Problem>({
      sourceId: this.id,
      trackSlug: "python",
      slug: "two-fer",
      title: "Two Fer",
      difficulty: "easy",
      body: "Return one for the given name.",
      solutionFiles: ["two_fer.py"],
      testFiles: ["two_fer_test.py"],
    })
  }
  async download(): ReturnType<ExerciseSource["download"]> {
    return Ok({
      sourceId: this.id,
      trackSlug: "python",
      slug: "two-fer",
      directory: "/tmp/two-fer",
      files: [{ path: "two_fer.py", content: "def two_fer():\n    pass\n" }],
    })
  }
  async isDownloaded() {
    return false
  }
  async runTests(): ReturnType<ExerciseSource["runTests"]> {
    return Ok<TestReport>({
      trackSlug: "python",
      slug: "two-fer",
      passed: 1,
      failed: 2,
      total: 3,
      cases: [],
      raw: "",
      durationMs: 1,
      command: "pytest",
    })
  }
}

describe("ExerciseSource is a platform-agnostic seam", () => {
  test("a non-exercism source satisfies the interface and is interchangeable", async () => {
    const source: ExerciseSource = new FakeSource()
    expect(source.id).toBe("fake")
    const tracks = await source.listTracks()
    expect(tracks.ok).toBe(true)
    if (!tracks.ok) return
    expect(tracks.value[0]!.slug).toBe("python")

    const exercises = await source.listExercises("python")
    if (!exercises.ok) throw new Error("expected ok")
    expect(exercises.value[0]!.progress).toBe("available")

    const completed: ExerciseSource = new FakeSource(true)
    const done = await completed.listExercises("python")
    if (!done.ok) throw new Error("expected ok")
    expect(done.value[0]!.progress).toBe("completed")
  })

  test("the interface carries every field the UI needs", async () => {
    const source: ExerciseSource = new FakeSource()
    const problem = await source.getProblem("python", "two-fer")
    if (!problem.ok) throw new Error("expected ok")
    expect(problem.value.solutionFiles).toContain("two_fer.py")
    expect(problem.value.body.length).toBeGreaterThan(0)

    const report = await source.runTests("python", "two-fer")
    if (!report.ok) throw new Error("expected ok")
    expect(report.value.failed).toBe(2)
  })

  test("errors are structured, not thrown strings", () => {
    const error = sourceError("not-unlocked", "You have not unlocked this exercise")
    expect(error.kind).toBe("not-unlocked")
    const result = Err(error)
    expect(result.ok).toBe(false)
  })
})

describe("ExercismSource", () => {
  const config = resolveExercismConfig({
    projectRoot: "/tmp/project",
    token: "test-token",
    fallbackToUserConfig: false,
  })

  test("id and label identify the source", () => {
    const source = new ExercismSource({ config })
    expect(source.id).toBe("exercism")
    expect(source.label).toBe("Exercism")
  })

  test("isConfigured is false without a token and true with one", async () => {
    const bare = new ExercismSource({ config: { ...config, token: "" } })
    expect(await bare.isConfigured()).toBe(false)
    expect(await new ExercismSource({ config }).isConfigured()).toBe(true)
  })

  test("listTracks maps API tracks to the domain shape", async () => {
    const source = new ExercismSource({
      config,
      api: {
        listTracks: async () => [{ slug: "python", title: "Python", num_exercises: 140 }],
        listExercises: async () => [],
        listCompletedSlugs: async () => new Set(),
        completeSolution: async () => ({ unlocked: [] }),
      },
    })
    const result = await source.listTracks()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value[0]).toEqual({
      sourceId: "exercism",
      slug: "python",
      title: "Python",
      language: "python",
      numExercises: 140,
    })
  })

  test("listExercises marks completed, started, locked and available", async () => {
    const source = new ExercismSource({
      config,
      api: {
        listTracks: async () => [],
        listExercises: async () => [
          { slug: "done", title: "Done", is_unlocked: true },
          { slug: "started-local", title: "Started", is_unlocked: true },
          { slug: "locked-one", title: "Locked", is_unlocked: false },
          { slug: "fresh", title: "Fresh", is_unlocked: true },
          { slug: "external", title: "External", is_unlocked: true, is_external: true },
        ],
        listCompletedSlugs: async () => new Set(["done"]),
        completeSolution: async () => ({ unlocked: [] }),
      },
    })
    const result = await source.listExercises("python")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const byslug = Object.fromEntries(result.value.map((e) => [e.slug, e.progress]))
    expect(byslug["done"]).toBe("completed")
    expect(byslug["locked-one"]).toBe("locked")
    expect(byslug["fresh"]).toBe("available")
    // External exercises are not part of the track's own exercise set.
    expect(result.value.some((e) => e.slug === "external")).toBe(false)
  })

  test("the list order is stable: tutorial first, then easy → medium → hard", async () => {
    // The API floats recently active work to the top and sinks completed
    // exercises to the end. The delivered list must not move between refreshes.
    const source = new ExercismSource({
      config,
      api: {
        listTracks: async () => [],
        listExercises: async () => [
          { slug: "two-fer", title: "Two Fer", difficulty: "hard", is_unlocked: true, type: "practice" },
          { slug: "hello-world", title: "Hello World", difficulty: "easy", is_unlocked: true, type: "tutorial" },
          { slug: "allergies", title: "Allergies", difficulty: "medium", is_unlocked: true, type: "practice", is_recommended: true },
          { slug: "reverse-string", title: "Reverse String", difficulty: "easy", is_unlocked: false, type: "practice" },
          { slug: "acronym", title: "Acronym", difficulty: "easy", is_unlocked: true, type: "practice" },
        ],
        listCompletedSlugs: async () => new Set(),
        completeSolution: async () => ({ unlocked: [] }),
      },
    })
    const result = await source.listExercises("bash")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.map((e) => e.slug)).toEqual(["hello-world", "acronym", "reverse-string", "allergies", "two-fer"])
    expect(result.value[0]!.kind).toBe("tutorial")
    expect(result.value[3]!.recommended).toBe(true)
  })

  test("a network failure is reported, never thrown", async () => {
    const source = new ExercismSource({
      config,
      api: {
        listTracks: async () => {
          throw new Error("boom")
        },
        listExercises: async () => [],
        listCompletedSlugs: async () => new Set(),
        completeSolution: async () => ({ unlocked: [] }),
      },
    })
    const result = await source.listTracks()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("network")
    expect(result.error.detail).toContain("boom")
  })

  test("running tests on a missing exercise is a not-found, not a crash", async () => {
    const source = new ExercismSource({ config: { ...config, workspace: "/tmp/does-not-exist-xyz" } })
    const result = await source.runTests("python", "nope")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("not-found")
  })
})

describe("resolveExercismConfig", () => {
  test("puts the workspace inside the project and isolates the CLI config", () => {
    const config = resolveExercismConfig({ projectRoot: "/repo", fallbackToUserConfig: false })
    expect(config.workspace).toBe("/repo/exercises")
    expect(config.configHome).toBe("/repo/.exercism-cli")
  })

  test("explicit overrides win over everything", () => {
    const config = resolveExercismConfig({
      projectRoot: "/repo",
      token: "explicit",
      workspace: "/custom/ws",
      configHome: "/custom/cfg",
      cliPath: "/custom/exercism",
      fallbackToUserConfig: false,
    })
    expect(config.token).toBe("explicit")
    expect(config.workspace).toBe("/custom/ws")
    expect(config.configHome).toBe("/custom/cfg")
    expect(config.cliPath).toBe("/custom/exercism")
  })

  test("isConfigured requires a token", () => {
    expect(isConfigured(resolveExercismConfig({ projectRoot: "/r", token: "", fallbackToUserConfig: false }))).toBe(false)
    expect(isConfigured(resolveExercismConfig({ projectRoot: "/r", token: "t", fallbackToUserConfig: false }))).toBe(true)
  })
})
