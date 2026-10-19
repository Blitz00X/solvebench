import { existsSync } from "node:fs"
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { Err, Ok, type Result } from "@solvebench/shared"
import { type ExercismConfig, isConfigured } from "./config"
import { createExercismApi, normaliseDifficulty, type ExercismApi } from "./exercism-api"
import { sourceError, type ExerciseSource, type ExerciseSourceError } from "./source"
import { resolveReferenceLinks } from "./links"
import { runTrackTests } from "./runners"
import { SUPPORTED_TRACKS, type ToolchainManager } from "./toolchains"
import { homedir } from "node:os"
import type {
  ExerciseFile,
  ExerciseProgress,
  ExerciseSummary,
  LocalExercise,
  Problem,
  SubmitResult,
  TestReport,
  Track,
} from "./types"

export interface ExercismSourceOptions {
  config: ExercismConfig
  api?: ExercismApi
  /** Injection point for the CLI; defaults to spawning the configured binary. */
  runCli?: (args: string[], cwd?: string) => Promise<{ code: number; stdout: string; stderr: string }>
  toolchains?: ToolchainManager
}

const SOURCE_EXTENSIONS = [
  ".py",
  ".js",
  ".ts",
  ".go",
  ".java",
  ".rs",
  ".c",
  ".cpp",
  ".h",
  ".sh",
  ".bash",
]

export class ExercismSource implements ExerciseSource {
  readonly id = "exercism"
  readonly label = "Exercism"
  readonly supportedTracks = SUPPORTED_TRACKS
  private api: ExercismApi
  readonly connectionFields = ["token"]
  async connect(credentials: Record<string, string>): Promise<void> {
    if (!credentials.token?.trim()) throw new Error("Exercism token required")
    this.options.config.token = credentials.token.trim()
    this.api = createExercismApi({ baseUrl: this.options.config.apiBaseUrl, token: this.options.config.token })
    await this.seedCliConfig()
  }
  private readonly runCli: (args: string[], cwd?: string) => Promise<{ code: number; stdout: string; stderr: string }>

  constructor(private readonly options: ExercismSourceOptions) {
    this.api =
      options.api ??
      createExercismApi({
        baseUrl: options.config.apiBaseUrl,
        token: options.config.token,
      })
    this.runCli = options.runCli ?? this.defaultCli()
  }

