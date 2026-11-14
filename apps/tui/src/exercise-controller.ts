import { primarySolutionFile, scanExercise, readSolution, saveSolution, solutionRevision, type ExerciseSource, type ExerciseSummary, type Problem, type SubmitResult, type TestReport, type Track, type LocalExerciseState } from "@solvebench/exercise"
import type { ExerciseProgressRepository } from "@solvebench/storage"
import { Err, Ok, type Result } from "@solvebench/shared"
import type { ImportedExercise, ExerciseSourceError } from "@solvebench/exercise"

export interface ExerciseViewState {
  tracks: Track[]
  activeTrack: string | undefined
  exercises: ExerciseSummary[]
  /** Browser cursor only. Actions target openedSlug, never this cursor. */
  activeSlug: string | undefined
  openedTrack: string | undefined
  openedSlug: string | undefined
  problem: Problem | null
  local: LocalExerciseState | null
  activeFile: string | null
  buffers: Record<string, string>
  testFiles: Record<string, string>
  dirty: boolean
  revision: string
  reportRevision: string | null
  submitRevision: string | null
  lastReport: TestReport | null
  runningTests: boolean
  submitting: boolean
  preparing: boolean
  environment: string
  lastSubmit: SubmitResult | null
  loading: boolean
  error: string | null
}

export interface ExerciseControllerDeps {
  source: ExerciseSource
  sources?: Record<string, ExerciseSource>
  workspace: string
  progress?: ExerciseProgressRepository
  onOpenFile?: (path: string, content: string) => void
  onTestReport?: (report: TestReport) => void
  prepare?: (track: string, directory: string, report: (message: string) => void) => Promise<void>
  sampleDirectory?: string
  read?: typeof readSolution
  write?: typeof saveSolution
}

export const EMPTY_EXERCISE_STATE: ExerciseViewState = {
  tracks: [], activeTrack: undefined, exercises: [], activeSlug: undefined,
  openedTrack: undefined, openedSlug: undefined, problem: null, local: null,
  activeFile: null, buffers: {}, testFiles: {}, dirty: false, revision: "",
  reportRevision: null, submitRevision: null, lastReport: null, runningTests: false, submitting: false,
  preparing: false, environment: "", lastSubmit: null, loading: false, error: null,
}

