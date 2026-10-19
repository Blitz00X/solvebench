import { test, expect } from "bun:test"
import { mkdtemp, writeFile, mkdir, symlink, rm, chmod, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { saveSolution, readSolution } from "../src/workspace"

test("saving an exercise solution preserves executable mode and rejects traversal/symlink escapes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "safe-workspace-"))
  try {
    const task = join(directory, "task"); await mkdir(task)
    await writeFile(join(task, "solution.sh"), "echo old\n"); await chmod(join(task, "solution.sh"), 0o700)
    await saveSolution(task, "solution.sh", "echo new\n")
    expect(await readSolution(task, "solution.sh")).toBe("echo new\n")
    expect((await stat(join(task, "solution.sh"))).mode & 0o777).toBe(0o700)
    await writeFile(join(directory, "outside"), "private")
    await expect(saveSolution(task, "../outside", "wrong")).rejects.toThrow("escapes")
    await symlink(join(directory, "outside"), join(task, "escape"))
    await expect(saveSolution(task, "escape", "wrong")).rejects.toThrow("escapes")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
