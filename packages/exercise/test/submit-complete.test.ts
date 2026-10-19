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
  const workspace = await mkdtemp(join(tmpdir(), "submit-complete-"))
  const dir = join(workspace, "bash", "hello-world")
  await mkdir(join(dir, ".exercism"), { recursive: true })
  await writeFile(join(dir, "hello_world.sh"), "#!/usr/bin/env bash\necho \"Hello, World!\"\n")
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
    return await source.submit("bash", "hello-world")
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

test("a successful upload is completed on the platform, so the next tasks unlock", async () => {
  const completedIds: string[] = []
  const result = await submitWith(
    async () => ({ code: 0, stdout: "Your solution has been submitted successfully.", stderr: "" }),
    { completeSolution: async (uuid) => { completedIds.push(uuid); return { unlocked: ["reverse-string"] } } },
  )
  expect(completedIds).toEqual(["sol-1"])
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.ok).toBe(true)
  expect(result.value.completed).toBe(true)
  expect(result.value.unlocked).toEqual(["reverse-string"])
  expect(result.value.message).toContain("unlocked: reverse-string")
})

test("an unchanged re-submission still completes a previously uploaded solution", async () => {
  const result = await submitWith(
    async () => ({ code: 1, stdout: "", stderr: "Error: No files you submitted have changed since your last submission" }),
    { completeSolution: async () => ({ unlocked: ["two-fer"] }) },
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.ok).toBe(true)
  expect(result.value.status).toBe("unchanged")
  expect(result.value.completed).toBe(true)
})

test("a large unlock set is summarised instead of dumping every slug", async () => {
  const result = await submitWith(
    async () => ({ code: 0, stdout: "", stderr: "" }),
    { completeSolution: async () => ({ unlocked: ["a", "b", "c", "d", "e", "f"] }) },
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.message).toContain("6 tasks unlocked")
})

test("a failed completion call keeps the upload result but flags completion as not done", async () => {
  const result = await submitWith(
    async () => ({ code: 0, stdout: "", stderr: "" }),
    { completeSolution: async () => { throw new Error("completion boom") } },
  )
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.value.ok).toBe(true)
  expect(result.value.completed).toBe(false)
  expect(result.value.message).toContain("completing the exercise failed")
})
