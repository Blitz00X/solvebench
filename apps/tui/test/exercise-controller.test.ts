import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ExerciseSourceError } from "@solvebench/exercise"
import { Err, Ok, type Result } from "@solvebench/shared"
import { ExerciseController, type ExerciseControllerDeps } from "../src/exercise-controller"
import type { ExerciseSummary, LocalExercise, Problem, TestReport, Track } from "@solvebench/exercise"

type Source = ExerciseControllerDeps["source"]

interface FakeOptions {
  tracks?: Track[]
  exercises?: ExerciseSummary[]
  problem?: Problem
  downloaded?: boolean
  report?: TestReport
  failDownload?: ExerciseSourceError
  failTests?: string
  submitResult?: { ok: boolean; message: string; url?: string }
  hasSubmit?: boolean
}

function fakeSource(options: FakeOptions = {}): Source {
  const tracks: Track[] = options.tracks ?? [{ sourceId: "exercism", slug: "python", title: "Python", language: "python" }]
  const exercises: ExerciseSummary[] =
    options.exercises ?? [
      {
        sourceId: "exercism",
        trackSlug: "python",
        slug: "hello-world",
        title: "Hello World",
        difficulty: "easy",
        progress: "available",
        blurb: "",
      },
    ]
  const downloads: string[] = []
  return {
    id: "exercism",
    label: "Exercism",
    async isConfigured() {
      return true
    },
    async listTracks() {
      return Ok(tracks)
    },
    async listExercises() {
      return Ok(exercises)
    },
    async getProblem() {
      return Ok<Problem>(
        options.problem ?? {
          sourceId: "exercism",
          trackSlug: "python",
          slug: "hello-world",
          title: "Hello World",
          difficulty: "easy",
          body: "Say hello.",
          solutionFiles: ["hello_world.py"],
          testFiles: ["hello_world_test.py"],
        },
      )
    },
    async download(track: string, slug: string): Promise<Result<LocalExercise, ExerciseSourceError>> {
      if (options.failDownload) return Err(options.failDownload)
      downloads.push(slug)
      return Ok<LocalExercise>({
        sourceId: "exercism",
        trackSlug: track,
        slug,
        directory: `/ws/${track}/${slug}`,
        files: [{ path: "hello_world.py", content: "def hello(): ..." }],
      })
    },
    async isDownloaded() {
      return options.downloaded ?? false
    },
    async runTests() {
      if (options.failTests) return Err({ kind: "failed", detail: options.failTests })
      return Ok<TestReport>(
        options.report ?? {
          trackSlug: "python",
          slug: "hello-world",
          passed: 2,
          failed: 1,
          total: 3,
          cases: [],
          raw: "",
          durationMs: 5,
          command: "pytest",
        },
      )
    },
    ...(options.hasSubmit === false
      ? {}
      : {
          async submit() {
            const r = options.submitResult ?? { ok: true, message: "View your solution online", url: "https://exercism.org/tracks/python/exercises/hello-world/solutions/x" }
            return Ok(r)
          },
        }),
  } as unknown as Source
}

function controller(options: FakeOptions = {}, onOpenFile?: (p: string, c: string) => void, workspace = "/ws") {
  const source = fakeSource(options)
  const download = source.download.bind(source)
  source.download = async (track, slug) => {
    const result = await download(track, slug)
    return result.ok ? Ok({ ...result.value, directory: `${workspace}/${track}/${slug}` }) : result
  }
  const reports: TestReport[] = []
  const ctrl = new ExerciseController({
    source,
    workspace,
    ...(workspace === "/ws" ? { read: async () => "def hello(): return 'Hello, World!'" } : {}),
    ...(onOpenFile ? { onOpenFile } : {}),
    onTestReport: (r) => reports.push(r),
  })
  return { ctrl, reports }
}

describe("ExerciseController.init", () => {
  test("loads tracks and selects the first one", async () => {
    const { ctrl } = controller()
    await ctrl.init()
    const state = ctrl.getState()
    expect(state.tracks).toHaveLength(1)
    expect(state.activeTrack).toBe("python")
    expect(state.exercises).toHaveLength(1)
    expect(state.loading).toBe(false)
  })

  test("reports an error instead of crashing when the source is not configured", async () => {
    const source = fakeSource()
    source.isConfigured = async () => false
    const ctrl = new ExerciseController({ source, workspace: "/ws" })
    await ctrl.init()
    expect(ctrl.getState().error).toContain("not configured")
  })
})

