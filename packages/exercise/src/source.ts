import { Err, Ok, type Result } from "@solvebench/shared"
import type { ExerciseSummary, LocalExercise, Problem, SubmitResult, TestReport, Track } from "./types"
import type { ImportedExercise } from "./local-package"

export type ExerciseSourceError =
  | { kind: "not-configured"; detail: string }
  | { kind: "network"; detail: string }
  | { kind: "not-found"; detail: string }
  | { kind: "not-unlocked"; detail: string }
  | { kind: "unsupported"; detail: string }
  | { kind: "failed"; detail: string }

export function sourceError(kind: ExerciseSourceError["kind"], detail: string): ExerciseSourceError {
  return { kind, detail }
}

/**
 * The seam that keeps the TUI platform-agnostic.
 *
 * Exercism implements this first. A LeetCode source can be added later without
 * changing the TUI, because the UI only ever talks to this interface.
 */
export interface ExerciseSource {
  /** Stable identity, e.g. "exercism". */
  readonly id: string
  /** Human label for the source picker. */
  readonly label: string
  connectionFields?: readonly string[]
  supportedTracks?: readonly string[]
  connect?(credentials: Record<string, string>): Promise<void>
  /** Forget a connection and remove any credential material this source stored. */
  disconnect?(): Promise<void>
  /** Optional local package import; importing must not execute exercise code. */
  importExercises?(directory: string): Promise<Result<ImportedExercise[], ExerciseSourceError>>
  /**
   * Optional environment preparation before a test run. Sources that need no
   * managed toolchain (a local command or a platform judge) can say so here;
   * when omitted the composition root falls back to the language toolchains.
   */
  prepareEnvironment?(trackSlug: string, directory: string, report: (message: string) => void): Promise<void>

  /** True when the source has everything it needs (token, CLI, ...). */
  isConfigured(): Promise<boolean>

  listTracks(): Promise<Result<Track[], ExerciseSourceError>>
  /** Exercises of one track, with their progress state. */
  listExercises(trackSlug: string): Promise<Result<ExerciseSummary[], ExerciseSourceError>>
  /** Full problem statement for one exercise. */
  getProblem(trackSlug: string, slug: string): Promise<Result<Problem, ExerciseSourceError>>
  /** Downloads (or reads) the exercise into the local workspace. */
  download(trackSlug: string, slug: string): Promise<Result<LocalExercise, ExerciseSourceError>>
  /** True when the exercise is already present locally. */
  isDownloaded(trackSlug: string, slug: string): Promise<boolean>
  /** Runs the exercise's native test suite and normalises the report. */
  runTests(trackSlug: string, slug: string): Promise<Result<TestReport, ExerciseSourceError>>
  /**
   * Uploads the current solution to the platform. Optional: a source that has
   * no submission path simply omits it.
   */
  submit?(trackSlug: string, slug: string): Promise<Result<SubmitResult, ExerciseSourceError>>
}
