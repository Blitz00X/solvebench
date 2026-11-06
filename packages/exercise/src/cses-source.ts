import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Err, Ok, type Result } from "@solvebench/shared"
import { z } from "zod"
import { sourceError, type ExerciseSource, type ExerciseSourceError } from "./source"
import { runStdinCases, type StdinCase } from "./stdin-runner"
import type { ExerciseSummary, LocalExercise, Problem, TestReport, Track } from "./types"

/**
 * CSES Problem Set source. The catalog and statements are public; submission
 * needs an account, so the source is deliberately local-only: it imports the
 * statement and sample cases, runs them with the language toolchain, and never
 * claims a platform verdict.
 */
const TRACKS = [
  { slug: "python", title: "Python", extension: "py", command: ["python3", "solution.py"] },
  { slug: "cpp", title: "C++", extension: "cpp", command: ["./solution"], build: ["c++", "-O2", "-std=c++17", "solution.cpp", "-o", "solution"] },
  { slug: "c", title: "C", extension: "c", command: ["./solution"], build: ["cc", "-O2", "-std=c11", "solution.c", "-o", "solution"] },
  { slug: "rust", title: "Rust", extension: "rs", command: ["./solution"], build: ["rustc", "-O", "solution.rs", "-o", "solution"] },
  { slug: "go", title: "Go", extension: "go", command: ["./solution"], build: ["go", "build", "-o", "solution", "solution.go"] },
  { slug: "java", title: "Java", extension: "java", command: ["java", "Solution.java"] },
  { slug: "javascript", title: "JavaScript", extension: "js", command: ["node", "solution.js"] },
  { slug: "typescript", title: "TypeScript", extension: "ts", command: ["bun", "solution.ts"] },
  { slug: "bash", title: "Bash", extension: "sh", command: ["bash", "solution.sh"] },
] as const

type CsesTrack = (typeof TRACKS)[number]

export const CSES_CASE_FILE = "cases.json"
export const CsesCaseFile = z.object({
  cases: z.array(z.object({
    name: z.string().default("sample"),
    input: z.string(),
    expected: z.string(),
  })).min(1),
})
export type CsesCaseFile = z.infer<typeof CsesCaseFile>

export interface CsesTask {
  id: string
  title: string
  category: string
}

export interface CsesProblem {
  title: string
  body: string
  cases: StdinCase[]
}

export interface CsesSourceOptions {
  workspace: string
  fetchImpl?: typeof fetch
  baseUrl?: string
}

export class CsesSource implements ExerciseSource {
  readonly id = "cses"
  readonly label = "CSES"
  readonly supportedTracks = TRACKS.map((track) => track.slug)
  private catalog: CsesTask[] | null = null
  private problems = new Map<string, CsesProblem>()
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string

  constructor(options: CsesSourceOptions | string) {
    const resolved = typeof options === "string" ? { workspace: options } : options
    this.workspace = resolved.workspace
    this.fetchImpl = resolved.fetchImpl ?? fetch
    this.baseUrl = (resolved.baseUrl ?? "https://cses.fi").replace(/\/$/, "")
  }

  private readonly workspace: string

  async isConfigured(): Promise<boolean> {
    return true
  }

  async prepareEnvironment(_trackSlug: string, _directory: string, report: (message: string) => void): Promise<void> {
    report("CSES sample runner ready")
  }

  async listTracks(): Promise<Result<Track[], ExerciseSourceError>> {
    return Ok(TRACKS.map((track) => ({
      sourceId: this.id,
      slug: track.slug,
      title: track.title,
      language: track.slug,
    })))
  }

  async listExercises(trackSlug: string): Promise<Result<ExerciseSummary[], ExerciseSourceError>> {
    if (!this.track(trackSlug)) return Err(sourceError("unsupported", `unknown CSES track: ${trackSlug}`))
    try {
      const tasks = await this.loadCatalog()
      return Ok(tasks.map((task) => ({
        sourceId: this.id,
        trackSlug,
        slug: task.id,
        title: task.title,
        difficulty: "unknown" as const,
        progress: this.isDownloadedSync(trackSlug, task.id) ? "started" as const : "available" as const,
        blurb: task.category,
      })))
    } catch (error) {
      return Err(sourceError("network", message(error)))
    }
  }

