import { test, expect } from "bun:test"
import { mkdtemp, rm, stat, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LeetCodeSource } from "../src/leetcode-source"

test("LeetCode public data, starter files, authenticated run and platform-accepted submission use the shared source contract", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-")), calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body, headers: new Headers(init?.headers) })
    if (url.endsWith("/api/problems/all/")) return Response.json({ stat_status_pairs: [{ stat: { question__title: "Two Sum", question__title_slug: "two-sum" }, difficulty: { level: 1 }, paid_only: false, status: null }] })
    if (url.endsWith("/graphql/")) {
      if (String(body.query).includes("catalog")) return Response.json({ data: { problemsetQuestionList: { total: 1, questions: [{ title: "Two Sum", titleSlug: "two-sum", difficulty: "Easy", isPaidOnly: false }] } } })
      return Response.json({ data: { question: { questionId: "1", title: "Two Sum", difficulty: "Easy", content: "<p>Return two indexes.</p><pre>[2,7], target 9</pre>", exampleTestcases: "[2,7]\n9", codeSnippets: [{ langSlug: "python3", code: "class Solution:\n    def twoSum(self, nums, target):\n        pass" }] } } })
    }
    if (url.includes("interpret_solution")) return Response.json({ interpret_id: "run-1" })
    if (url.endsWith("/submit/")) return Response.json({ submission_id: 2 })
    if (url.includes("run-1")) return Response.json({ state: "SUCCESS", total_testcases: 1, total_correct: 1, status_code: 10 })
    return Response.json({ state: "SUCCESS", total_testcases: 50, total_correct: 50, status_code: 10, status_msg: "Accepted" })
  }) as typeof fetch
  try {
    const source = new LeetCodeSource(workspace, fetchImpl, "https://leetcode.test", 0)
    expect((await source.listTracks()).ok).toBe(true)
    const catalog = await source.listExercises("python3")
    expect(catalog.ok && catalog.value[0]?.title).toBe("Two Sum")
    expect(calls[0]?.headers.has("cookie")).toBe(false)
    const downloaded = await source.download("python3", "two-sum")
    if (!downloaded.ok) throw new Error(downloaded.error.detail)
    expect(downloaded.value.files[0]?.content).toContain("class Solution")
    const problem = await source.getProblem("python3", "two-sum")
    expect(problem.ok && problem.value.body).toContain("Return two indexes")
    const directory = downloaded.value.directory
    await writeFile(join(directory, "solution.py"), "class Solution:\n    def twoSum(self, nums, target):\n        return [0,1]")
    await source.connect({ LEETCODE_SESSION: "session-test-only", csrftoken: "csrf-test-only" })
    expect((await stat(join(workspace, ".connection.json"))).mode & 0o777).toBe(0o600)
    const run = await source.runTests("python3", "two-sum")
    expect(run.ok && run.value.passed).toBe(1)
    const result = await source.submit("python3", "two-sum")
    expect(result.ok && result.value.status).toBe("accepted")
    const posted = calls.find(c => c.url.endsWith("/submit/"))!
    expect(posted.body.typed_code).toContain("return [0,1]")
    expect(posted.headers.get("x-csrftoken")).toBe("csrf-test-only")
    expect(JSON.stringify(posted.body)).not.toContain("session-test-only")
    // Downloading again does not overwrite the learner's solution.
    await source.download("python3", "two-sum")
    expect(await readFile(join(directory, "solution.py"), "utf8")).toContain("return [0,1]")
  } finally { await rm(workspace, { recursive: true, force: true }) }
})

test("LeetCode authentication errors are shown as connection failures, not accepted results", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-errors-"))
  try {
    const source = new LeetCodeSource(workspace, (async () => new Response("expired", { status: 403 })) as unknown as typeof fetch, "https://leetcode.test", 0)
    const result = await source.listExercises("java")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.detail).toContain("reconnect")
  } finally { await rm(workspace, { recursive: true, force: true }) }
})
