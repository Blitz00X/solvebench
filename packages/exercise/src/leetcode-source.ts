import { mkdir, readFile, writeFile, chmod } from "node:fs/promises"
import { join } from "node:path"
import { Err, Ok, type Result } from "@solvebench/shared"
import { z } from "zod"
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

/** Public catalog, platform-native execution and submission through an explicit session. */
export class LeetCodeSource implements ExerciseSource {
  readonly id = "leetcode"
  readonly label = "LeetCode"
  readonly supportedTracks = LANGUAGES.map(l => l.slug)
  readonly connectionFields = ["LEETCODE_SESSION", "csrftoken"]
  private credentials: Record<string, string> = {}
  private questions = new Map<string, Question>()
  private catalog: Omit<ExerciseSummary, "trackSlug">[] | null = null
  constructor(readonly workspace: string, private fetchImpl: typeof fetch = fetch, private baseUrl = "https://leetcode.com", private pollDelay = 1000) {}
  async isConfigured(): Promise<boolean> { return true } // Public catalog needs no account.
  async connect(credentials: Record<string, string>): Promise<void> {
    if (!credentials.LEETCODE_SESSION || !credentials.csrftoken) throw new Error("LeetCode session and csrf token required")
    this.credentials = credentials
    this.catalog = null
    await mkdir(this.workspace, { recursive: true })
    const path = join(this.workspace, ".connection.json")
    await writeFile(path, JSON.stringify(credentials), { mode: 0o600 })
    await chmod(path, 0o600)
  }
  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.credentials.LEETCODE_SESSION) {
      try { this.credentials = JSON.parse(await readFile(join(this.workspace, ".connection.json"), "utf8")) } catch { /* public browsing */ }
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", referer: `${this.baseUrl}/`,
        ...(this.credentials.LEETCODE_SESSION ? { cookie: `LEETCODE_SESSION=${this.credentials.LEETCODE_SESSION}; csrftoken=${this.credentials.csrftoken}`, "x-csrftoken": this.credentials.csrftoken! } : {}),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
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
    try {
      if (this.catalog) return Ok(this.catalog.map(q => ({ ...q, trackSlug })))
      // The public catalog delivers the full set in one request. Do not walk
      // dozens of GraphQL pages on every language switch.
      try {
        const raw = await this.request("/api/problems/all/")
        const page = z.object({ stat_status_pairs: z.array(z.object({
          stat: z.object({ question__title: z.string(), question__title_slug: z.string() }),
          difficulty: z.object({ level: z.number() }), paid_only: z.boolean(), status: z.string().nullable().optional(),
        })) }).parse(raw)
        this.catalog = page.stat_status_pairs.map(q => ({ sourceId: this.id, slug: q.stat.question__title_slug, title: q.stat.question__title,
          difficulty: (["unknown", "easy", "medium", "hard"][q.difficulty.level] ?? "unknown") as ExerciseSummary["difficulty"],
          progress: q.status === "ac" ? "completed" as const : q.paid_only ? "locked" as const : "available" as const, blurb: "" }))
        return Ok(this.catalog.map(q => ({ ...q, trackSlug })))
      } catch (error) {
        // Authentication/challenge failures are not bypassed via a different route.
        if (String(error).includes("reconnect")) throw error
      }
      const rows: ExerciseSummary[] = []
      let total = Infinity
      for (let skip = 0; skip < total; skip += 100) {
        const raw = await this.request("/graphql/", { query: "query catalog($skip:Int!,$limit:Int!){problemsetQuestionList:questionList(categorySlug:\"\",skip:$skip,limit:$limit,filters:{}){total questions{title titleSlug difficulty isPaidOnly status}}}", variables: { skip, limit: 100 } })
        const parsed = z.object({ data: z.object({ problemsetQuestionList: z.object({ total: z.number(), questions: z.array(z.object({ title: z.string(), titleSlug: z.string(), difficulty: z.string(), isPaidOnly: z.boolean(), status: z.string().nullable().optional() })) }) }) }).parse(raw)
        const page = parsed.data.problemsetQuestionList
        total = page.total
        for (const q of page.questions) rows.push({ sourceId: this.id, trackSlug, slug: q.titleSlug, title: q.title,
          difficulty: q.difficulty.toLowerCase() as ExerciseSummary["difficulty"], progress: q.status === "ac" ? "completed" : q.isPaidOnly ? "locked" : "available", blurb: "" })
        if (!page.questions.length) break
      }
      this.catalog = rows.map(({ trackSlug: _track, ...q }) => q)
      return Ok(rows)
    } catch (error) { return Err({ kind: "network", detail: String(error) }) }
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
    const q = await this.question(slug)
    // Load stored credentials before checking connection state.
    if (!this.credentials.LEETCODE_SESSION) {
      try { this.credentials = JSON.parse(await readFile(join(this.workspace, ".connection.json"), "utf8")) } catch { throw new Error("Connect LeetCode to run or submit against its judge") }
    }
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
