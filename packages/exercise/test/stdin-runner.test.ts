import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { outputsMatch, runStdinCases } from "../src/stdin-runner"

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("outputsMatch", () => {
  test("ignores line-ending and trailing-whitespace noise", () => {
    expect(outputsMatch("1 2\n", "1 2\r\n")).toBe(true)
    expect(outputsMatch("a\nb", "a\nb\n\n")).toBe(true)
    expect(outputsMatch("a  \nb", "a\nb")).toBe(true)
  })

  test("accepts a single numeric token within tolerance", () => {
    expect(outputsMatch("1.0000000", "1.0000001")).toBe(true)
    expect(outputsMatch("1", "2")).toBe(false)
  })

  test("distinguishes real output differences", () => {
    expect(outputsMatch("3 10 5", "3 10 6")).toBe(false)
  })
})

describe("runStdinCases", () => {
  test("runs one case per sample and reports pass and fail", async () => {
    const directory = await mkdtemp(join(tmpdir(), "solvebench-stdin-"))
    directories.push(directory)
    await writeFile(join(directory, "solution.py"), "import sys\nprint(sys.stdin.read().strip())\n")

    const report = await runStdinCases({
      trackSlug: "python",
      slug: "echo",
      directory,
      command: ["python3", "solution.py"],
      cases: [
        { name: "sample 1", input: "hello\n", expected: "hello" },
        { name: "sample 2", input: "world\n", expected: "different" },
      ],
    })

    expect(report.passed).toBe(1)
    expect(report.failed).toBe(1)
    expect(report.total).toBe(2)
    expect(report.exitCode).toBe(1)
    expect(report.cases[0]!.outcome).toBe("passed")
    expect(report.cases[1]!.outcome).toBe("failed")
  }, 20_000)

  test("a missing command becomes an error case, not an exception", async () => {
    const directory = await mkdtemp(join(tmpdir(), "solvebench-stdin-"))
    directories.push(directory)
    const report = await runStdinCases({
      trackSlug: "python",
      slug: "missing",
      directory,
      command: ["solvebench-command-that-does-not-exist"],
      cases: [{ name: "sample 1", input: "", expected: "" }],
    })
    expect(report.passed).toBe(0)
    expect(report.failed).toBe(1)
    expect(report.cases[0]!.outcome).toBe("error")
  }, 20_000)

  test("a failed build stops before any case runs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "solvebench-stdin-"))
    directories.push(directory)
    const report = await runStdinCases({
      trackSlug: "cpp",
      slug: "broken",
      directory,
      command: ["./solution"],
      build: ["false"],
      cases: [{ name: "sample 1", input: "", expected: "" }],
    })
    expect(report.total).toBe(1)
    expect(report.failed).toBe(1)
    expect(report.cases[0]!.name).toBe("build")
  }, 20_000)
})