describe("ExerciseController.open", () => {
  test("downloads when needed and reports the problem", async () => {
    const { ctrl } = controller({ downloaded: false })
    await ctrl.init()
    await ctrl.open("hello-world")
    const state = ctrl.getState()
    expect(state.activeSlug).toBe("hello-world")
    expect(state.problem?.title).toBe("Hello World")
    expect(state.error).toBeNull()
  })

  test("opens the exercise's solution file for the editor (release-blocking)", async () => {
    // A real temp workspace so the disk scan finds the solution file and the
    // controller actually pushes it to the host.
    const ws = await mkdtemp(join(tmpdir(), "solvebench-open-"))
    const dir = join(ws, "python", "hello-world")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "hello_world.py"), "def hello():\n    return 'Hello, World!'\n")
    await writeFile(join(dir, "hello_world_test.py"), "def test_x():\n    pass\n")

    const opened: { path: string; content: string }[] = []
    const { ctrl } = controller({ downloaded: true }, (path, content) => opened.push({ path, content }), ws)
    await ctrl.init()
    await ctrl.open("hello-world")

    expect(opened).toHaveLength(1)
    expect(opened[0]!.path).toBe("hello_world.py")
    expect(opened[0]!.content).toContain("Hello, World!")
    expect(ctrl.getState().activeFile).toBe("hello_world.py")
    await rm(ws, { recursive: true, force: true })
  })

  test("surfaces a download failure as an error", async () => {
    const { ctrl } = controller({ downloaded: false, failDownload: { kind: "not-unlocked", detail: "locked" } })
    await ctrl.init()
    await ctrl.open("hello-world")
    expect(ctrl.getState().error).toContain("not-unlocked")
  })
})

describe("ExerciseController.runTests", () => {
  test("records the report and notifies the host", async () => {
    const { ctrl, reports } = controller({ downloaded: true })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.runTests()
    expect(reports).toHaveLength(1)
    expect(reports[0]!.passed).toBe(2)
    expect(reports[0]!.failed).toBe(1)
    expect(ctrl.getState().lastReport).not.toBeNull()
    expect(ctrl.getState().runningTests).toBe(false)
  })

  test("a runner failure is reported, not thrown", async () => {
    const { ctrl } = controller({ downloaded: true, failTests: "no runner for track" })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.runTests()
    expect(ctrl.getState().error).toContain("no runner")
  })

  test("running with no exercise selected is a no-op", async () => {
    const { ctrl, reports } = controller({ exercises: [] })
    await ctrl.init()
    expect(ctrl.getState().activeSlug).toBeUndefined()
    await ctrl.runTests()
    expect(reports).toHaveLength(0)
  })
})

describe("ExerciseController selection and tracks", () => {
  test("moveSelection walks the list and clamps at the ends", async () => {
    const exercises: ExerciseSummary[] = ["a", "b", "c"].map((slug) => ({
      sourceId: "exercism",
      trackSlug: "python",
      slug,
      title: slug.toUpperCase(),
      difficulty: "easy",
      progress: "available",
      blurb: "",
    }))
    const { ctrl } = controller({ exercises })
    await ctrl.init()
    // init selects the first exercise so Enter works immediately.
    expect(ctrl.getState().activeSlug).toBe("a")
    ctrl.moveSelection(1)
    expect(ctrl.getState().activeSlug).toBe("b")
    ctrl.moveSelection(1)
    expect(ctrl.getState().activeSlug).toBe("c")
    ctrl.moveSelection(10)
    expect(ctrl.getState().activeSlug).toBe("c") // clamps at the end
    ctrl.moveSelection(-10)
    expect(ctrl.getState().activeSlug).toBe("a") // clamps at the start
  })

  test("nextTrack cycles back to the first track", async () => {
    const tracks: Track[] = [
      { sourceId: "exercism", slug: "python", title: "Python", language: "python" },
      { sourceId: "exercism", slug: "rust", title: "Rust", language: "rust" },
    ]
    const { ctrl } = controller({ tracks })
    await ctrl.init()
    expect(ctrl.getState().activeTrack).toBe("python")
    await ctrl.nextTrack()
    expect(ctrl.getState().activeTrack).toBe("rust")
    await ctrl.nextTrack()
    expect(ctrl.getState().activeTrack).toBe("python")
  })
})

describe("ExerciseController progress persistence", () => {
  test("progress marks merge into the exercise list after a run", async () => {
    const source = fakeSource({ downloaded: true })
    const persisted = new Map<string, "started" | "completed">()
    const progress = {
      get: (_s: string, _t: string, slug: string) => (persisted.has(slug) ? { status: persisted.get(slug)! } : null),
      markStarted: (_s: string, _t: string, slug: string) => void persisted.set(slug, "started"),
      // A passing local run records the attempt but is NOT platform acceptance.
      recordRun: (_s: string, _t: string, slug: string) => void persisted.set(slug, "started"),
      markCompleted: (_s: string, _t: string, slug: string) => void persisted.set(slug, "completed"),
      forTrack: () => [],
      all: () => [],
      summary: () => ({ started: 0, completed: 0 }),
    }
    const ctrl = new ExerciseController({
      source,
      workspace: "/ws",
      read: async () => "def hello(): return 'Hello, World!'",
      progress: progress as unknown as ExerciseControllerDeps["progress"],
    })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.runTests() // 2 passed, 1 failed -> started
    expect(ctrl.getState().exercises[0]!.progress).toBe("started")

    // A fully passing local run still only marks it started.
    source.runTests = async () =>
      Ok<TestReport>({
        trackSlug: "python",
        slug: "hello-world",
        passed: 3,
        failed: 0,
        total: 3,
        cases: [],
        raw: "",
        durationMs: 1,
        command: "pytest",
      })
    await ctrl.runTests()
    expect(ctrl.getState().exercises[0]!.progress).toBe("started")

    // Only a successful submit records completion.
    await ctrl.submit()
    expect(ctrl.getState().exercises[0]!.progress).toBe("completed")
  })
})

