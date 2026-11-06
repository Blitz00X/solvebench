import { spawn } from "node:child_process"
import { testEnv } from "./runners"
import type { TestCaseResult, TestReport } from "./types"

/**
 * One sample case for a stdin/stdout judge. Competitive-programming platforms
 * publish these next to the statement; they are the only local oracle available
 * without an account.
 */
export interface StdinCase {
  name: string
  input: string
  expected: string
}

export interface StdinRunnerOptions {
  trackSlug: string
  slug: string
  directory: string
  /** Command that reads stdin and writes stdout, e.g. ["python3", "solution.py"]. */
  command: string[]
  /** Optional one-time compile step, e.g. ["c++", "-O2", "solution.cpp", "-o", "solution"]. */
  build?: string[]
  cases: readonly StdinCase[]
  timeoutMs?: number
  env?: Record<string, string>
}

const MAX_OUTPUT = 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

interface Execution {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
  truncated: boolean
}

function execute(args: readonly string[], options: { cwd: string; env: Record<string, string>; input?: string; timeoutMs: number }): Promise<Execution> {
  return new Promise((resolve) => {
    const proc = spawn(args[0]!, args.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let truncated = false
    let settled = false

    const append = (current: string, chunk: string): string => {
      if (current.length >= MAX_OUTPUT) { truncated = true; return current }
      const next = current + chunk
      if (next.length > MAX_OUTPUT) { truncated = true; return next.slice(0, MAX_OUTPUT) }
      return next
    }
    proc.stdout!.setEncoding("utf8")
    proc.stderr!.setEncoding("utf8")
    proc.stdout!.on("data", (chunk: string) => { stdout = append(stdout, chunk) })
    proc.stderr!.on("data", (chunk: string) => { stderr = append(stderr, chunk) })

    const finish = (code: number, extra = "") => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr: extra ? `${stderr}\n${extra}`.trim() : stderr, timedOut, truncated })
    }
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform !== "win32" && proc.pid) {
        try { process.kill(-proc.pid, "SIGKILL") } catch { proc.kill("SIGKILL") }
      } else proc.kill("SIGKILL")
      proc.stdout!.destroy()
      proc.stderr!.destroy()
      finish(1, `Timed out after ${options.timeoutMs} ms`)
    }, options.timeoutMs)

    proc.once("error", (error) => finish(1, error.message))
    proc.once("close", (code) => finish(code ?? 1))
    proc.stdin!.on("error", () => { /* the child may exit before reading stdin */ })
    proc.stdin!.end(options.input ?? "")
  })
}

/** Line-ending and trailing-whitespace tolerant comparison. */
export function outputsMatch(expected: string, actual: string): boolean {
  const normalise = (value: string) => value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "")
  const left = normalise(expected)
  const right = normalise(actual)
  if (left === right) return true
  // A single numeric token is commonly accepted within a small tolerance.
  const a = Number(left)
  const b = Number(right)
  return left.length > 0 && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6
}

/**
 * Runs a solution once per sample case and normalises the result. This is the
 * reusable engine behind CSES and any future sample-based source; it never
 * uploads anything and never claims platform acceptance.
 */
export async function runStdinCases(options: StdinRunnerOptions): Promise<TestReport> {
  const started = Date.now()
  const environment = testEnv(options.env)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const command = options.command.join(" ")

  if (options.build?.length) {
    const build = await execute(options.build, { cwd: options.directory, env: environment, timeoutMs: Math.max(timeoutMs, 60_000) })
    if (build.code !== 0) {
      const message = [build.stderr, build.stdout].filter(Boolean).join("\n").trim().slice(0, 4000) || "build failed"
      return {
        trackSlug: options.trackSlug,
        slug: options.slug,
        passed: 0,
        failed: 1,
        total: 1,
        cases: [{ name: "build", outcome: "error", message }],
        raw: message,
        durationMs: Date.now() - started,
        command: options.build.join(" "),
        exitCode: build.code,
      }
    }
  }

  const cases: TestCaseResult[] = []
  const raw: string[] = []
  for (const [index, sample] of options.cases.entries()) {
    const result = await execute(options.command, { cwd: options.directory, env: environment, input: sample.input, timeoutMs })
    const actual = result.stdout
    const passed = !result.timedOut && result.code === 0 && outputsMatch(sample.expected, actual)
    const details: string[] = []
    if (result.timedOut) details.push("timed out")
    if (result.code !== 0) details.push(`exit ${result.code}`)
    if (!passed && !result.timedOut && result.code === 0) details.push("output differs")
    if (result.stderr.trim()) details.push(result.stderr.trim().slice(0, 1000))
    if (result.truncated) details.push("output truncated at 1 MiB")
    cases.push({
      name: sample.name || `sample ${index + 1}`,
      outcome: passed ? "passed" : result.timedOut || result.code !== 0 ? "error" : "failed",
      message: passed ? "" : details.join("; "),
    })
    raw.push(`# ${sample.name || `sample ${index + 1}`} ${passed ? "PASS" : "FAIL"}\n${result.stderr.trim()}`.trim())
    if (!passed && options.cases.length === 1) {
      raw.push(`expected:\n${sample.expected}\nactual:\n${actual}`)
    }
  }

  const passed = cases.filter((item) => item.outcome === "passed").length
  const failed = cases.length - passed
  return {
    trackSlug: options.trackSlug,
    slug: options.slug,
    passed,
    failed,
    total: cases.length,
    cases,
    raw: raw.join("\n\n").trim(),
    durationMs: Date.now() - started,
    command,
    exitCode: failed > 0 ? 1 : 0,
  }
}
