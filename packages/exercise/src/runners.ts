import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { TestCaseResult, TestReport } from "./types"

/**
 * Test tools are often installed in user-local directories (bats, go, the
 * exercism helper) that are not on the PATH of a GUI-launched process. Extend
 * PATH with the common locations so every runner can be found.
 */
export function testEnv(extra: Record<string, string> = {}): Record<string, string> {
  const home = homedir()
  const additions = [
    join(home, ".local", "bin"),
    join(home, "go", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".cargo", "bin"),
    "/usr/local/go/bin",
    "/usr/local/bin",
  ]
  const current = process.env.PATH ?? ""
  const merged = [...additions, current].filter(Boolean).join(":")
  return { ...process.env, PATH: merged, ...extra }
}

export interface RunnerSpec {
  /** Command to execute inside the exercise directory. */
  command: string[]
  /** Short label shown in the UI and stored in the report. */
  label: string
  /** Files that must exist for this runner to apply. */
  requires?: string[]
  /** Extra environment for the child process. */
  env?: Record<string, string>
}

/**
 * Chooses the native test command for a track. Mirrors the logic the user
 * already relies on in their shell script: exercism test picks the wrong
 * command for some tracks (cpp wants make, typescript wants yarn 4).
 */
export function runnerFor(trackSlug: string, files: readonly string[]): RunnerSpec | null {
  const has = (name: string) => files.some((f) => f === name || f.endsWith(`/${name}`))
  const hasExt = (ext: string) => files.some((f) => f.endsWith(ext))

  switch (trackSlug) {
    case "bash": {
      const bats = files.find((f) => f.endsWith(".bats"))
      if (!bats) return null
      return { command: ["bats", bats], label: "bats" }
    }
    case "python": {
      const test = files.find((f) => f.endsWith("_test.py"))
      if (!test) return null
      return { command: ["python3", "-m", "pytest", "-o", "markers=task", test, "-q"], label: "pytest" }
    }
    case "javascript": {
      if (hasExt(".spec.js") || hasExt(".test.js")) {
        return { command: ["npx", "jest", "--no-cache", "--ci"], label: "jest" }
      }
      return null
    }
    case "typescript": {
      if (has(".pnp.cjs") && has("test-runner.mjs")) return { command: ["npx", "--yes", "@yarnpkg/cli-dist@4.9.2", "node", "test-runner.mjs"], label: "yarn / jest" }
      if (has("test-runner.mjs")) return { command: ["node", "test-runner.mjs"], label: "jest" }
      if (hasExt(".test.ts")) return { command: ["npx", "jest", "--no-cache", "--ci"], label: "jest" }
      return null
    }
    case "go":
      return { command: ["go", "test", "-v", "./..."], label: "go test" }
    case "rust":
      return { command: ["cargo", "test", "--", "--color", "never"], label: "cargo test" }
    case "java": {
      // The wrapper is detected from the file list, not the process cwd.
      const wrapper = files.some((f) => f === "gradlew" || f.endsWith("/gradlew"))
      return { command: [wrapper ? "./gradlew" : "gradle", "test", "--console=plain", "-q"], label: "gradle" }
    }
    case "c":
      return { command: ["make", "test"], label: "make" }
    case "cpp":
      return { command: ["cmake", "--build", "build"], label: "cmake / CTest" }
    default:
      return null
  }
}

export interface RunOptions {
  trackSlug: string
  slug: string
  directory: string
  timeoutMs?: number
  env?: Record<string, string>
}

/**
 * Runs the exercise's tests and normalises the output into a TestReport.
 * The raw output is always preserved so the model and the human see the truth.
 */