describe("ExerciseController.subscribe", () => {
  test("listeners receive state changes and can unsubscribe", async () => {
    const { ctrl } = controller()
    let calls = 0
    const off = ctrl.subscribe(() => calls++)
    await ctrl.init()
    expect(calls).toBeGreaterThan(0)
    const seen = calls
    off()
    ctrl.moveSelection(1)
    expect(calls).toBe(seen)
  })
})

describe("ExerciseController stale-response guard", () => {
  test("a slow track switch does not clobber the newly selected track", async () => {
    // listExercises for the first track resolves only after the second track
    // has already been selected: the stale response must be dropped.
    let releaseFirst: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const tracks: Track[] = [
      { sourceId: "exercism", slug: "bash", title: "Bash", language: "bash" },
      { sourceId: "exercism", slug: "python", title: "Python", language: "python" },
    ]
    const source = fakeSource({ tracks })
    const original = source.listExercises.bind(source)
    let calls = 0
    source.listExercises = async (track: string) => {
      calls++
      if (calls === 1) await gate // the first (bash) request hangs
      return original(track)
    }
    const ctrl = new ExerciseController({ source, workspace: "/ws" })
    const init = ctrl.init() // awaits bash, which is blocked
    // While bash is still pending, pick python.
    const pythonSwitch = ctrl.selectTrack("python")
    releaseFirst?.()
    await Promise.all([init, pythonSwitch])
    expect(ctrl.getState().activeTrack).toBe("python")
  })

  test("switching track then opening settles on the new track with no error", async () => {
    const tracks: Track[] = [
      { sourceId: "exercism", slug: "bash", title: "Bash", language: "bash" },
      { sourceId: "exercism", slug: "python", title: "Python", language: "python" },
    ]
    const { ctrl } = controller({ tracks, downloaded: true })
    await ctrl.init() // selects bash
    await ctrl.selectTrack("python")
    await ctrl.open("hello-world")
    expect(ctrl.getState().activeTrack).toBe("python")
    expect(ctrl.getState().error).toBeNull()
  })
})

describe("ExerciseController.submit", () => {
  test("refuses to submit when tests are not passing (unless forced)", async () => {
    const { ctrl } = controller({ downloaded: true })
    await ctrl.init()
    await ctrl.open("hello-world")
    // The default fake report is 2 passed / 1 failed.
    await ctrl.runTests()
    await ctrl.submit(false)
    expect(ctrl.getState().lastSubmit).toBeNull()
    expect(ctrl.getState().error).toContain("Run tests")
  })

  test("submits a green solution and records completion", async () => {
    const { ctrl } = controller({
      downloaded: true,
      report: { trackSlug: "python", slug: "hello-world", passed: 3, failed: 0, total: 3, cases: [], raw: "", durationMs: 1, command: "pytest" },
    })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.runTests()
    await ctrl.submit(false)
    const state = ctrl.getState()
    expect(state.lastSubmit).not.toBeNull()
    expect(state.lastSubmit!.ok).toBe(true)
    expect(state.submitting).toBe(false)
  })

  test("forced submit publishes even with failing tests", async () => {
    const { ctrl } = controller({ downloaded: true })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.submit(true)
    expect(ctrl.getState().lastSubmit).not.toBeNull()
  })

  test("a source without submit reports it cleanly", async () => {
    const { ctrl } = controller({ downloaded: true, hasSubmit: false })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.submit(true)
    expect(ctrl.getState().error).toContain("does not support submission")
  })

  test("a failed submission is reported, not thrown", async () => {
    const { ctrl } = controller({
      downloaded: true,
      submitResult: { ok: false, message: "network error" },
    })
    await ctrl.init()
    await ctrl.open("hello-world")
    await ctrl.submit(true)
    expect(ctrl.getState().error).toBeNull()
    expect(ctrl.getState().lastSubmit!.ok).toBe(false)
    expect(ctrl.getState().lastSubmit!.message).toBe("network error")
  })
})