  async getProblem(trackSlug: string, slug: string): Promise<Result<Problem, ExerciseSourceError>> {
    if (!this.track(trackSlug)) return Err(sourceError("unsupported", `unknown CSES track: ${trackSlug}`))
    try {
      const problem = await this.loadProblem(slug)
      return Ok({
        sourceId: this.id,
        trackSlug,
        slug,
        title: problem.title,
        difficulty: "unknown",
        body: problem.body,
        solutionFiles: [this.fileName(trackSlug)],
        testFiles: [CSES_CASE_FILE],
        url: `${this.baseUrl}/problemset/task/${slug}`,
      })
    } catch (error) {
      return Err(sourceError("network", message(error)))
    }
  }

  async download(trackSlug: string, slug: string): Promise<Result<LocalExercise, ExerciseSourceError>> {
    const track = this.track(trackSlug)
    if (!track) return Err(sourceError("unsupported", `unknown CSES track: ${trackSlug}`))
    try {
      const problem = await this.loadProblem(slug)
      const directory = join(this.workspace, trackSlug, slug)
      await mkdir(directory, { recursive: true })
      const solution = join(directory, `solution.${track.extension}`)
      if (!existsSync(solution)) await writeFile(solution, starter(track, problem.title))
      const caseFile = join(directory, CSES_CASE_FILE)
      if (!existsSync(caseFile)) {
        await writeFile(caseFile, JSON.stringify({ cases: problem.cases }, null, 2))
      }
      const readme = join(directory, "README.md")
      if (!existsSync(readme)) await writeFile(readme, `# ${problem.title}\n\n${problem.body}\n`)
      return Ok({
        sourceId: this.id,
        trackSlug,
        slug,
        directory,
        files: [
          { path: `solution.${track.extension}`, content: await readFile(solution, "utf8") },
          { path: CSES_CASE_FILE, content: await readFile(caseFile, "utf8") },
        ],
      })
    } catch (error) {
      return Err(sourceError("failed", message(error)))
    }
  }

  async isDownloaded(trackSlug: string, slug: string): Promise<boolean> {
    return this.isDownloadedSync(trackSlug, slug)
  }

  async runTests(trackSlug: string, slug: string): Promise<Result<TestReport, ExerciseSourceError>> {
    const track = this.track(trackSlug)
    if (!track) return Err(sourceError("unsupported", `unknown CSES track: ${trackSlug}`))
    const directory = join(this.workspace, trackSlug, slug)
    if (!existsSync(directory)) return Err(sourceError("not-found", `exercise not downloaded: ${trackSlug}/${slug}`))
    let cases: CsesCaseFile
    try {
      cases = CsesCaseFile.parse(JSON.parse(await readFile(join(directory, CSES_CASE_FILE), "utf8")))
    } catch (error) {
      return Err(sourceError("failed", `${CSES_CASE_FILE} is missing or invalid: ${message(error)}`))
    }
    try {
      const build = "build" in track ? track.build : undefined
      const report = await runStdinCases({
        trackSlug,
        slug,
        directory,
        command: [...track.command],
        ...(build ? { build: [...build] } : {}),
        cases: cases.cases,
      })
      return Ok(report)
    } catch (error) {
      return Err(sourceError("failed", message(error)))
    }
  }

  private track(trackSlug: string): CsesTrack | undefined {
    return TRACKS.find((track) => track.slug === trackSlug)
  }

  private fileName(trackSlug: string): string {
    return `solution.${this.track(trackSlug)!.extension}`
  }

  private isDownloadedSync(trackSlug: string, slug: string): boolean {
    return existsSync(join(this.workspace, trackSlug, slug, this.fileName(trackSlug)))
  }

  private async loadCatalog(): Promise<CsesTask[]> {
    if (this.catalog) return this.catalog
    const html = await this.fetchText("/problemset/list/")
    this.catalog = parseCsesCatalog(html)
    if (this.catalog.length === 0) throw new Error("CSES catalog returned no tasks")
    return this.catalog
  }

  private async loadProblem(slug: string): Promise<CsesProblem> {
    const cached = this.problems.get(slug)
    if (cached) return cached
    if (!/^\d+$/.test(slug)) throw new Error(`invalid CSES task id: ${slug}`)
    const html = await this.fetchText(`/problemset/task/${slug}`)
    const problem = parseCsesProblem(html)
    this.problems.set(slug, problem)
    return problem
  }

  private async fetchText(path: string): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: {
        "user-agent": "SolveBench/0.1 (+https://github.com/Blitz00X/solvebench)",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`CSES HTTP ${response.status} for ${path}`)
    return response.text()
  }
}

