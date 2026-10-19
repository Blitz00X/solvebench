import { describe, expect, test } from "bun:test"
import { parseArgs } from "../src/main"

describe("CLI argument parsing", () => {
  test("defaults to the current directory as workspace", () => {
    expect(parseArgs([])).toEqual({})
  })

  test("--repo <path> sets the workspace", () => {
    expect(parseArgs(["--repo", "/tmp/project"])).toEqual({ repoRoot: "/tmp/project" })
  })

  test("--repo=<path> form works too", () => {
    expect(parseArgs(["--repo=/tmp/project"])).toEqual({ repoRoot: "/tmp/project" })
  })

  test("unknown flags are ignored rather than fatal", () => {
    expect(parseArgs(["--wat", "--repo", "/x"])).toEqual({ repoRoot: "/x" })
  })

  test("a dangling --repo does not crash", () => {
    expect(parseArgs(["--repo"])).toEqual({})
  })
  test("help, version and sample switches are parsed without becoming a workspace", () => {
    expect(parseArgs(["--help"])).toEqual({ help: true })
    expect(parseArgs(["--version"])).toEqual({ version: true })
    expect(parseArgs(["--sample", "--repo", "/tmp/sample"])).toEqual({ sample: true, repoRoot: "/tmp/sample" })
  })
  test("help and version exit without a terminal or creating workspace files", async () => {
    for (const flag of ["--help", "--version"]) {
      const proc = Bun.spawn([process.execPath, "apps/tui/src/main.tsx", flag], { stdout: "pipe", stderr: "pipe", timeout: 5000 })
      const output = await new Response(proc.stdout).text()
      expect(await proc.exited).toBe(0)
      expect(output).toContain(flag === "--help" ? "Usage:" : "solvebench 0.1.0-alpha.1")
    }
  })
})