export async function runTrackTests(options: RunOptions): Promise<TestReport> {
  const files = await listFiles(options.directory)
  const spec = runnerFor(options.trackSlug, files)
  const started = Date.now()

  if (!spec) {
    return {
      trackSlug: options.trackSlug,
      slug: options.slug,
      passed: 0,
      failed: 0,
      total: 0,
      cases: [],
      raw: `no test runner is known for track "${options.trackSlug}"`,
      durationMs: 0,
      command: "",
    }
  }

  const command = spec.command.join(" ")
  // Verify the executable is reachable before spawning; a missing tool must be
  // a reported failure, not an uncaught ENOENT.
  const env = testEnv({ ...spec.env, ...options.env })
  if (options.trackSlug === "cpp") {
    const { execute } = await import("./toolchains")
    const configured = await execute(["cmake", "-S", ".", "-B", "build", "-DEXERCISM_RUN_ALL_TESTS=ON"], options.directory, env)
    const built = configured.code === 0 ? await execute(["cmake", "--build", "build"], options.directory, env) : configured
    if (built.code !== 0) return { trackSlug: options.trackSlug, slug: options.slug, passed: 0, failed: 1, total: 1, cases: [{ name: "build", outcome: "error", message: built.output }], raw: built.output, durationMs: Date.now() - started, command: "cmake", exitCode: built.code }
    const tested = await execute(["ctest", "--test-dir", "build", "--output-on-failure"], options.directory, env)
    const totals = tested.output.match(/(\d+) tests failed out of (\d+)/)
    const total = Number(totals?.[2] ?? 0), failed = Number(totals?.[1] ?? 0)
    return { trackSlug: options.trackSlug, slug: options.slug, passed: total - failed, failed, total, cases: [], raw: tested.output, durationMs: Date.now() - started, command: "cmake + ctest", exitCode: tested.code }
  }
  const binary = spec.command[0]!
  const found = binary.startsWith("./") ? existsSync(join(options.directory, binary)) : Bun.which(binary, { PATH: env.PATH })
  if (!found) {
    return {
      trackSlug: options.trackSlug,
      slug: options.slug,
      passed: 0,
      failed: 1,
      total: 1,
      cases: [{ name: "runner", outcome: "error", message: `tool not found: ${binary}` }],
      raw: `tool not found: ${binary} (looked on PATH)`,
      durationMs: Date.now() - started,
      command,
    }
  }
  const proc = Bun.spawn(spec.command, {
    cwd: options.directory,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })

  let killed = false
  const timer = setTimeout(() => {
    killed = true
    proc.kill()
  }, options.timeoutMs ?? 120_000)
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const code = await proc.exited
  clearTimeout(timer)

  const raw = [stdout, stderr].filter((s) => s.trim().length > 0).join("\n").trim()
  let parsed = parseTestOutput(options.trackSlug, raw, code)
  let details = raw
  if (options.trackSlug === "java") {
    try {
      const dir = join(options.directory, "build/test-results/test")
      const reports = (await readdir(dir)).filter(file => file.endsWith(".xml"))
      if (reports.length) {
        const results = await Promise.all(reports.map(file => readFile(join(dir, file), "utf8")))
        const reportsParsed = results.map(parseJUnitXml)
        parsed = { passed: reportsParsed.reduce((n, p) => n + p.passed, 0), failed: reportsParsed.reduce((n, p) => n + p.failed, 0), total: reportsParsed.reduce((n, p) => n + p.total, 0), cases: reportsParsed.flatMap(p => p.cases) }
        details = `${raw}\n${results.join("\n")}`
      }
    } catch { /* A compile failure creates no XML; retain the compiler output. */ }
  }
  return {
    trackSlug: options.trackSlug,
    slug: options.slug,
    ...parsed,
    raw: killed ? `${details}\n\n(timed out after ${options.timeoutMs ?? 120_000}ms)` : details,
    durationMs: Date.now() - started,
    command,
    exitCode: code,
  }
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (["node_modules", "build", "target", ".git", ".venv", ".yarn"].includes(entry.name)) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)))
    else out.push(rel)
  }
  return out
}

type Parsed = Pick<TestReport, "passed" | "failed" | "total" | "cases">

/** Language-aware parsing. Each format reports counts and names differently. */
export function parseTestOutput(trackSlug: string, raw: string, exitCode: number): Parsed {
  switch (trackSlug) {
    case "bash":
      return parseTap(raw)
    case "python":
      return parsePytest(raw, exitCode)
    case "javascript":
    case "typescript":
      return parseJest(raw, exitCode)
    case "rust":
      return parseCargo(raw, exitCode)
    case "go":
      return parseGo(raw, exitCode)
    case "c":
    case "cpp":
      return parseMakeTest(raw, exitCode)
    case "java":
      return parseGradle(raw, exitCode)
    default:
      return generic(raw, exitCode)
  }
}