  private defaultCli() {
    const { configHome, workspace } = this.options.config
    let prepared = false
    return async (args: string[], cwd?: string) => {
      // The CLI reads its token from its own config home. Because we isolate
      // that directory, seed it once from our resolved config so the user's
      // ~/.config/exercism is never read or written by the CLI itself.
      if (!prepared) {
        await this.ensureCli()
        await this.seedCliConfig()
        prepared = true
      }
      const proc = Bun.spawn([this.options.config.cliPath, ...args], {
        ...(cwd ? { cwd } : {}),
        env: { ...process.env, EXERCISM_CONFIG_HOME: configHome, EXERCISM_WORKSPACE: workspace },
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
      const code = await proc.exited
      return { code, stdout, stderr }
    }
  }

  /**
   * Writes the isolated CLI config with the resolved token and workspace.
   * The file is owner-only and lives inside the project, never in ~/.config.
   */
  async seedCliConfig(): Promise<void> {
    const { configHome, token, workspace, apiBaseUrl } = this.options.config
    // EXERCISM_CONFIG_HOME is the directory that directly holds user.json;
    // the CLI does not add an "exercism/" level of its own.
    await mkdir(configHome, { recursive: true })
    const path = join(configHome, "user.json")
    // The CLI stores a v1 base URL for its own compatibility.
    const cliBase = apiBaseUrl.endsWith("/v1") ? apiBaseUrl : `${apiBaseUrl}/v1`
    await writeFile(path, JSON.stringify({ apibaseurl: cliBase, token, workspace }, null, 2))
    try {
      await chmod(path, 0o600)
    } catch {
      // best effort on platforms without posix permissions
    }
  }
  private async ensureCli(): Promise<void> {
    if (existsSync(this.options.config.cliPath)) return
    const { configHome } = this.options.config
    const bin = join(configHome, "bin")
    if (existsSync(join(bin, "exercism"))) { this.options.config.cliPath = join(bin, "exercism"); return }
    await mkdir(bin, { recursive: true })
    const arch = process.arch === "arm64" ? "arm64" : "x86_64"
    const response = await fetch(`https://github.com/exercism/cli/releases/download/v3.5.8/exercism-3.5.8-${process.platform}-${arch}.tar.gz`)
    if (!response.ok) throw new Error("Could not download the Exercism CLI")
    const archive = join(configHome, "cli.tar.gz")
    await writeFile(archive, new Uint8Array(await response.arrayBuffer()))
    const proc = Bun.spawn(["tar", "-xf", archive, "-C", bin], { stdout: "pipe", stderr: "pipe" })
    const [_, error, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    if (code !== 0) throw new Error(`Exercism CLI install failed: ${error}`)
    this.options.config.cliPath = join(bin, "exercism")
    await chmod(this.options.config.cliPath, 0o700)
  }

  async isConfigured(): Promise<boolean> {
    return isConfigured(this.options.config)
  }

  async listTracks(): Promise<Result<Track[], ExerciseSourceError>> {
    if (!(await this.isConfigured())) {
      return Err(sourceError("not-configured", "no exercism token; set EXERCISM_API_TOKEN or configure the CLI"))
    }
    try {
      const tracks = await this.api.listTracks()
      return Ok(
        tracks.map((t) => ({
          sourceId: this.id,
          slug: t.slug,
          title: t.title,
          language: t.slug,
          ...(typeof t.num_exercises === "number" ? { numExercises: t.num_exercises } : {}),
        })),
      )
    } catch (error) {
      return Err(sourceError("network", message(error)))
    }
  }

  async listExercises(trackSlug: string): Promise<Result<ExerciseSummary[], ExerciseSourceError>> {
    try {
      const [exercises, completed] = await Promise.all([this.api.listExercises(trackSlug), this.safeCompleted(trackSlug)])
      const local = await this.localSlugs(trackSlug)
      const summaries: ExerciseSummary[] = exercises
        .filter((e) => !e.is_external)
        .map((e) => ({
          sourceId: this.id,
          trackSlug,
          slug: e.slug,
          title: e.title,
          difficulty: normaliseDifficulty(e.difficulty),
          progress: this.progressFor(e, completed, local),
          blurb: e.blurb ?? "",
          ...(e.type === "tutorial" || e.type === "concept" || e.type === "practice" ? { kind: e.type } : {}),
          ...(typeof e.is_recommended === "boolean" ? { recommended: e.is_recommended } : {}),
        }))
      // The platform reshuffles its own order with activity: recent work floats
      // to the top and completed exercises sink to the end, so rows jump around
      // between refreshes. Deliver one stable order instead: the tutorial
      // first, then easy → medium → hard, each alphabetically by slug.
      summaries.sort(
        (a, b) =>
          kindRank(a.kind) - kindRank(b.kind) ||
          difficultyRank(a.difficulty) - difficultyRank(b.difficulty) ||
          a.slug.localeCompare(b.slug),
      )
      return Ok(summaries)
    } catch (error) {
      return Err(sourceError("network", message(error)))
    }
  }

  private progressFor(
    exercise: { slug: string; is_unlocked?: boolean },
    completed: Set<string>,
    local: Set<string>,
  ): ExerciseProgress {
    if (completed.has(exercise.slug)) return "completed"
    if (local.has(exercise.slug)) return "started"
    return exercise.is_unlocked === false ? "locked" : "available"
  }
  private async safeCompleted(trackSlug: string): Promise<Set<string>> {
    try {
      return await this.api.listCompletedSlugs(trackSlug)
    } catch {
      // The solutions endpoint is optional: without it we fall back to local state.
      return new Set()
    }
  }

  async isDownloaded(trackSlug: string, slug: string): Promise<boolean> {
    return existsSync(this.exerciseDir(trackSlug, slug))
  }

  /**
   * The Exercism API has no per-exercise detail endpoint, so the authoritative
   * problem text is the README of the downloaded exercise, and the file list is
   * in its .exercism/config.json. When the exercise is not downloaded yet we
   * fall back to the API list entry (title, difficulty, short blurb).
   */
  async getProblem(trackSlug: string, slug: string): Promise<Result<Problem, ExerciseSourceError>> {
    const dir = this.exerciseDir(trackSlug, slug)
    if (existsSync(dir)) {
      const readme = await this.readIfPresent(join(dir, "README.md"))
      const meta = await this.readMetadata(dir)
      if (readme !== null) {
        // The local README is the authoritative text, kept as markdown so the
        // UI can render it; reference links are resolved so no raw definitions
        // leak into the statement. Title and difficulty only exist in the API
        // list entry, so enrich from there when reachable.
        const entry = await this.apiEntry(trackSlug, slug)
        return Ok({
          sourceId: this.id,
          trackSlug,
          slug,
          title: entry?.title ?? slug,
          difficulty: normaliseDifficulty(entry?.difficulty),
          body: resolveReferenceLinks(readme),
          solutionFiles: meta.solutionFiles,
          testFiles: meta.testFiles,
          url: `https://exercism.org/tracks/${trackSlug}/exercises/${slug}`,
        })
      }
    }
    try {
      const exercises = await this.api.listExercises(trackSlug)
      const entry = exercises.find((e) => e.slug === slug)
      if (!entry) return Err(sourceError("not-found", `unknown exercise: ${trackSlug}/${slug}`))
      return Ok({
        sourceId: this.id,
        trackSlug,
        slug,
        title: entry.title,
        difficulty: normaliseDifficulty(entry.difficulty),
        body: `${entry.blurb ?? ""}\n\n(download the exercise to see the full instructions)`,
        solutionFiles: [],
        testFiles: [],
        url: `https://exercism.org/tracks/${trackSlug}/exercises/${slug}`,
      })
    } catch (error) {
      return Err(sourceError("network", message(error)))
    }
  }

  private async apiEntry(trackSlug: string, slug: string): Promise<{ title?: string; difficulty?: string } | null> {
    try {
      const exercises = await this.api.listExercises(trackSlug)
      return exercises.find((e) => e.slug === slug) ?? null
    } catch {
      return null
    }
  }

  private async readIfPresent(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8")
    } catch {
      return null
    }
  }

  private async readMetadata(dir: string): Promise<{
    title?: string
    difficulty?: Problem["difficulty"]
    solutionFiles: string[]
    testFiles: string[]
    url?: string
  }> {
    const raw = await this.readIfPresent(join(dir, ".exercism", "config.json"))
    if (!raw) return { solutionFiles: [], testFiles: [] }
    try {
      const parsed = JSON.parse(raw) as {
        blurb?: string
        files?: { solution?: string[]; test?: string[] }
      }
      return {
        solutionFiles: parsed.files?.solution ?? [],
        testFiles: parsed.files?.test ?? [],
      }
    } catch {
      return { solutionFiles: [], testFiles: [] }
    }
  }

  async download(trackSlug: string, slug: string): Promise<Result<LocalExercise, ExerciseSourceError>> {
    const dir = this.exerciseDir(trackSlug, slug)
    if (!existsSync(dir)) {
      await mkdir(this.options.config.workspace, { recursive: true })
      const result = await this.runCli(["download", "--track", trackSlug, "--exercise", slug])
      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout).trim()
        if (/not unlocked/i.test(detail)) return Err(sourceError("not-unlocked", detail))
        return Err(sourceError("failed", detail))
      }
    }
    if (!existsSync(dir)) return Err(sourceError("not-found", `exercise directory missing: ${dir}`))
    return Ok({
      sourceId: this.id,
      trackSlug,
      slug,
      directory: dir,
      files: await this.readExerciseFiles(dir),
    })
  }

