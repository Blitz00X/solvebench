import { writeFile, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { Err, Ok, type Result } from "@solvebench/shared"
import { z } from "zod"
import { LEETCODE_CATALOG } from "./leetcode-catalog"
import type { ExerciseSource, ExerciseSourceError } from "./source"
import type { ExerciseSummary, Problem, LocalExercise, TestReport, SubmitResult, Track } from "./types"
import { readSolution } from "./workspace"

const LANGUAGES = [
  { slug: "python3", title: "Python 3", extension: "py" },
  { slug: "java", title: "Java", extension: "java" },
  { slug: "javascript", title: "JavaScript", extension: "js" },
  { slug: "typescript", title: "TypeScript", extension: "ts" },
  { slug: "cpp", title: "C++", extension: "cpp" },
  { slug: "c", title: "C", extension: "c" },
  { slug: "golang", title: "Go", extension: "go" },
  { slug: "rust", title: "Rust", extension: "rs" },
]
const Question = z.object({ questionId: z.string(), title: z.string(), difficulty: z.string(),
  content: z.string().nullable(), exampleTestcases: z.string().nullable(),
  codeSnippets: z.array(z.object({ langSlug: z.string(), code: z.string() })).nullable() })
type Question = z.infer<typeof Question>
const QUESTION_QUERY = "query question($slug:String!){ question(titleSlug:$slug){questionId title difficulty content exampleTestcases codeSnippets{langSlug code}} }"
/**
 * The only hosts that may ever receive the session cookie. The adapter does not
 * proxy, redirect or mirror a LeetCode session anywhere else.
 */
const CREDENTIAL_HOSTS = new Set(["leetcode.com", "www.leetcode.com"])

/**
 * LeetCode adapter: a bundled public catalog, platform-native execution and
 * submission through an explicit, session-only connection.
 *
 * No catalog endpoint is called at runtime. The problem index ships with the
 * source; only the problem the user opens is fetched, one slug at a time.
 */
export class LeetCodeSource implements ExerciseSource {
  readonly id = "leetcode"
  readonly label = "LeetCode"
  readonly supportedTracks = LANGUAGES.map(l => l.slug)
  readonly connectionFields = ["LEETCODE_SESSION", "csrftoken"]
  /** Credentials live in memory only; they are never written to the workspace. */
  private credentials: Record<string, string> = {}
  private questions = new Map<string, Question>()
  private legacyRemoved = false
  constructor(readonly workspace: string, private fetchImpl: typeof fetch = fetch, private baseUrl = "https://leetcode.com", private pollDelay = 1000) {}

  async isConfigured(): Promise<boolean> {
    // Browsing the bundled catalog needs no account. Remove any credential file
    // left by alpha.3 or earlier; credentials are session-only from now on.
    if (!this.legacyRemoved) {
      this.legacyRemoved = true
      await rm(join(this.workspace, ".connection.json"), { force: true }).catch(() => undefined)
    }
    return true
  }

  async prepareEnvironment(_track: string, _directory: string, report: (message: string) => void): Promise<void> {
    report("LeetCode platform judge ready")
  }

  async connect(credentials: Record<string, string>): Promise<void> {
    if (!credentials.LEETCODE_SESSION || !credentials.csrftoken) throw new Error("LeetCode session and csrf token required")
    this.credentials = { LEETCODE_SESSION: credentials.LEETCODE_SESSION, csrftoken: credentials.csrftoken }
    this.questions.clear()
    this.legacyRemoved = true
    // Alpha.3 stored cookies on disk. Remove that file instead of migrating it.
    await rm(join(this.workspace, ".connection.json"), { force: true }).catch(() => undefined)
  }

  /** Explicit wipe path: forget the session and delete any legacy credential file. */
  async disconnect(): Promise<void> {
    this.credentials = {}
    this.questions.clear()
    this.legacyRemoved = true
    await rm(join(this.workspace, ".connection.json"), { force: true }).catch(() => undefined)
  }

  private async request(path: string, body?: unknown): Promise<unknown> {
    const url = new URL(path, this.baseUrl)
    if (url.protocol !== "https:") throw new Error("LeetCode requests must use HTTPS")
    const headers: Record<string, string> = { "content-type": "application/json", referer: `${this.baseUrl}/` }
    // Hard boundary: the cookie is attached only to the official HTTPS host,
    // never to a configured mirror, a test host or a redirect target.
    if (this.credentials.LEETCODE_SESSION && CREDENTIAL_HOSTS.has(url.hostname)) {
      headers.cookie = `LEETCODE_SESSION=${this.credentials.LEETCODE_SESSION}; csrftoken=${this.credentials.csrftoken}`
      headers["x-csrftoken"] = this.credentials.csrftoken!
    }
    const response = await this.fetchImpl(url, {
      method: body === undefined ? "GET" : "POST",
      headers,
      redirect: "error",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "LeetCode connection expired — reconnect your account" : `LeetCode HTTP ${response.status}`)
    const data = await response.json() as { errors?: { message: string }[] }
    if (data.errors?.length) throw new Error(data.errors[0]!.message)
    return data
  }

  async listTracks(): Promise<Result<Track[], ExerciseSourceError>> {
    return Ok(LANGUAGES.map(l => ({ sourceId: this.id, slug: l.slug, title: l.title, language: l.slug })))
  }

  async listExercises(trackSlug: string): Promise<Result<ExerciseSummary[], ExerciseSourceError>> {
    // The bundled snapshot is the catalog. No /api/problems/all/ and no paged
    // GraphQL catalog walk: both were bulk reads of the Service.
    return Ok(LEETCODE_CATALOG.map(q => ({
      sourceId: this.id, trackSlug, slug: q.slug, title: q.title,
      difficulty: q.difficulty as ExerciseSummary["difficulty"],
      progress: q.paidOnly ? "locked" as const : "available" as const, blurb: "",
    })))
  }

  private async question(slug: string): Promise<Question> {
    const cached = this.questions.get(slug)
    if (cached) return cached
    const raw = await this.request("/graphql/", { query: QUESTION_QUERY, variables: { slug } })
    const q = z.object({ data: z.object({ question: Question }) }).parse(raw).data.question
    this.questions.set(slug, q)
    return q
  }

  private file(track: string): string {
    const language = LANGUAGES.find(l => l.slug === track)
    if (!language) throw new Error(`Unsupported LeetCode language: ${track}`)
    return `solution.${language.extension}`
  }

  async getProblem(track: string, slug: string): Promise<Result<Problem, ExerciseSourceError>> {
    try {
      const q = await this.question(slug)
      return Ok({ sourceId: this.id, trackSlug: track, slug, title: q.title, difficulty: q.difficulty.toLowerCase() as Problem["difficulty"],
        body: htmlToText(q.content ?? ""), solutionFiles: [this.file(track)], testFiles: ["cases.txt"], url: `${this.baseUrl}/problems/${slug}/` })
    } catch (error) { return Err({ kind: "failed", detail: String(error) }) }
  }

  async isDownloaded(track: string, slug: string): Promise<boolean> { return Bun.file(join(this.workspace, track, slug, this.file(track))).exists() }

  async download(track: string, slug: string): Promise<Result<LocalExercise, ExerciseSourceError>> {
    try {
      const q = await this.question(slug)
      const directory = join(this.workspace, track, slug)
      await mkdir(directory, { recursive: true })
      const file = this.file(track)
      if (!await this.isDownloaded(track, slug)) {
        const snippet = q.codeSnippets?.find(s => s.langSlug === track)
        if (!snippet) throw new Error(`No starter code for ${track}`)
        await writeFile(join(directory, file), snippet.code)
        await writeFile(join(directory, "cases.txt"), q.exampleTestcases ?? "")
      }
      return Ok({ sourceId: this.id, trackSlug: track, slug, directory, files: [{ path: file, content: await readSolution(directory, file) }, { path: "cases.txt", content: await readSolution(directory, "cases.txt") }] })
    } catch (error) { return Err({ kind: "failed", detail: String(error) }) }
  }

  private async judge(track: string, slug: string, submit: boolean): Promise<Record<string, unknown>> {
    if (!this.credentials.LEETCODE_SESSION) throw new Error("Connect LeetCode to run or submit against its judge")
    const q = await this.question(slug)
    const directory = join(this.workspace, track, slug)
    const body = { lang: track, question_id: q.questionId, typed_code: await readSolution(directory, this.file(track)),
      ...(submit ? {} : { data_input: await readSolution(directory, "cases.txt") }) }
    const start = z.object({ submission_id: z.union([z.string(), z.number()]).optional(), interpret_id: z.union([z.string(), z.number()]).optional() }).parse(await this.request(`/problems/${slug}/${submit ? "submit" : "interpret_solution"}/`, body))
    const id = start.submission_id ?? start.interpret_id
    if (id === undefined) throw new Error("LeetCode did not return an execution ID")
    for (let tries = 0; tries < 90; tries++) {
      await new Promise(resolve => setTimeout(resolve, this.pollDelay))
      const result = z.record(z.string(), z.unknown()).parse(await this.request(`/submissions/detail/${id}/check/`))
      if (result.state === "SUCCESS") return result
    }
    throw new Error("LeetCode evaluation timed out; check your submission on the platform")
  }

  async runTests(track: string, slug: string): Promise<Result<TestReport, ExerciseSourceError>> {
    try {
      const started = Date.now(), result = await this.judge(track, slug, false)
      const total = Number(result.total_testcases ?? result.total_correct ?? 0)
      const passed = Number(result.total_correct ?? 0), failed = Math.max(0, total - passed)
      const error = result.compile_error ?? result.runtime_error
      return Ok({ trackSlug: track, slug, passed, failed: error ? Math.max(1, failed) : failed, total: error ? Math.max(1, total) : total,
        cases: error ? [{ name: "platform judge", outcome: "error", message: String(error) }] : [],
        raw: JSON.stringify(result, null, 2), command: "LeetCode Run (example/custom cases)", durationMs: Date.now() - started, exitCode: error || failed ? 1 : 0 })
    } catch (error) { return Err({ kind: "failed", detail: String(error) }) }
  }

  async submit(track: string, slug: string): Promise<Result<SubmitResult, ExerciseSourceError>> {
    try {
      const result = await this.judge(track, slug, true)
      const accepted = result.status_code === 10
      return Ok({ ok: accepted, status: accepted ? "accepted" : "rejected", message: String(result.status_msg ?? "Evaluated"), raw: JSON.stringify(result, null, 2), url: `${this.baseUrl}/problems/${slug}/submissions/` })
    } catch (error) { return Err({ kind: "failed", detail: String(error) }) }
  }
}

export function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|pre|li|h\d)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim()
}