function parseTap(raw: string): Parsed {
  const cases: TestCaseResult[] = []
  for (const line of raw.split("\n")) {
    const ok = line.match(/^ok\s+\d+\s+(.*)$/)
    const notOk = line.match(/^not ok\s+\d+\s+(.*)$/)
    if (ok) cases.push({ name: ok[1]!.trim(), outcome: "passed", message: "" })
    else if (notOk) cases.push({ name: notOk[1]!.trim(), outcome: "failed", message: "" })
  }
  const passed = cases.filter((c) => c.outcome === "passed").length
  return { passed, failed: cases.length - passed, total: cases.length, cases }
}

function parsePytest(raw: string, exitCode: number): Parsed {
  const cases: TestCaseResult[] = []
  const summary = raw.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/)
  const failedMatch = raw.match(/(?:^|\s)(\d+)\s+failed/)
  const passed = summary ? Number(summary[1]) : 0
  const failed = failedMatch ? Number(failedMatch[1]) : 0
  // Collect individual outcomes from the verbose-ish test ids when present.
  for (const line of raw.split("\n")) {
    const pass = line.match(/^(\S+::\S+)\s+PASSED/)
    const fail = line.match(/^(\S+::\S+)\s+FAILED/)
    const failureSummary = line.match(/^FAILED\s+(\S+)(?:\s+-\s+(.*))?$/)
    if (pass) cases.push({ name: pass[1]!, outcome: "passed", message: "" })
    else if (fail) cases.push({ name: fail[1]!, outcome: "failed", message: "" })
    else if (failureSummary && !cases.some(c => c.name === failureSummary[1])) cases.push({ name: failureSummary[1]!, outcome: "failed", message: failureSummary[2] ?? "" })
  }
  const total = passed + failed
  if (total === 0 && exitCode !== 0 && /error/i.test(raw)) {
    return { passed: 0, failed: 1, total: 1, cases: [{ name: "collection", outcome: "error", message: raw.slice(0, 200) }] }
  }
  return { passed, failed, total, cases }
}

function parseJest(raw: string, exitCode: number): Parsed {
  const cases: TestCaseResult[] = []
  const summary = raw.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/)
  let failed = summary?.[1] ? Number(summary[1]) : 0
  const passed = summary?.[3] ? Number(summary[3]) : 0
  const total = summary?.[4] ? Number(summary[4]) : passed + failed
  for (const line of raw.split("\n")) {
    const pass = line.match(/^\s*✓\s+(.*)$/)
    const fail = line.match(/^\s*✕\s+(.*)$/)
    if (pass) cases.push({ name: pass[1]!.trim(), outcome: "passed", message: "" })
    else if (fail) cases.push({ name: fail[1]!.trim(), outcome: "failed", message: "" })
  }
  if (total === 0 && exitCode !== 0) {
    failed = 1
    cases.push({ name: "run", outcome: "error", message: raw.slice(0, 200) })
  }
  return { passed, failed, total: total || passed + failed, cases }
}

function parseCargo(raw: string, exitCode: number): Parsed {
  const cases: TestCaseResult[] = []
  let passed = 0
  let failed = 0
  for (const line of raw.split("\n")) {
    const result = line.match(/^test result:\s+\w+\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/)
    if (result) {
      passed += Number(result[1])
      failed += Number(result[2])
    }
    const ok = line.match(/^test\s+(\S+)\s+\.\.\.\s+ok$/)
    const bad = line.match(/^test\s+(\S+)\s+\.\.\.\s+FAILED/)
    if (ok) cases.push({ name: ok[1]!, outcome: "passed", message: "" })
    else if (bad) cases.push({ name: bad[1]!, outcome: "failed", message: "" })
  }
  if (passed + failed === 0 && exitCode !== 0) {
    return { passed: 0, failed: 1, total: 1, cases: [{ name: "compile", outcome: "error", message: raw.slice(0, 200) }] }
  }
  return { passed, failed, total: passed + failed, cases }
}

function parseGo(raw: string, exitCode: number): Parsed {
  const cases: TestCaseResult[] = []
  for (const line of raw.split("\n")) {
    const pass = line.match(/^\s*---\s+PASS:\s+(\S+)/)
    const fail = line.match(/^\s*---\s+FAIL:\s+(\S+)/)
    if (pass) cases.push({ name: pass[1]!, outcome: "passed", message: "" })
    else if (fail) cases.push({ name: fail[1]!, outcome: "failed", message: "" })
  }
  const passed = cases.filter((c) => c.outcome === "passed").length
  const failed = cases.filter((c) => c.outcome === "failed").length
  if (passed + failed === 0 && exitCode !== 0) {
    return { passed: 0, failed: 1, total: 1, cases: [{ name: "build", outcome: "error", message: raw.slice(0, 200) }] }
  }
  return { passed, failed, total: passed + failed, cases }
}