  /**
   * Uploads the current solution. The CLI's `submit` runs on the exercise
   * directory with no file arguments, which submits the default solution files.
   *
   * Uploading alone leaves the solution "iterated" and the track locked: the
   * exercise is only completed — and the next tasks unlocked — by the complete
   * endpoint, the same action the website's Complete button performs.
   */
  async submit(trackSlug: string, slug: string): Promise<Result<SubmitResult, ExerciseSourceError>> {
    const dir = this.exerciseDir(trackSlug, slug)
    if (!existsSync(dir)) return Err(sourceError("not-found", `exercise not downloaded: ${trackSlug}/${slug}`))
    const result = await this.runCli(["submit"], dir)
    const raw = [result.stdout, result.stderr].filter((t) => t.trim()).join("\n").trim()
    const url = extractSolutionUrl(raw)
    if (result.code !== 0) {
      // "No files changed since your last submission" means this exact solution
      // is already on the platform: it counts as submitted, not as an error.
      if (/have changed since/i.test(raw)) {
        return this.afterUpload(dir, "Already submitted; no changes since the last upload.", raw, url, "unchanged")
      }
      return Ok({
        ok: false,
        status: "rejected",
        completed: false,
        message: cleanCliMessage(firstMeaningfulLine(raw)) || "Upload failed",
        ...(url ? { url } : {}),
        raw,
      })
    }
    return this.afterUpload(dir, cleanCliMessage(firstMeaningfulLine(raw)) || "Uploaded to Exercism.", raw, url, "submitted")
  }

  /** Completes an uploaded solution on the platform and reports what it unlocked. */
  private async afterUpload(
    dir: string,
    baseMessage: string,
    raw: string,
    url: string | undefined,
    status: "submitted" | "unchanged",
  ): Promise<Result<SubmitResult, ExerciseSourceError>> {
    const completed = await this.completeExercise(dir)
    if (!completed.ok) {
      return Ok({
        ok: true,
        status,
        completed: false,
        message: `${baseMessage} (uploaded, but completing the exercise failed: ${completed.error})`,
        ...(url ? { url } : {}),
        raw,
      })
    }
    return Ok({
      ok: true,
      status,
      completed: true,
      unlocked: completed.value,
      message: baseMessage + completionSuffix(completed.value),
      ...(url ? { url } : {}),
      raw,
    })
  }

