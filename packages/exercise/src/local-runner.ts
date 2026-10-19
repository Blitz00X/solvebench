import { testEnv, parseTestOutput } from "./runners"
import type { LocalPackage } from "./local-package"
import type { TestReport } from "./types"
import { spawn } from "node:child_process"

/** Run the explicitly imported argv, never an implicitly constructed shell command. */
export async function runLocalTests(item: LocalPackage): Promise<TestReport> {
  const { manifest, directory, slug } = item
  const started = Date.now(), command = manifest.testCommand.join(" ")
  const base = { trackSlug: manifest.language, slug, command }
  let output = "", exitCode = 1, timedOut = false
  try {
    const proc = spawn(manifest.testCommand[0]!, manifest.testCommand.slice(1), { cwd: directory, env: testEnv({ PYTHONDONTWRITEBYTECODE: "1" }), stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" })
    const stdout: string[] = [], stderr: string[] = []
    proc.stdout.setEncoding("utf8"); proc.stderr.setEncoding("utf8")
    proc.stdout.on("data", chunk => stdout.push(chunk))
    proc.stderr.on("data", chunk => stderr.push(chunk))
    const timer = setTimeout(() => {
      timedOut = true
      // Kill the command's process group so child processes cannot keep its pipes open.
      if (process.platform !== "win32" && proc.pid) {
        try { process.kill(-proc.pid, "SIGKILL") } catch { proc.kill("SIGKILL") }
      } else proc.kill("SIGKILL")
      proc.stdout.destroy(); proc.stderr.destroy()
    }, manifest.timeoutMs)
    try {
      exitCode = await new Promise<number>((resolve, reject) => {
        proc.once("error", reject)
        proc.once("close", code => resolve(code ?? 1))
      })
      output = [stdout.join(""), stderr.join("")].filter(Boolean).join("\n").trim()
    } finally { clearTimeout(timer) }
  } catch (error) { output = error instanceof Error ? error.message : String(error) }
  if (timedOut) output += `\nTimed out after ${manifest.timeoutMs} ms`
  let parsed = parseTestOutput(manifest.language, output, exitCode)
  // An arbitrary command may use a different report format. Its exit status is authoritative.
  if (timedOut || exitCode !== 0) {
    parsed = { ...parsed, failed: Math.max(1, parsed.failed), total: Math.max(parsed.passed + Math.max(1, parsed.failed), parsed.total), cases: [...parsed.cases, { name: "test command", outcome: timedOut ? "error" : "failed", message: output }] }
  } else if (!parsed.total) {
    parsed = { passed: 1, failed: 0, total: 1, cases: [{ name: "test command", outcome: "passed", message: "Command exited successfully" }] }
  }
  return { ...base, ...parsed, raw: output, durationMs: Date.now() - started, exitCode }
}
