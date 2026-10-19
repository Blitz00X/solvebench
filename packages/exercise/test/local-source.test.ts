import { afterEach, beforeEach, expect, test } from "bun:test"
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { LocalExerciseSource } from "../src/local-source"

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "local-exercises-")) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
async function question(name: string, overrides = {}) {
  const directory = join(root, "input", name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, "exercise.json"), JSON.stringify({ title: name, language: "python", difficulty: "easy", statement: "question.md", solutionFiles: ["solution.py"], testFiles: ["test_solution.py"], testCommand: ["python3", "-m", "pytest", "test_solution.py", "-q"], ...overrides }))
  await writeFile(join(directory, "question.md"), "# Return seven\nWrite a function returning 7.")
  await writeFile(join(directory, "solution.py"), "def answer():\n    return 1\n")
  await writeFile(join(directory, "test_solution.py"), "from solution import answer\ndef test_answer():\n    assert answer() == 7\n")
  return directory
}
const source = () => new LocalExerciseSource(join(root, "managed"))

test.skipIf(process.getuid?.() === 0)("read-only storage reports a permission error and leaves the source unchanged", async () => {
  const input = await question("one")
  const storage = join(root, "managed")
  await mkdir(storage)
  await chmod(storage, 0o500)
  try {
    const result = await source().importExercises(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.detail).toMatch(/EACCES|permission denied/i)
      expect(result.error.detail).toContain(storage)
    }
    expect(await readFile(join(input, "solution.py"), "utf8")).toContain("return 1")
    expect(await readdir(storage)).toEqual([])
  } finally { await chmod(storage, 0o700) }
})

test("imports a collection, reads markdown and tests, and survives a new source instance", async () => {
  await question("sum-two"); await question("reverse-string", { language: "javascript" })
  const s = source()
  const result = await s.importExercises(join(root, "input"))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.detail)
  expect(result.value.map(e => e.slug)).toEqual(["reverse-string", "sum-two"])
  expect((await source().listTracks()).ok).toBe(true)
  const listed = await source().listExercises("python")
  expect(listed.ok && listed.value[0]?.title).toBe("sum-two")
  const problem = await s.getProblem("python", "sum-two")
  expect(problem.ok && problem.value.body).toContain("# Return seven")
  expect(problem.ok && problem.value.testFiles).toEqual(["test_solution.py"])
  const downloaded = await s.download("python", "sum-two")
  expect(downloaded.ok && downloaded.value.directory).toBe(join(root, "managed/python/sum-two"))
  expect(s.submit).toBeUndefined()
})

test("single import does not execute code or modify the original; duplicates preserve edits", async () => {
  const input = await question("one", { testCommand: ["sh", "-c", "touch was-executed"] })
  const s = source()
  expect((await s.importExercises(input)).ok).toBe(true)
  expect(await Bun.file(join(root, "managed/python/one/was-executed")).exists()).toBe(false)
  await writeFile(join(root, "managed/python/one/solution.py"), "edited")
  const duplicate = await s.importExercises(input)
  expect(duplicate.ok).toBe(false)
  expect(await readFile(join(root, "managed/python/one/solution.py"), "utf8")).toBe("edited")
  expect(await readFile(join(input, "solution.py"), "utf8")).toContain("return 1")
})

test("a malformed collection imports nothing and reports the offending folder", async () => {
  await question("good"); await question("bad", { testCommand: "python test.py" })
  const result = await source().importExercises(join(root, "input"))
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.detail).toContain("bad")
  expect(await Bun.file(join(root, "managed/python/good/exercise.json")).exists()).toBe(false)
})

test("rejects traversal, missing files and symbolic links", async () => {
  for (const [name, overrides] of [
    ["bad-slug", { slug: "../escape" }],
    ["bad-path", { statement: "../outside.md" }],
    ["missing", { solutionFiles: ["absent.py"] }],
  ] as const) {
    expect((await source().importExercises(await question(name, overrides))).ok).toBe(false)
  }
  const input = await question("linked")
  await symlink("/tmp", join(input, "outside"))
  expect((await source().importExercises(input)).ok).toBe(false)
})

test("runs real imported tests against the managed solution and preserves failure output", async () => {
  const s = source(); await s.importExercises(await question("one"))
  const failed = await s.runTests("python", "one")
  expect(failed.ok && failed.value.failed).toBeGreaterThan(0)
  expect(failed.ok && failed.value.raw).toContain("assert")
  await writeFile(join(root, "managed/python/one/solution.py"), "def answer():\n    return 7\n")
  const passed = await s.runTests("python", "one")
  expect(passed.ok && passed.value.passed).toBe(1)
  expect(passed.ok && passed.value.exitCode).toBe(0)
})

test("nonzero exit, missing executable and timeout cannot produce a passing report", async () => {
  const inputs = [
    ["exit", { testCommand: ["python3", "-c", "print('1 passed'); exit(2)"] }],
    ["missing-tool", { testCommand: ["solvebench-tool-does-not-exist"] }],
    ["timeout", { testCommand: ["python3", "-c", "import time; time.sleep(5)"], timeoutMs: 50 }],
    ["child-timeout", { testCommand: ["sh", "-c", "sleep 2"], timeoutMs: 50 }],
  ] as const
  const s = source()
  for (const [name, overrides] of inputs) {
    await s.importExercises(await question(name, overrides))
    const start = Date.now()
    const result = await s.runTests("python", name)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.failed).toBeGreaterThan(0)
    if (name === "child-timeout") expect(Date.now() - start).toBeLessThan(1000)
  }
})

test("test-generated artifacts do not invalidate the stored exercise or catalog", async () => {
  const s = source()
  await s.importExercises(await question("artifacts", { testCommand: ["python3", "-c", "import os; os.symlink('solution.py', 'latest-result')"] }))
  expect((await s.runTests("python", "artifacts")).ok).toBe(true)
  expect((await s.getProblem("python", "artifacts")).ok).toBe(true)
  expect((await s.listTracks()).ok).toBe(true)
})