  private async completeExercise(dir: string): Promise<Result<string[], string>> {
    try {
      const metadataPath = join(dir, ".exercism", "metadata.json")
      if (!existsSync(metadataPath)) return Err("no .exercism/metadata.json; download the exercise with the CLI first")
      const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { id?: string }
      if (!metadata.id) return Err("no solution id in .exercism/metadata.json")
      const { unlocked } = await this.api.completeSolution(metadata.id)
      return Ok(unlocked)
    } catch (error) {
      return Err(error instanceof Error ? error.message : "completion request failed")
    }
  }

  async runTests(trackSlug: string, slug: string): Promise<Result<TestReport, ExerciseSourceError>> {
    const dir = this.exerciseDir(trackSlug, slug)
    if (!existsSync(dir)) return Err(sourceError("not-found", `exercise not downloaded: ${trackSlug}/${slug}`))
    const report = await runTrackTests({ trackSlug, slug, directory: dir, env: this.options.toolchains?.env(dir) })
    return Ok(report)
  }

  exerciseDir(trackSlug: string, slug: string): string {
    const { workspace } = this.options.config
    // Exercism layouts exercises as <workspace>/<track>/<slug>.
    const nested = join(workspace, trackSlug, slug)
    if (existsSync(nested)) return nested
    // Fallback: some setups use <workspace>/<slug>.
    const flat = join(workspace, slug)
    if (existsSync(flat)) return flat
    return nested
  }

  private async readExerciseFiles(dir: string): Promise<ExerciseFile[]> {
    const files: ExerciseFile[] = []
    const walk = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".exercism") continue
        if (entry.name === "build" || entry.name === "node_modules" || entry.name === "target") continue
        const absolute = join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(absolute)
          continue
        }
        const rel = relative(dir, absolute).replaceAll("\\", "/")
        const isSolution = SOURCE_EXTENSIONS.some((ext) => rel.endsWith(ext))
        if (!isSolution && !rel.endsWith(".md")) continue
        try {
          files.push({ path: rel, content: await readFile(absolute, "utf8") })
        } catch {
          // unreadable/binary; skip
        }
      }
    }
    await walk(dir)
    return files
  }

  private async localSlugs(trackSlug: string): Promise<Set<string>> {
    const trackDir = join(this.options.config.workspace, trackSlug)
    if (!existsSync(trackDir)) return new Set()
    const entries = await readdir(trackDir, { withFileTypes: true })
    return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Finds the solution URL the CLI prints after a successful submit. */
export function extractSolutionUrl(output: string): string | undefined {
  // Match any non-space exercism.org URL; the previous pattern failed because
  // it required at least one character between "https://" and the host.
  const match = output.match(/https?:\/\/\S*exercism\.org\S*/i)
  return match ? match[0].replace(/[.,)\]]+$/, "") : undefined
}

/** The first line worth showing as a summary, skipping blanks and banners. */
export function firstMeaningfulLine(output: string): string {
  for (const line of output.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith("===")) continue
    return trimmed
  }
  return ""
}

/**
 * The CLI prefixes its messages with a raw "Error:" label and sometimes repeats
 * them. Strip that noise so the UI shows one clean sentence per outcome.
 */
export function cleanCliMessage(message: string): string {
  const seen = new Set<string>()
  const lines = message
    .split("\n")
    .map((line) => line.trim().replace(/^Error:\s*/i, "").trim())
    .filter((line) => line.length > 0 && !seen.has(line) && (seen.add(line), true))
  return lines[0] ?? ""
}

/** Appended to the submit message once the platform completed the exercise. */
export function completionSuffix(unlocked: string[]): string {
  if (unlocked.length === 0) return " Exercise completed."
  if (unlocked.length > 4) return ` Exercise completed; ${unlocked.length} tasks unlocked.`
  return ` Exercise completed; unlocked: ${unlocked.join(", ")}.`
}

/** The intro exercise stays first; everything else sorts by difficulty. */
function kindRank(kind: ExerciseSummary["kind"]): number {
  return kind === "tutorial" ? 0 : 1
}

/** easy → medium → hard; exercises with no declared difficulty come last. */
function difficultyRank(difficulty: ExerciseSummary["difficulty"]): number {
  return difficulty === "easy" ? 0 : difficulty === "medium" ? 1 : difficulty === "hard" ? 2 : 3
}
