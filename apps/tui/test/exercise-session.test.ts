import { test, expect } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fixture } from "./workbench-fixture"
import { bootstrapApp } from "../src/bootstrap"
import { HttpModelProvider, HttpProviderConfig } from "@solvebench/agent-runtime"

test("browser selection never retargets tests or submission, and the tested code is the saved buffer", async () => {
  const h = await fixture()
  try {
    await h.exercise.init(); await h.exercise.open("answer")
    h.exercise.select("other")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.runTests()
    expect(h.tested[0]).toBe("answer:def answer():\n    return 7\n")
    expect(h.exercise.getState().lastReport?.passed).toBe(1)
    await h.exercise.submit()
    expect(h.sent[0]).toBe(h.tested[0]!)
  } finally { await h.cleanup() }
})

test("switching tasks preserves edits; clearing a solution saves a genuinely empty file", async () => {
  const h = await fixture()
  try {
    await h.exercise.init(); await h.exercise.open("answer")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.open("other")
    expect(await readFile(join(h.workspace, "python/answer/solution.py"), "utf8")).toContain("return 7")
    h.exercise.setBuffer("")
    expect(h.exercise.getState().activeFile).toBe("solution.py")
    await h.exercise.save()
    expect(await readFile(join(h.workspace, "python/other/solution.py"), "utf8")).toBe("")
  } finally { await h.cleanup() }
})

test("a green run is invalidated by a later edit and cannot authorize stale submission", async () => {
  const h = await fixture()
  try {
    await h.exercise.init(); await h.exercise.open("answer")
    h.exercise.setBuffer("def answer():\n    return 7\n")
    await h.exercise.runTests()
    const testedRevision = h.exercise.getState().reportRevision
    h.exercise.setBuffer("def answer():\n    return 9\n")
    expect(h.exercise.getState().revision).not.toBe(testedRevision)
    await h.exercise.submit()
    expect(h.sent).toHaveLength(0)
    expect(h.exercise.getState().error).toContain("current solution")
  } finally { await h.cleanup() }
})

test("production bootstrap sends full problem, tests, solution and actual failure output to HTTP", async () => {
  const h = await fixture()
  const requests: { messages: { role: string; content: string }[] }[] = []
  const server = Bun.serve({ port: 0, async fetch(request) {
    requests.push(await request.json() as typeof requests[number])
    return Response.json({ choices: [{ message: { content: "The test expects seven; your code returns one." } }] })
  } })
  try {
    const provider = new HttpModelProvider(HttpProviderConfig.parse({ baseUrl: `http://localhost:${server.port}/v1`, model: "test" }), undefined, { SOLVEBENCH_API_KEY: "test-only" })
    const app = await bootstrapApp({ repoRoot: h.workspace, dbPath: join(h.workspace, "state.db"), exerciseSource: h.source, modelProvider: provider, prepareEnvironment: false })
    await app.exercise.init(); await app.exercise.open("answer"); await app.exercise.runTests()
    expect(app.exercise.getState().lastReport?.failed).toBe(1)
    await app.controller.ask("yardım et")
    const context = requests[0]!.messages.find(m => m.content.startsWith("Repository context"))!.content
    for (const artifact of ["FINAL INSTRUCTION", "return 1", "assert answer() == 7", "FAILED", "solutionRevision", "lastRun"]) expect(context).toContain(artifact)
    expect(requests[0]!.messages.at(-1)?.content).toBe("yardım et")
    expect(JSON.stringify(requests)).not.toContain("test-only")
    app.exercise.setBuffer("def answer():\n    return 7\n")
    await app.controller.ask("şimdi?")
    expect(requests[1]!.messages.find(m => m.content.startsWith("Repository context"))!.content).toContain('"stale":true')
  } finally { server.stop(true); await h.cleanup() }
})
