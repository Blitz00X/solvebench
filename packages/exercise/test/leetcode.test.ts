import { test, expect } from "bun:test"
import { access, mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LeetCodeSource } from "../src/leetcode-source"

const QUESTION = { data: { question: { questionId: "1", title: "Two Sum", difficulty: "Easy", content: "<p>Return two indexes.</p><pre>[2,7], target 9</pre>", exampleTestcases: "[2,7]\n9", codeSnippets: [{ langSlug: "python3", code: "class Solution:\n    def twoSum(self, nums, target):\n        pass" }] } } }

test("LeetCode uses its bundled catalog, keeps the session in memory and sends it only to leetcode.com", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-")), calls: { url: string; body: Record<string, unknown>; headers: Headers; redirect?: RequestRedirect }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ url, body, headers: new Headers(init?.headers), redirect: init?.redirect })
    if (url.endsWith("/graphql/")) return Response.json(QUESTION)
    if (url.includes("interpret_solution")) return Response.json({ interpret_id: "run-1" })
    if (url.endsWith("/submit/")) return Response.json({ submission_id: 2 })
    if (url.includes("run-1")) return Response.json({ state: "SUCCESS", total_testcases: 1, total_correct: 1, status_code: 10 })
    if (url.includes("/submissions/detail/2/check")) return Response.json({ state: "SUCCESS", total_testcases: 50, total_correct: 50, status_code: 10, status_msg: "Accepted" })
    throw new Error(`Unexpected LeetCode request: ${url}`)
  }) as typeof fetch
  try {
    const source = new LeetCodeSource(workspace, fetchImpl)
    expect((await source.listTracks()).ok).toBe(true)

    // The catalog is local: listing never touches the network.
    const catalog = await source.listExercises("python3")
    expect(catalog.ok).toBe(true)
    if (!catalog.ok) throw new Error(catalog.error.detail)
    expect(catalog.value.length).toBeGreaterThan(4000)
    expect(catalog.value.find(q => q.slug === "two-sum")?.title).toBe("Two Sum")
    expect(catalog.value.some(q => q.progress === "locked")).toBe(true)
    expect(calls.length).toBe(0)

    const downloaded = await source.download("python3", "two-sum")
    if (!downloaded.ok) throw new Error(downloaded.error.detail)
    expect(downloaded.value.files[0]?.content).toContain("class Solution")
    expect(calls.length).toBe(1)
    expect(calls[0]?.url.startsWith("https://leetcode.com/graphql/")).toBe(true)
    expect(calls[0]?.headers.has("cookie")).toBe(false)
    expect(calls[0]?.redirect).toBe("error")

    const problem = await source.getProblem("python3", "two-sum")
    expect(problem.ok && problem.value.body).toContain("Return two indexes")

    const directory = downloaded.value.directory
    await writeFile(join(directory, "solution.py"), "class Solution:\n    def twoSum(self, nums, target):\n        return [0,1]")

    await source.connect({ LEETCODE_SESSION: "session-test-only", csrftoken: "csrf-test-only" })
    // Credentials are session-only: no file may exist on disk.
    await expect(access(join(workspace, ".connection.json"))).rejects.toThrow()
    expect(JSON.stringify(await readFile(join(directory, "solution.py"), "utf8"))).not.toContain("session-test-only")

    const run = await source.runTests("python3", "two-sum")
    expect(run.ok && run.value.passed).toBe(1)
    const result = await source.submit("python3", "two-sum")
    expect(result.ok && result.value.status).toBe("accepted")

    const posted = calls.find(c => c.url.endsWith("/submit/"))!
    expect(posted.body.typed_code).toContain("return [0,1]")
    expect(posted.headers.get("x-csrftoken")).toBe("csrf-test-only")
    expect(posted.headers.get("cookie")).toContain("LEETCODE_SESSION=session-test-only")
    expect(JSON.stringify(posted.body)).not.toContain("session-test-only")
    expect(calls.filter(c => c.headers.has("cookie")).every(c => c.url.startsWith("https://leetcode.com/"))).toBe(true)

    // Downloading again does not overwrite the learner's solution.
    await source.download("python3", "two-sum")
    expect(await readFile(join(directory, "solution.py"), "utf8")).toContain("return [0,1]")

    await source.disconnect()
    const afterDisconnect = await source.runTests("python3", "two-sum")
    expect(afterDisconnect.ok).toBe(false)
    if (!afterDisconnect.ok) expect(afterDisconnect.error.detail).toContain("Connect LeetCode")
  } finally { await rm(workspace, { recursive: true, force: true }) }
})

test("a non-LeetCode host never receives the session cookie", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-host-")), calls: Headers[] = []
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Headers(init?.headers))
    return Response.json(QUESTION)
  }) as typeof fetch
  try {
    const source = new LeetCodeSource(workspace, fetchImpl, "https://leetcode.test", 0)
    await source.connect({ LEETCODE_SESSION: "session-test-only", csrftoken: "csrf-test-only" })
    const problem = await source.getProblem("python3", "two-sum")
    expect(problem.ok).toBe(true)
    expect(calls.length).toBe(1)
    expect(calls[0]?.has("cookie")).toBe(false)
    expect(calls[0]?.has("x-csrftoken")).toBe(false)
  } finally { await rm(workspace, { recursive: true, force: true }) }
})

test("a credential file left by alpha.3 is removed on startup", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-legacy-"))
  try {
    await writeFile(join(workspace, ".connection.json"), JSON.stringify({ LEETCODE_SESSION: "legacy", csrftoken: "legacy" }), { mode: 0o600 })
    const source = new LeetCodeSource(workspace, (async () => Response.json(QUESTION)) as unknown as typeof fetch)
    await source.isConfigured()
    await expect(access(join(workspace, ".connection.json"))).rejects.toThrow()
  } finally { await rm(workspace, { recursive: true, force: true }) }
})

test("LeetCode authentication errors are shown as connection failures, not accepted results", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "leetcode-errors-"))
  try {
    const source = new LeetCodeSource(workspace, (async () => new Response("expired", { status: 403 })) as unknown as typeof fetch)
    await source.connect({ LEETCODE_SESSION: "session-test-only", csrftoken: "csrf-test-only" })
    const result = await source.getProblem("python3", "two-sum")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.detail).toContain("reconnect")
  } finally { await rm(workspace, { recursive: true, force: true }) }
})
