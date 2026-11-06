#!/usr/bin/env bun
/**
 * Live CSES smoke test. Fetches the public catalog and one problem, imports its
 * sample case and runs a real local solution. It needs network access but no
 * account, and exits non-zero on a parser or runner failure.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CsesSource } from "../packages/exercise/src/cses-source"

const failures: string[] = []
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} - ${label}${detail ? ` (${detail})` : ""}`)
  if (!ok) failures.push(label)
}

const workspace = await mkdtemp(join(tmpdir(), "solvebench-cses-verify-"))
try {
  const source = new CsesSource({ workspace })
  const tracks = await source.listTracks()
  check("listTracks returns language tracks", tracks.ok && tracks.value.length === 9, tracks.ok ? `${tracks.value.length} tracks` : tracks.error.detail)

  const exercises = await source.listExercises("python")
  check("listExercises returns the public catalog", exercises.ok && exercises.value.length > 300, exercises.ok ? `${exercises.value.length} exercises` : exercises.error.detail)

  const problem = await source.getProblem("python", "1068")
  check("getProblem returns a statement", problem.ok && problem.value.title.length > 0 && problem.value.body.length > 100, problem.ok ? problem.value.title : problem.error.detail)

  const downloaded = await source.download("python", "1068")
  check("download writes a starter", downloaded.ok && await source.isDownloaded("python", "1068"), downloaded.ok ? downloaded.value.directory : downloaded.error.detail)

  if (downloaded.ok) {
    await writeFile(join(downloaded.value.directory, "solution.py"), "import sys\nn = int(sys.stdin.read())\nvalues = [n]\nwhile n != 1:\n    n = n // 2 if n % 2 == 0 else n * 3 + 1\n    values.append(n)\nprint(' '.join(map(str, values)))\n")
    const report = await source.runTests("python", "1068")
    check("runTests passes the published sample", report.ok && report.value.passed === 1 && report.value.failed === 0, report.ok ? `${report.value.passed}/${report.value.total}` : report.error.detail)
  }
} finally {
  await rm(workspace, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} CSES check(s) failed.`)
  process.exit(1)
}
console.log("\nCSES source verified against the live public problem set.")
