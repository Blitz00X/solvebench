import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  isSourceFile,
  isTestFile,
  mergeProgress,
  primarySolutionFile,
  readSolutionFiles,
  scanExercise,
  scanTrackWorkspace,
} from "../src/local-state"

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "solvebench-local-"))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("file classification", () => {
  test("recognises test files across the tracks", () => {
    expect(isTestFile("hello_world_test.py")).toBe(true)
    expect(isTestFile("hello-world.spec.js")).toBe(true)
    expect(isTestFile("a.test.ts")).toBe(true)
    expect(isTestFile("hello_world.bats")).toBe(true)
    expect(isTestFile("test_hello_world.c")).toBe(true)
    expect(isTestFile("src/main.rs")).toBe(false)
  })

  test("recognises source files", () => {
    expect(isSourceFile("hello.py")).toBe(true)
    expect(isSourceFile("hello.go")).toBe(true)
    expect(isSourceFile("README.md")).toBe(false)
    expect(isSourceFile("config.json")).toBe(false)
  })
})

describe("scanExercise", () => {
  test("separates solution and test files and ignores noise directories", async () => {
    const dir = join(root, "python", "hello-world")
    await mkdir(join(dir, "node_modules"), { recursive: true })
    await mkdir(join(dir, ".exercism"), { recursive: true })
    await writeFile(join(dir, "hello_world.py"), "def hello():\n    pass\n")
    await writeFile(join(dir, "hello_world_test.py"), "def test():\n    pass\n")
    await writeFile(join(dir, "README.md"), "# doc")
    await writeFile(join(dir, ".exercism", "config.json"), "{}")
    await writeFile(join(dir, "node_modules", "dep.js"), "x")

    const state = await scanExercise("python", "hello-world", dir)
    expect(state).not.toBeNull()
    expect(state!.solutionFiles).toEqual(["hello_world.py"])
    expect(state!.testFiles).toEqual(["hello_world_test.py"])
    expect(state!.hasMetadata).toBe(true)
  })

  test("returns null for a directory that does not exist", async () => {
    expect(await scanExercise("python", "nope", join(root, "python", "nope"))).toBeNull()
  })
})

describe("scanTrackWorkspace", () => {
  test("finds every exercise directory in a track", async () => {
    for (const slug of ["a", "b"]) {
      const dir = join(root, "python", slug)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, "solution.py"), "x = 1")
    }
    const states = await scanTrackWorkspace(root, "python")
    expect(states.map((s) => s.slug).sort()).toEqual(["a", "b"])
  })

  test("returns an empty list for an absent track", async () => {
    expect(await scanTrackWorkspace(root, "cobol")).toEqual([])
  })
})

describe("mergeProgress", () => {
  const base = { sourceId: "exercism", trackSlug: "python", slug: "x", title: "X", difficulty: "easy" as const, blurb: "" }

  test("persisted completion wins over everything", () => {
    const state = mergeProgress({ ...base, progress: "locked" }, undefined, { status: "completed" })
    expect(state).toBe("completed")
  })

  test("local presence marks an exercise as started even when the platform says available", () => {
    const local = {
      trackSlug: "python",
      slug: "x",
      directory: "/x",
      solutionFiles: ["x.py"],
      testFiles: [],
      hasMetadata: true,
    }
    expect(mergeProgress({ ...base, progress: "available" }, local, null)).toBe("started")
  })

  test("a recorded attempt without local files still marks it started", () => {
    expect(mergeProgress({ ...base, progress: "available" }, undefined, { status: "started" })).toBe("started")
  })

  test("an untouched exercise keeps the platform state", () => {
    expect(mergeProgress({ ...base, progress: "locked" }, undefined, null)).toBe("locked")
    expect(mergeProgress({ ...base, progress: "available" }, undefined, null)).toBe("available")
  })
})

describe("primarySolutionFile", () => {
  const local = {
    trackSlug: "python",
    slug: "hello-world",
    directory: "/x",
    solutionFiles: ["a.py", "hello_world.py"],
    testFiles: ["hello_world_test.py"],
    hasMetadata: true,
  }

  test("prefers the file the platform declares as the solution", () => {
    const problem = {
      sourceId: "exercism",
      trackSlug: "python",
      slug: "hello-world",
      title: "Hello",
      difficulty: "easy" as const,
      body: "",
      solutionFiles: ["hello_world.py"],
      testFiles: ["hello_world_test.py"],
    }
    expect(primarySolutionFile(local, problem)).toBe("hello_world.py")
  })

  test("falls back to the first solution file, then to a test file", () => {
    expect(primarySolutionFile(local)).toBe("a.py")
    expect(primarySolutionFile({ ...local, solutionFiles: [] })).toBe("hello_world_test.py")
  })
})

describe("readSolutionFiles", () => {
  test("reads the content of the requested files", async () => {
    const dir = join(root, "ex")
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "a.py"), "print('hi')")
    const files = await readSolutionFiles(dir, ["a.py", "missing.py"])
    expect(files).toHaveLength(1)
    expect(files[0]!.content).toContain("hi")
  })
})
