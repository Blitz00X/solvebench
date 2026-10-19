import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ExercismSource } from "../src/exercism-source"
import { resolveExercismConfig } from "../src/config"
import type { ExercismApi } from "../src/exercism-api"

async function submitWith(
  cli: () => Promise<{ code: number; stdout: string; stderr: string }>,
  api?: Partial<ExercismApi>,
) {
  const workspace = await mkdtemp(join(tmpdir(), "submit-workbench-"))
  const dir = join(workspace, "python", "hello-world")
  await mkdir(join(dir, ".exercism"), { recursive: true })
  await writeFile(join(dir, "hello_world.py"), "def hello():\n    return 'Hello, World!'\n")
  await writeFile(join(dir, ".exercism", "metadata.json"), JSON.stringify({ id: "sol-1" }))
  try {
    const config = resolveExercismConfig({ projectRoot: workspace, token: "t", workspace, fallbackToUserConfig: false })
    const source = new ExercismSource({
      config,
      runCli: async () => cli(),
      api: {
        listTracks: async () => [],
        listExercises: async () => [],
        listCompletedSlugs: async () => new Set(),
        completeSolution: async () => ({ unlocked: [] }),
        ...api,
      },
    })
    return await source.submit("python", "hello-world")
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

test("an unchanged re-submission is reported as submitted, not rejected", async () => {
  const result = await submitWith(async () => ({ code: 1, stdout: "", stderr: "Error: No files you submitted have changed since your last submission" }))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.ok).toBe(true)
  expect(result.value.status).toBe("unchanged")
  expect(result.value.message).not.toContain("Error:")
})

test("a genuine submit failure is rejected with a clean, single message", async () => {
  const result = await submitWith(async () => ({ code: 1, stdout: "", stderr: "Error: network unreachable" }))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.ok).toBe(false)
  expect(result.value.status).toBe("rejected")
  expect(result.value.completed).toBe(false)
  expect(result.value.message).toBe("network unreachable")
})