function parseMakeTest(raw: string, exitCode: number): Parsed {
  const unity = raw.match(/(\d+) Tests (\d+) Failures (\d+) Ignored/i)
  if (unity) {
    const total = Number(unity[1]), failed = Number(unity[2]), skipped = Number(unity[3])
    return { passed: total - failed - skipped, failed, total, cases: raw.split("\n").flatMap(line => {
      const result = line.match(/:[\d]+:([^:]+):(PASS|FAIL|IGNORE)(.*)/)
      return result ? [{ name: result[1]!, outcome: result[2] === "PASS" ? "passed" as const : result[2] === "FAIL" ? "failed" as const : "skipped" as const, message: result[3]!.trim() }] : []
    }) }
  }
  // The C/C++ exercism makefile prints "PASSED"/"FAILED" per assertion block.
  const passed = (raw.match(/\bPASSED\b/g) ?? []).length
  const failedCount = (raw.match(/\bFAILED\b/g) ?? []).length
  const cases: TestCaseResult[] = []
  for (let i = 0; i < passed; i++) cases.push({ name: `assertion ${i + 1}`, outcome: "passed", message: "" })
  for (let i = 0; i < failedCount; i++) cases.push({ name: `assertion ${passed + i + 1}`, outcome: "failed", message: "" })
  if (passed + failedCount === 0 && exitCode !== 0) {
    return { passed: 0, failed: 1, total: 1, cases: [{ name: "compile", outcome: "error", message: raw.slice(0, 200) }] }
  }
  return { passed, failed: failedCount, total: passed + failedCount, cases }
}

function parseGradle(raw: string, exitCode: number): Parsed {
  const cases: TestCaseResult[] = []
  let failed = 0
  let passed = 0
  for (const line of raw.split("\n")) {
    // Gradle prints "ClassName > method PASSED". Match the whole label before
    // the trailing status word.
    const pass = line.match(/^(.+?)\s+PASSED\s*$/)
    const fail = line.match(/^(.+?)\s+FAILED\s*$/)
    if (pass) {
      passed++
      cases.push({ name: pass[1]!.trim(), outcome: "passed", message: "" })
    } else if (fail) {
      failed++
      cases.push({ name: fail[1]!.trim(), outcome: "failed", message: "" })
    }
  }
  if (passed + failed === 0 && exitCode !== 0) {
    return { passed: 0, failed: 1, total: 1, cases: [{ name: "build", outcome: "error", message: raw.slice(0, 200) }] }
  }
  // Gradle in quiet mode reports only failures; count one pass per test task.
  if (passed === 0 && failed === 0 && exitCode === 0) {
    return { passed: 1, failed: 0, total: 1, cases: [{ name: "test task", outcome: "passed", message: "" }] }
  }
  return { passed, failed, total: passed + failed, cases }
}

function generic(raw: string, exitCode: number): Parsed {
  return {
    passed: exitCode === 0 ? 1 : 0,
    failed: exitCode === 0 ? 0 : 1,
    total: 1,
    cases: [{ name: "run", outcome: exitCode === 0 ? "passed" : "failed", message: raw.slice(0, 200) }],
  }
}

export function parseJUnitXml(xml: string): Parsed {
  const attr = (text: string, name: string) => text.match(new RegExp(`${name}=["']([^"']*)["']`))?.[1] ?? ""
  const suite = xml.match(/<testsuite\b([^>]*)>/)?.[1] ?? ""
  const total = Number(attr(suite, "tests")), failed = Number(attr(suite, "failures")) + Number(attr(suite, "errors")), skipped = Number(attr(suite, "skipped"))
  const cases: TestCaseResult[] = []
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = match[2] ?? "", failure = /<(failure|error)\b/.test(body)
    cases.push({ name: `${attr(match[1]!, "classname")}.${attr(match[1]!, "name")}`, outcome: failure ? "failed" : /<skipped\b/.test(body) ? "skipped" : "passed", message: failure ? body.replace(/<[^>]*>/g, "").trim() : "" })
  }
  return { passed: total - failed - skipped, failed, total, cases }
}