/** Parses the public problem-list page into tasks grouped by category. */
export function parseCsesCatalog(html: string): CsesTask[] {
  const tasks: CsesTask[] = []
  const seen = new Set<string>()
  const sections = /<h2[^>]*>([\s\S]*?)<\/h2>\s*<ul class="task-list">([\s\S]*?)<\/ul>/gi
  for (const section of html.matchAll(sections)) {
    const category = text(section[1] ?? "")
    for (const item of (section[2] ?? "").matchAll(/<a href="\/problemset\/task\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const id = item[1]!
      if (seen.has(id)) continue
      seen.add(id)
      tasks.push({ id, title: text(item[2] ?? ""), category })
    }
  }
  return tasks
}

/** Parses one task page: title, Markdown statement and its sample cases. */
export function parseCsesProblem(html: string): CsesProblem {
  const title = text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1] ?? "CSES problem")
  const statement = (html.match(/<div class="md">([\s\S]*?)<\/div>/i) ?? [])[1] ?? ""
  if (!statement.trim()) throw new Error("CSES statement is missing")
  return {
    title,
    body: htmlToMarkdown(statement),
    cases: parseCsesCases(statement),
  }
}

/** Extracts every Input/Output pair from the statement HTML. */
export function parseCsesCases(statementHtml: string): StdinCase[] {
  const cases: StdinCase[] = []
  const pattern = /<p>\s*(?:<strong>)?\s*Input:?\s*(?:<\/strong>)?\s*<\/p>\s*<pre>([\s\S]*?)<\/pre>\s*<p>\s*(?:<strong>)?\s*Output:?\s*(?:<\/strong>)?\s*<\/p>\s*<pre>([\s\S]*?)<\/pre>/gi
  for (const match of statementHtml.matchAll(pattern)) {
    cases.push({
      name: `sample ${cases.length + 1}`,
      input: `${plain(match[1] ?? "").trim()}\n`,
      expected: plain(match[2] ?? "").trim(),
    })
  }
  return cases
}

/** Small, dependency-free HTML to Markdown conversion for CSES statements. */
export function htmlToMarkdown(html: string): string {
  let value = html
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, code: string) => `\n\n\`\`\`\n${plain(code).trim()}\n\`\`\`\n\n`)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_match, heading: string) => `\n\n## ${text(heading)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_match, heading: string) => `\n\n### ${text(heading)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_match, heading: string) => `\n\n#### ${text(heading)}\n\n`)
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/(?:ul|ol)>/gi, "\n")
    .replace(/<(?:ul|ol)[^>]*>/gi, "\n")
    .replace(/<(?:b|strong)[^>]*>/gi, "**")
    .replace(/<\/(?:b|strong)>/gi, "**")
    .replace(/<(?:i|em)[^>]*>/gi, "*")
    .replace(/<\/(?:i|em)>/gi, "*")
    .replace(/<code[^>]*>/gi, "`")
    .replace(/<\/code>/gi, "`")
    .replace(/<[^>]+>/g, "")
  value = decode(value)
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function text(value: string): string {
  return decode(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()
}

/** Like text(), but keeps line breaks and indentation for code blocks. */
function plain(value: string): string {
  return decode(value.replace(/<[^>]+>/g, ""))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function starter(track: CsesTrack, title: string): string {
  const header = `CSES: ${title}`
  switch (track.slug) {
    case "python":
      return `# ${header}\n# Read from standard input, write the answer to standard output.\nimport sys\n\n\ndef main() -> None:\n    data = sys.stdin.read().split()\n    _ = data\n\n\nif __name__ == "__main__":\n    main()\n`
    case "javascript":
      return `// ${header}\nconst data = require("node:fs").readFileSync(0, "utf8").trim().split(/\\s+/);\n`
    case "typescript":
      return `// ${header}\nconst data = require("node:fs").readFileSync(0, "utf8").trim().split(/\\s+/);\n`
    case "go":
      return `// ${header}\npackage main\n\nimport (\n\t"bufio"\n\t"os"\n)\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\t_ = in\n}\n`
    case "rust":
      return `// ${header}\nuse std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n}\n`
    case "c":
      return `/* ${header} */\n#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n`
    case "cpp":
      return `// ${header}\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    return 0;\n}\n`
    case "java":
      return `// ${header}\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n    }\n}\n`
    case "bash":
      return `#!/usr/bin/env bash\n# ${header}\nset -euo pipefail\n\nread -r -a values || true\n`
    default:
      throw new Error("No CSES starter for this track")
  }
}
