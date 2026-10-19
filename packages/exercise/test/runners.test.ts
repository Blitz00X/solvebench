import { describe, expect, test } from "bun:test"
import { parseTestOutput, runnerFor, testEnv } from "../src/runners"

describe("runnerFor", () => {
  test("picks bats for a bash exercise", () => {
    const spec = runnerFor("bash", ["hello_world.bats", "hello_world.sh"])
    expect(spec?.command[0]).toBe("bats")
    expect(spec?.command).toContain("hello_world.bats")
  })

  test("picks pytest for a python exercise", () => {
    const spec = runnerFor("python", ["hello_world.py", "hello_world_test.py"])
    expect(spec?.command[0]).toBe("python3")
    expect(spec?.command).toContain("-m")
    expect(spec?.command).toContain("pytest")
  })

  test("picks jest for javascript and typescript", () => {
    expect(runnerFor("javascript", ["hello.spec.js"])?.command).toContain("jest")
    expect(runnerFor("typescript", ["test-runner.mjs"])?.command).toEqual(["node", "test-runner.mjs"])
  })

  test("picks cargo and go for those tracks", () => {
    expect(runnerFor("rust", ["Cargo.toml"])?.command[0]).toBe("cargo")
    expect(runnerFor("go", ["go.mod"])?.command[0]).toBe("go")
  })

  test("picks make for c and cpp", () => {
    expect(runnerFor("c", ["makefile"])?.command).toEqual(["make", "test"])
    expect(runnerFor("cpp", ["CMakeLists.txt"])?.command).toEqual(["cmake", "--build", "build"])
  })

  test("picks the gradle wrapper for java when present", () => {
    const withWrapper = runnerFor("java", ["gradlew", "src/Main.java"])
    expect(withWrapper?.command[0]).toBe("./gradlew")
    const withoutWrapper = runnerFor("java", ["src/Main.java"])
    expect(withoutWrapper?.command[0]).toBe("gradle")
  })

  test("returns null for an unknown track", () => {
    expect(runnerFor("cobol", ["a.cob"])).toBeNull()
  })

  test("returns null when the track's test file is absent", () => {
    expect(runnerFor("python", ["hello.py"])).toBeNull()
  })
})

describe("testEnv", () => {
  test("adds the common user-local tool directories to PATH", () => {
    const env = testEnv()
    const path = env.PATH ?? ""
    expect(path).toContain("/.local/bin")
    expect(path).toContain("/.cargo/bin")
    expect(path).toContain("/usr/local/go/bin")
    // The original PATH is preserved at the end.
    if (process.env.PATH) expect(path.endsWith(process.env.PATH)).toBe(true)
  })
})

describe("parseTestOutput", () => {
  test("parses TAP output from bats", () => {
    const raw = ["1..3", "ok 1 Say Hi!", "not ok 2 Two Fer", "ok 3 Another"].join("\n")
    const parsed = parseTestOutput("bash", raw, 1)
    expect(parsed.passed).toBe(2)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(3)
    expect(parsed.cases.find((c) => c.name === "Two Fer")?.outcome).toBe("failed")
  })

  test("parses pytest output", () => {
    const raw = ["hello_world_test.py .F", "1 failed, 1 passed in 0.02s"].join("\n")
    const parsed = parseTestOutput("python", raw, 1)
    expect(parsed.passed).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(2)
  })

  test("parses a pytest collection error", () => {
    const raw = "ERROR: file not found: hello_test.py"
    const parsed = parseTestOutput("python", raw, 2)
    expect(parsed.total).toBe(1)
    expect(parsed.cases[0]!.outcome).toBe("error")
  })

  test("parses jest output", () => {
    const raw = ["PASS  hello.spec.js", "  ✓ adds", "  ✕ subtracts", "Tests:       1 failed, 1 passed, 2 total"].join("\n")
    const parsed = parseTestOutput("javascript", raw, 1)
    expect(parsed.passed).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(2)
    expect(parsed.cases.some((c) => c.name === "subtracts" && c.outcome === "failed")).toBe(true)
  })

  test("parses cargo test output", () => {
    const raw = ["running 2 tests", "test hello_world ... ok", "test fails ... FAILED", "test result: FAILED. 1 passed; 1 failed; 0 ignored"].join("\n")
    const parsed = parseTestOutput("rust", raw, 101)
    expect(parsed.passed).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(2)
  })

  test("parses go test output", () => {
    const raw = ["=== RUN   TestHello", "--- PASS: TestHello (0.00s)", "--- FAIL: TestOther (0.00s)", "FAIL"].join("\n")
    const parsed = parseTestOutput("go", raw, 1)
    expect(parsed.passed).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(2)
  })

  test("parses C make test output (PASSED/FAILED blocks)", () => {
    const raw = ["PASSED", "PASSED", "FAILED"].join("\n")
    const parsed = parseTestOutput("c", raw, 1)
    expect(parsed.passed).toBe(2)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(3)
  })

  test("parses gradle test output", () => {
    const raw = ["HelloWorldTest > testHello PASSED", "HelloWorldTest > testX FAILED"].join("\n")
    const parsed = parseTestOutput("java", raw, 1)
    expect(parsed.passed).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.total).toBe(2)
  })

  test("a silent successful gradle run counts as one passing task", () => {
    const parsed = parseTestOutput("java", "", 0)
    expect(parsed.passed).toBe(1)
    expect(parsed.total).toBe(1)
  })

  test("a compile failure with no test lines is reported as an error", () => {
    const parsed = parseTestOutput("rust", "error[E0425]: cannot find value", 101)
    expect(parsed.failed).toBe(1)
    expect(parsed.cases[0]!.outcome).toBe("error")
  })
})

describe("missing tool handling", () => {
  test("a runner whose tool is absent reports a clear failure instead of crashing", async () => {
    const { runTrackTests } = await import("../src/runners")
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const dir = await mkdtemp(join(tmpdir(), "solvebench-notool-"))
    // A go exercise, but go is not guaranteed on PATH for the test process.
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "go.mod"), "module x")
    await writeFile(join(dir, "x_test.go"), "package x")
    // Force a tool name that cannot exist so the check is deterministic.
    const previous = process.env.PATH
    process.env.PATH = "/nonexistent-bin-dir"
    try {
      const report = await runTrackTests({ trackSlug: "go", slug: "x", directory: dir, timeoutMs: 5000 })
      // Either the tool is missing (reported) or it ran; both must be a report,
      // never a thrown error. With an empty PATH it must be the missing case.
      expect(report.command).toContain("go")
      expect(report.failed).toBe(1)
      expect(report.cases[0]!.outcome).toBe("error")
      expect(report.raw).toContain("tool not found")
    } finally {
      if (previous === undefined) delete process.env.PATH
      else process.env.PATH = previous
      await rm(dir, { recursive: true, force: true })
    }
  })
})
