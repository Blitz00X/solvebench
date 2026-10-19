import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resolveExercismConfig, ExercismSource, LeetCodeSource, ToolchainManager, runTrackTests } from "../packages/exercise/src"
import { execute } from "../packages/exercise/src/toolchains"

// Read-only platform checks. Never uploads a user's solution.
const exercism = new ExercismSource({ config: resolveExercismConfig({ projectRoot: process.cwd() }) })
const tracks = await exercism.listTracks()
if (!tracks.ok) throw new Error(tracks.error.detail)
console.log(`Exercism: ${tracks.value.length} tracks`)
const exercises = await exercism.listExercises("python")
if (!exercises.ok) throw new Error(exercises.error.detail)
console.log(`Exercism Python: ${exercises.value.length} exercises`)
const leetcode = new LeetCodeSource(join(process.cwd(), "exercises/leetcode"))
const catalog = await leetcode.listExercises("python3")
if (!catalog.ok) { console.error(`LeetCode catalog unavailable: ${catalog.error.detail}`); process.exitCode = 1 }
else {
  const problem = await leetcode.getProblem("python3", "two-sum")
  if (!problem.ok || !problem.value.body.includes("target")) throw new Error("LeetCode problem statement unavailable")
  console.log(`LeetCode: ${catalog.value.length} questions; Two Sum statement ${problem.value.body.length} chars`)
}

// Optional real toolchain installation check in user-owned, ignored storage.
if (process.argv.includes("--install-go") || process.argv.includes("--clean-go")) {
  const directory = await mkdtemp(join(tmpdir(), "workbench-go-"))
  try {
    await writeFile(join(directory, "go.mod"), "module workbenchtest\n\ngo 1.22\n")
    await writeFile(join(directory, "answer.go"), "package workbenchtest\nfunc Answer() int {return 7}\n")
    await writeFile(join(directory, "answer_test.go"), 'package workbenchtest\nimport "testing"\nfunc TestAnswer(t *testing.T){if Answer()!=7 {t.Fatal("want 7")}}\n')
    // --clean-go simulates an absent Go executable for discovery only. The
    // download, extraction, compiler and test execution are all real.
    const clean = process.argv.includes("--clean-go")
    const manager = new ToolchainManager(join(process.cwd(), clean ? ".solvebench/verify-toolchains" : ".solvebench/toolchains"),
      (args, cwd, env) => clean && args[0] === "go" && args[1] === "version"
        ? Promise.resolve({ code: 1, output: "clean-environment discovery" })
        : execute(args, cwd, env))
    await manager.prepare("go", directory, console.log)
    const report = await runTrackTests({ trackSlug: "go", slug: "test", directory, env: manager.env(directory) })
    if (report.exitCode !== 0 || report.passed !== 1) throw new Error(report.raw)
    console.log(`Managed Go environment: ${report.passed}/${report.total} passed`)
  } finally { await rm(directory, { recursive: true, force: true }) }
}
