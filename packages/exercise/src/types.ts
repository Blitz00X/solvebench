import { z } from "zod"

/** Difficulty as the exercise platforms report it. */
export const Difficulty = z.enum(["easy", "medium", "hard", "unknown"])
export type Difficulty = z.infer<typeof Difficulty>

export const ExerciseProgress = z.enum(["locked", "available", "started", "completed"])
export type ExerciseProgress = z.infer<typeof ExerciseProgress>

/** A language track on a platform, e.g. Exercism's "python". */
export const Track = z.object({
  sourceId: z.string(),
  slug: z.string(),
  title: z.string(),
  language: z.string(),
  numExercises: z.number().int().nonnegative().optional(),
})
export type Track = z.infer<typeof Track>

/** One exercise as it appears in a list. The full text is fetched separately. */
export const ExerciseSummary = z.object({
  sourceId: z.string(),
  trackSlug: z.string(),
  slug: z.string(),
  title: z.string(),
  difficulty: Difficulty.default("unknown"),
  progress: ExerciseProgress,
  blurb: z.string().default(""),
  /** What the platform calls this exercise, when it declares it. */
  kind: z.enum(["tutorial", "concept", "practice"]).optional(),
  /** The platform's suggestion for the next exercise to try. */
  recommended: z.boolean().optional(),
})
export type ExerciseSummary = z.infer<typeof ExerciseSummary>

/** The full problem statement plus what a solution needs to start. */
export const Problem = z.object({
  sourceId: z.string(),
  trackSlug: z.string(),
  slug: z.string(),
  title: z.string(),
  difficulty: Difficulty.default("unknown"),
  /** Markdown as delivered by the platform. */
  body: z.string(),
  /** Starter/solution files declared by the platform, repo-relative within the exercise. */
  solutionFiles: z.array(z.string()).default([]),
  testFiles: z.array(z.string()).default([]),
  url: z.string().optional(),
})
export type Problem = z.infer<typeof Problem>

/** A file on disk inside a downloaded exercise. */
export const ExerciseFile = z.object({
  /** Path relative to the exercise directory. */
  path: z.string(),
  content: z.string(),
})
export type ExerciseFile = z.infer<typeof ExerciseFile>

/** A downloaded exercise materialised in the local workspace. */
export const LocalExercise = z.object({
  sourceId: z.string(),
  trackSlug: z.string(),
  slug: z.string(),
  /** Absolute path to the exercise directory. */
  directory: z.string(),
  files: z.array(ExerciseFile),
})
export type LocalExercise = z.infer<typeof LocalExercise>

export const TestOutcome = z.enum(["passed", "failed", "error", "skipped"])
export type TestOutcome = z.infer<typeof TestOutcome>

export const TestCaseResult = z.object({
  name: z.string(),
  outcome: TestOutcome,
  message: z.string().default(""),
})
export type TestCaseResult = z.infer<typeof TestCaseResult>

/** Normalised test report: every language runner produces this shape. */
export const TestReport = z.object({
  trackSlug: z.string(),
  slug: z.string(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  cases: z.array(TestCaseResult).default([]),
  /** Raw runner output, trimmed, for the human and the model. */
  raw: z.string().default(""),
  durationMs: z.number().int().nonnegative().default(0),
  /** Command that was executed, for transparency. */
  command: z.string().default(""),
  exitCode: z.number().int().optional(),
})
export type TestReport = z.infer<typeof TestReport>

export function testReportSucceeded(report: Pick<TestReport, "failed" | "total">): boolean {
  return report.total > 0 && report.failed === 0
}

/** Result of uploading a solution to the platform. */
export const SubmitResult = z.object({
  ok: z.boolean(),
  status: z.enum(["submitted", "accepted", "rejected", "pending", "unchanged"]).optional(),
  /** Human-readable summary from the CLI (URL, status line, or the error). */
  message: z.string().default(""),
  /** The solution page on the platform, when the CLI reports one. */
  url: z.string().optional(),
  /** Raw CLI output, kept for the human and the model. */
  raw: z.string().default(""),
  /**
   * True when the platform marked the exercise complete, which is what unlocks
   * the next tasks. Undefined for sources where a successful submit is itself
   * the completion signal; false when the platform still has not completed it.
   */
  completed: z.boolean().optional(),
  /** Tasks the platform unlocked by completing this exercise. */
  unlocked: z.array(z.string()).optional(),
})
export type SubmitResult = z.infer<typeof SubmitResult>

export const SubmitState = z.enum(["idle", "submitting", "submitted", "failed"])
export type SubmitState = z.infer<typeof SubmitState>
