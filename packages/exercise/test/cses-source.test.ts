import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CsesSource, htmlToMarkdown, parseCsesCatalog, parseCsesProblem } from "../src/cses-source"

const catalogHtml = `
<h2>Introductory Problems</h2>
<ul class="task-list">
  <li class="task"><a href="/problemset/task/1068">Weird Algorithm</a><span class="detail">1 / 2</span></li>
  <li class="task"><a href="/problemset/task/1083">Missing Number</a></li>
</ul>
<h2>Sorting and Searching</h2>
<ul class="task-list">
  <li class="task"><a href="/problemset/task/1621">Distinct Numbers</a></li>
</ul>`

const problemHtml = `
<html><body>
<h1>Weird Algorithm</h1>
<div class="md">
<p>Consider an algorithm that takes an integer <span class="math math-inline">n</span>.</p>
<h1 id="input">Input</h1>
<p>The only input line contains an integer <span class="math math-inline">n</span>.</p>
<h1 id="example">Example</h1>
<p>Input:</p>
<pre>3
</pre>
<p>Output:</p>
<pre>3 10 5 16 8 4 2 1
</pre>
</div>
</div>
</body></html>`

const twoExampleHtml = `
<div class="md">
<p>Input:</p><pre>1
</pre><p>Output:</p><pre>1
</pre>
<p>Input:</p><pre>2
</pre><p>Output:</p><pre>2 1
</pre>
</div>`

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function mockFetch(routes: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const path = new URL(url).pathname
    const body = routes[path]
    if (body === undefined) return new Response("not found", { status: 404 })
    return new Response(body, { status: 200 })
  }) as unknown as typeof fetch
}

describe("CSES parsing", () => {
  test("the catalog groups tasks by category without duplicates", () => {
    const tasks = parseCsesCatalog(catalogHtml)
    expect(tasks).toHaveLength(3)
    expect(tasks[0]).toEqual({ id: "1068", title: "Weird Algorithm", category: "Introductory Problems" })
    expect(tasks[2]!.category).toBe("Sorting and Searching")
  })

  test("the problem page yields title, Markdown and one sample", () => {
    const problem = parseCsesProblem(problemHtml)
    expect(problem.title).toBe("Weird Algorithm")
    expect(problem.cases).toEqual([{ name: "sample 1", input: "3\n", expected: "3 10 5 16 8 4 2 1" }])
    expect(problem.body).toContain("## Example")
    expect(problem.body).toContain("```")
    expect(problem.body).toContain("3 10 5 16 8 4 2 1")
  })

  test("multiple Input/Output pairs become separate cases", () => {
    expect(parseCsesProblem(`<h1>Two</h1>${twoExampleHtml}`).cases).toHaveLength(2)
  })

  test("HTML conversion keeps headings and code blocks", () => {
    const body = htmlToMarkdown("<h1>Input</h1><p>Read <b>n</b>.</p><pre>1 2\n3 4</pre>")
    expect(body).toContain("## Input")
    expect(body).toContain("Read **n**.")
    expect(body).toContain("1 2\n3 4")
  })
})

describe("CsesSource", () => {
  test("lists language tracks and the public catalog", async () => {
    const source = new CsesSource({
      workspace: "/tmp/cses-test-workspace",
      fetchImpl: mockFetch({ "/problemset/list/": catalogHtml }),
    })
    const tracks = await source.listTracks()
    expect(tracks.ok).toBe(true)
    if (!tracks.ok) return
    expect(tracks.value.map((track) => track.slug)).toContain("python")
    expect(tracks.value).toHaveLength(9)

    const exercises = await source.listExercises("python")
    expect(exercises.ok).toBe(true)
    if (!exercises.ok) return
    expect(exercises.value.map((item) => item.slug)).toEqual(["1068", "1083", "1621"])
    expect(exercises.value[0]!.progress).toBe("available")
    expect(exercises.value[0]!.blurb).toBe("Introductory Problems")
  })

  test("downloads the statement, starter and sample cases, then runs them", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "solvebench-cses-"))
    directories.push(workspace)
    const source = new CsesSource({
      workspace,
      fetchImpl: mockFetch({
        "/problemset/list/": catalogHtml,
        "/problemset/task/1068": problemHtml,
      }),
    })

    const downloaded = await source.download("python", "1068")
    expect(downloaded.ok).toBe(true)
    if (!downloaded.ok) return
    expect(await source.isDownloaded("python", "1068")).toBe(true)
    const directory = join(workspace, "python", "1068")
    expect(await readFile(join(directory, "cases.json"), "utf8")).toContain("3 10 5 16 8 4 2 1")
    expect(await readFile(join(directory, "README.md"), "utf8")).toContain("# Weird Algorithm")

    // Replace the starter with a solution that accepts the sample input.
    await writeFile(join(directory, "solution.py"), "import sys\nn = int(sys.stdin.read())\nvalues = [n]\nwhile n != 1:\n    n = n // 2 if n % 2 == 0 else n * 3 + 1\n    values.append(n)\nprint(' '.join(map(str, values)))\n")
    const report = await source.runTests("python", "1068")
    expect(report.ok).toBe(true)
    if (!report.ok) return
    expect(report.value.passed).toBe(1)
    expect(report.value.failed).toBe(0)
    expect(report.value.exitCode).toBe(0)
  }, 20_000)

  test("an unknown track is unsupported, not a crash", async () => {
    const source = new CsesSource({ workspace: "/tmp/cses-test-workspace", fetchImpl: mockFetch({}) })
    const result = await source.listExercises("brainfuck")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe("unsupported")
  })
})