export class ExerciseController {
  private state: ExerciseViewState = { ...EMPTY_EXERCISE_STATE }
  private listeners = new Set<(state: ExerciseViewState) => void>()
  private initializing?: Promise<void>
  private initialized = false
  private trackRequest = 0
  private openRequest = 0
  constructor(readonly deps: ExerciseControllerDeps) {}
  getState(): ExerciseViewState { return this.state }
  getSources(): ExerciseSource[] { return Object.values(this.deps.sources ?? { [this.deps.source.id]: this.deps.source }) }
  async trySample(): Promise<Result<void, ExerciseSourceError>> {
    if (!this.deps.sampleDirectory) return Err({ kind: "unsupported", detail: "No built-in sample is available" })
    if (this.state.loading || this.state.runningTests || this.state.submitting || this.state.preparing) return Err({ kind: "failed", detail: "Wait for the current operation to finish" })
    const local = this.getSources().find(source => source.id === "local")
    if (!local) return Err({ kind: "unsupported", detail: "Local exercises are not available" })
    const slug = await local.isDownloaded("python", "pairharness-sample-sum-two")
      ? "pairharness-sample-sum-two" : "solvebench-sample-sum-two"
    if (!await local.isDownloaded("python", slug)) {
      const result = await this.importExercises(this.deps.sampleDirectory)
      if (!result.ok) return result
    } else if (this.deps.source !== local) await this.switchSource("local")
    if (this.state.error) return Err({ kind: "failed", detail: this.state.error })
    await this.selectTrack("python")
    await this.open(slug)
    return this.state.error ? Err({ kind: "failed", detail: this.state.error }) : Ok(undefined)
  }
  async importExercises(directory: string): Promise<Result<ImportedExercise[], ExerciseSourceError>> {
    if (this.state.loading || this.state.runningTests || this.state.submitting || this.state.preparing) return Err({ kind: "failed", detail: "Wait for the current operation to finish" })
    const source = this.getSources().find(source => source.importExercises)
    if (!source?.importExercises) return Err({ kind: "unsupported", detail: "Local import is not available" })
    this.set({ loading: true, error: null })
    try {
      await this.save()
      const result = await source.importExercises(directory)
      if (!result.ok) return result
      if (this.deps.source !== source) await this.switchSource(source.id)
      else {
        this.initialized = false
        await this.init()
      }
      if (this.state.error) throw new Error(this.state.error)
      const first = result.value[0]
      if (first) { await this.selectTrack(first.trackSlug); this.select(first.slug) }
      if (this.state.error) throw new Error(this.state.error)
      return Ok(result.value)
    } catch (error) {
      return Err({ kind: "failed", detail: error instanceof Error ? error.message : String(error) })
    } finally { this.set({ loading: false }) }
  }
  async switchSource(id: string): Promise<void> {
    const source = this.deps.sources?.[id]
    if (!source || source === this.deps.source || this.state.runningTests || this.state.submitting) return
    try { await this.save() } catch (error) { this.error(error); return }
    ++this.trackRequest; ++this.openRequest
    this.deps.source = source
    this.initialized = false
    this.state = { ...EMPTY_EXERCISE_STATE }
    this.set({})
    this.deps.onOpenFile?.("", "")
    await this.init()
  }
  async connect(credentials: Record<string, string>): Promise<void> {
    try {
      if (!this.deps.source.connect) throw new Error("Connection setup not supported")
      await this.deps.source.connect(credentials)
      this.initialized = false
      await this.init()
    } catch (error) { this.error(error) }
  }
  async disconnect(): Promise<void> {
    try {
      if (!this.deps.source.disconnect) throw new Error("Disconnect not supported")
      await this.deps.source.disconnect()
      this.initialized = false
      await this.init()
    } catch (error) { this.error(error) }
  }
  subscribe(listener: (state: ExerciseViewState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }
  private set(patch: Partial<ExerciseViewState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }
  private error(error: unknown): void {
    this.set({ error: error instanceof Error ? error.message : String(error) })
  }
  async init(): Promise<void> {
    if (this.initializing) return this.initializing
    if (this.initialized) return
    this.initializing = this.initialize()
    try { await this.initializing } finally { this.initializing = undefined }
  }
  private async initialize(): Promise<void> {
    this.set({ loading: true, error: null })
    try {
      if (!await this.deps.source.isConfigured()) throw new Error(`${this.deps.source.label}: not configured — connection required`)
      const tracks = await this.deps.source.listTracks()
      if (!tracks.ok) throw new Error(tracks.error.detail)
      this.initialized = true
      this.set({ tracks: tracks.value })
      const chosen = tracks.value.find(t => (this.deps.progress?.forTrack(this.deps.source.id, t.slug).length ?? 0) > 0) ?? tracks.value[0]
      if (!this.state.activeTrack && chosen) await this.selectTrack(chosen.slug)
    } catch (error) { this.error(error) } finally { this.set({ loading: false }) }
  }
  async selectTrack(trackSlug: string): Promise<void> {
    const request = ++this.trackRequest
    this.set({ activeTrack: trackSlug, loading: true, error: null, exercises: [], activeSlug: undefined })
    try {
      const result = await this.deps.source.listExercises(trackSlug)
      if (request !== this.trackRequest) return
      if (!result.ok) throw new Error(result.error.detail)
      const exercises = this.merge(result.value, trackSlug)
      this.set({ exercises, activeSlug: exercises[0]?.slug })
    } catch (error) { if (request === this.trackRequest) this.error(error) }
    finally { if (request === this.trackRequest) this.set({ loading: false }) }
  }
  private merge(items: ExerciseSummary[], track: string): ExerciseSummary[] {
    return items.map(exercise => {
      const record = this.deps.progress?.get(this.deps.source.id, track, exercise.slug)
      if (exercise.progress === "completed" || record?.status === "completed") {
        return { ...exercise, progress: "completed" as const }
      }
      return record ? { ...exercise, progress: "started" as const } : exercise
    })
  }

  /** Reloads the track's exercises after a submit, so newly unlocked tasks appear. */
  async refresh(): Promise<void> {
    const track = this.state.activeTrack
    if (!track || this.state.runningTests || this.state.submitting) return
    const result = await this.deps.source.listExercises(track)
    if (!result.ok) return
    this.set({ exercises: this.merge(result.value, track) })
  }

  /**
   * The next exercise to work on. The platform marks one as recommended after a
   * submit; that one wins. Otherwise walk the list below the current row and
   * wrap around. Unfinished tasks are preferred over completed ones.
   */
  async nextExercise(): Promise<string | undefined> {
    await this.refresh()
    const items = this.state.exercises
    const current = items.findIndex(e => e.slug === this.state.openedSlug)
    const open = (e: ExerciseSummary) => e.progress !== "locked" && e.slug !== this.state.openedSlug
    const todo = (e: ExerciseSummary) => open(e) && e.progress !== "completed"
    const after = items.slice(current + 1)
    const before = items.slice(0, Math.max(0, current))
    const target =
      items.find(e => e.recommended && todo(e)) ??
      items.find(e => e.recommended && open(e)) ??
      after.find(todo) ?? before.find(todo) ??
      after.find(open) ?? before.find(open) ??
      items.find(open)
    if (!target) return undefined
    this.select(target.slug)
    return target.slug
  }
  async nextTrack(): Promise<void> {
    const tracks = this.state.tracks.filter(t => !this.deps.source.supportedTracks || this.deps.source.supportedTracks.includes(t.slug))
    if (tracks.length) await this.selectTrack(tracks[(tracks.findIndex(t => t.slug === this.state.activeTrack) + 1) % tracks.length]!.slug)
  }
  moveSelection(delta: number): void {
    const items = this.state.exercises
    if (!items.length) return
    const index = items.findIndex(e => e.slug === this.state.activeSlug)
    this.set({ activeSlug: items[Math.max(0, Math.min(items.length - 1, index < 0 ? 0 : index + delta))]!.slug })
  }
  select(slug: string): void { this.set({ activeSlug: slug }) }

  async open(slug: string): Promise<void> {
    if (this.state.runningTests || this.state.submitting || this.state.preparing) return
    const track = this.state.activeTrack
    if (!track) return
    const request = ++this.openRequest
    const trackRequest = this.trackRequest
    this.set({ loading: true, error: null })
    try {
      await this.save()
      const downloaded = await this.deps.source.download(track, slug)
      if (!downloaded.ok) throw new Error(`${downloaded.error.kind}: ${downloaded.error.detail}`)
      const problem = await this.deps.source.getProblem(track, slug)
      if (!problem.ok) throw new Error(problem.error.detail)
      const directory = downloaded.value.directory
      const local = await scanExercise(track, slug, directory)
      const buffers: Record<string, string> = {}
      const testFiles: Record<string, string> = {}
      const read = this.deps.read ?? readSolution
      const solutions = problem.value.solutionFiles.length ? problem.value.solutionFiles : local?.solutionFiles ?? []
      const tests = problem.value.testFiles.length ? problem.value.testFiles : local?.testFiles ?? []
      for (const file of solutions) buffers[file] = await read(directory, file)
      for (const file of tests) testFiles[file] = await read(directory, file)
      if (request !== this.openRequest || trackRequest !== this.trackRequest) return
      const file = problem.value.solutionFiles[0] ?? (local ? primarySolutionFile(local, problem.value) : solutions[0] ?? null)
      this.set({ openedTrack: track, openedSlug: slug, activeSlug: slug, problem: problem.value, local,
        activeFile: file, buffers, testFiles, dirty: false, revision: solutionRevision(buffers),
        reportRevision: null, submitRevision: null, lastReport: null, lastSubmit: null, environment: "" })
      this.deps.progress?.markStarted(this.deps.source.id, track, slug)
      this.set({ exercises: this.merge(this.state.exercises, track) })
      if (file) this.deps.onOpenFile?.(file, buffers[file] ?? "")
      if (local && this.deps.prepare) {
        try { await this.prepare() } catch (error) { this.error(error) }
      }
    } catch (error) { if (request === this.openRequest) this.error(error) }
    finally { if (request === this.openRequest) this.set({ loading: false }) }
  }
  setBuffer(content: string): void {
    const file = this.state.activeFile
    if (!file || this.state.buffers[file] === content) return
    const buffers = { ...this.state.buffers, [file]: content }
    this.set({ buffers, dirty: true, revision: solutionRevision(buffers) })
  }
  chooseFile(file: string): void {
    if (!(file in this.state.buffers)) return
    this.set({ activeFile: file })
    this.deps.onOpenFile?.(file, this.state.buffers[file]!)
  }
  async save(): Promise<void> {
    if (!this.state.dirty || !this.state.local) return
    const revision = this.state.revision
    for (const [file, content] of Object.entries(this.state.buffers)) await (this.deps.write ?? saveSolution)(this.state.local.directory, file, content)
    if (revision === this.state.revision) this.set({ dirty: false })
  }
  async prepare(): Promise<void> {
    if (!this.state.local || !this.state.openedTrack || !this.deps.prepare) return
    this.set({ preparing: true, error: null })
    try {
      await this.deps.prepare(this.state.openedTrack, this.state.local.directory, environment => this.set({ environment }))
      this.set({ environment: "Ready" })
    } finally { this.set({ preparing: false }) }
  }
  async runTests(): Promise<void> {
    const { openedTrack: track, openedSlug: slug } = this.state
    if (!track || !slug || this.state.runningTests || this.state.submitting) return
    this.set({ runningTests: true, error: null })
    try {
      await this.save()
      await this.prepare()
      await this.save()
      const revision = this.state.revision
      const result = await this.deps.source.runTests(track, slug)
      if (!result.ok) throw new Error(result.error.detail)
      this.set({ lastReport: result.value, reportRevision: revision })
      this.deps.progress?.recordRun(this.deps.source.id, track, slug, result.value.passed, result.value.failed)
      if (track === this.state.activeTrack) this.set({ exercises: this.merge(this.state.exercises, track) })
      this.deps.onTestReport?.(result.value)
    } catch (error) { this.error(error) } finally { this.set({ runningTests: false }) }
  }
  async submit(force = false): Promise<void> {
    const { openedTrack: track, openedSlug: slug } = this.state
    if (!track || !slug || this.state.submitting || this.state.runningTests) return
    if (!this.deps.source.submit) { this.set({ error: "This platform does not support submission" }); return }
    // Submission is an explicit action; fresh-test requirement is visible, not silently bypassed.
    const report = this.state.lastReport
    if (!force && (!report || report.total === 0 || report.failed > 0 || report.exitCode !== undefined && report.exitCode !== 0 || this.state.reportRevision !== this.state.revision)) {
      this.set({ error: "Run tests on the current solution before sending" }); return
    }
    this.set({ submitting: true, error: null })
    let uploaded = false
    try {
      const revision = this.state.revision
      await this.save()
      this.set({ submitRevision: revision })
      const result = await this.deps.source.submit(track, slug)
      if (!result.ok) throw new Error(result.error.detail)
      this.set({ lastSubmit: result.value })
      // A successful upload is the completion signal for sources where
      // submitting completes (fixtures, an accepted LeetCode run). Exercism
      // distinguishes the two: it reports completed:false when its completion
      // call failed, and then the task is not locally marked done either.
      if (result.value.ok) {
        uploaded = true
        if (result.value.completed !== false) {
          this.deps.progress?.markCompleted(this.deps.source.id, track, slug)
        }
      }
    } catch (error) { this.error(error) } finally { this.set({ submitting: false }) }
    // Refresh after submitting flips back to false, otherwise refresh() would
    // bail out and the newly unlocked next task would stay locked.
    if (uploaded) await this.refresh()
  }
  exerciseDirectory(track: string, slug: string): string { return `${this.deps.workspace}/${track}/${slug}` }
}
