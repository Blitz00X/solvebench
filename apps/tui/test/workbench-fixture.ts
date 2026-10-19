import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Ok } from "@solvebench/shared"
import { testEnv, type ExerciseSource, type TestReport } from "@solvebench/exercise"
import { ExerciseController } from "../src/exercise-controller"

/**
 * A realistic exercise platform: the first task is unlocked, the next one is
 * locked until the previous is submitted. This is what proves the "solved it but
 * the next one is still locked" complaint is actually fixed.
 */
export async function fixture(options: { lockedNext?: boolean; recommended?: string } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), "exercise-workbench-"))
  const sent: string[] = [], tested: string[] = []
  const completed = new Set<string>()
  let finishRun!: () => void
  const runFinished = new Promise<void>(resolve => { finishRun = resolve })
  let finishSubmit!: () => void
  const submitFinished = new Promise<void>(resolve => { finishSubmit = resolve })
  const slugs = ["answer", "other", "third"]
  const source: ExerciseSource = {
    id: "fixture", label: "Exercises", isConfigured: async () => true,
    listTracks: async () => Ok([{ sourceId: "fixture", slug: "python", title: "Python", language: "python" }]),
    listExercises: async () => Ok(slugs.map((slug, i) => ({
      sourceId: "fixture", trackSlug: "python", slug,
      title: slug === "answer" ? "Answer Seven" : slug === "other" ? "Other Task" : "Third Task",
      difficulty: "easy" as const,
      progress: completed.has(slug) ? "completed" as const
        : i === 0 || completed.has(slugs[i - 1]!) || !options.lockedNext ? "available" as const
        : "locked" as const,
      blurb: "",
      ...(options.recommended === slug ? { recommended: true } : {}),
    }))),
    getProblem: async (track, slug) => Ok({ sourceId: "fixture", trackSlug: track, slug, title: "Answer Seven", difficulty: "easy", body: "Return seven.\n" + Array.from({ length: 40 }, (_, i) => `Instruction ${i + 1}`).join("\n") + "\nFINAL INSTRUCTION", solutionFiles: ["solution.py"], testFiles: ["solution_test.py"] }),
    isDownloaded: async (track, slug) => Bun.file(join(workspace, track, slug, "solution.py")).exists(),
    download: async (track, slug) => {
      const directory = join(workspace, track, slug)
      await mkdir(directory, { recursive: true })
      if (!await Bun.file(join(directory, "solution.py")).exists()) {
        await writeFile(join(directory, "solution.py"), "def answer():\n    return 1\n")
        await writeFile(join(directory, "solution_test.py"), "from solution import answer\ndef test_answer():\n    assert answer() == 7\n")
      }
      return Ok({ sourceId: "fixture", trackSlug: track, slug, directory, files: [] })
    },
    runTests: async (track, slug) => {
      const directory = join(workspace, track, slug)
      tested.push(`${slug}:${await readFile(join(directory, "solution.py"), "utf8")}`)
      const proc = Bun.spawn(["python3", "-m", "pytest", "solution_test.py", "-q"], { cwd: directory, env: testEnv(), stdout: "pipe", stderr: "pipe" })
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
      finishRun()
      return Ok<TestReport>({ trackSlug: track, slug, passed: code === 0 ? 1 : 0, failed: code === 0 ? 0 : 1, total: 1, cases: [], raw: `${out}\n${err}`, durationMs: 1, command: "pytest", exitCode: code })
    },
    submit: async (track, slug) => {
      sent.push(`${slug}:${await readFile(join(workspace, track, slug, "solution.py"), "utf8")}`)
      completed.add(slug)
      finishSubmit()
      return Ok({ ok: true, status: "submitted", message: "Uploaded to Exercism.", raw: "Uploaded" })
    },
  }
  const exercise = new ExerciseController({ source, workspace })
  return { source, exercise, workspace, sent, tested, completed, runFinished, submitFinished, cleanup: () => rm(workspace, { recursive: true, force: true }) }
}
