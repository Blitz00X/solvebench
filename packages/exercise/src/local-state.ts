import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { ExerciseProgress, ExerciseSummary, Problem } from "./types"

export interface LocalExerciseState {
  trackSlug: string
  slug: string
  directory: string
  /** Files that look like solutions (source files, excluding tests). */
  solutionFiles: string[]
  testFiles: string[]
  /** True when the platform metadata file is present. */
  hasMetadata: boolean
}

const SOURCE_EXTENSIONS = [".py", ".js", ".ts", ".go", ".java", ".rs", ".c", ".cpp", ".h", ".sh", ".bash"]

const TEST_MARKERS = ["_test.", ".test.", ".spec.", "_test_", "test_"]

export function isTestFile(path: string): boolean {
  const base = path.split("/").pop() ?? path
  if (base.endsWith(".bats")) return true
  return TEST_MARKERS.some((marker) => base.includes(marker))
}

export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))
}

/**
 * Scans one exercise directory on disk. This is the truth about what exists
 * locally, independent of any platform API.
 */
export async function scanExercise(trackSlug: string, slug: string, directory: string): Promise<LocalExerciseState | null> {
  if (!existsSync(directory)) return null
  const files: string[] = []
  const walk = async (current: string, prefix: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "build" || entry.name === "target" || entry.name === ".git") continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (entry.name === ".exercism") continue
        await walk(join(current, entry.name), rel)
      } else {
        files.push(rel)
      }
    }
  }
  await walk(directory, "")

  const sources = files.filter(isSourceFile)
  return {
    trackSlug,
    slug,
    directory,
    solutionFiles: sources.filter((f) => !isTestFile(f)),
    testFiles: sources.filter(isTestFile),
    // The metadata directory is skipped while walking, so check it directly.
    hasMetadata: existsSync(join(directory, ".exercism", "config.json")),
  }
}

/** Scans every exercise under a track directory. */
export async function scanTrackWorkspace(workspace: string, trackSlug: string): Promise<LocalExerciseState[]> {
  const trackDir = join(workspace, trackSlug)
  if (!existsSync(trackDir)) return []
  const entries = await readdir(trackDir, { withFileTypes: true })
  const out: LocalExerciseState[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const state = await scanExercise(trackSlug, entry.name, join(trackDir, entry.name))
    if (state) out.push(state)
  }
  return out
}

/**
 * Merges the platform's exercise list with local disk state and persisted
 * progress, so the UI can mark each exercise as locked / available / started /
 * completed with a single authoritative value.
 */
export function mergeProgress(
  exercise: ExerciseSummary,
  local: LocalExerciseState | undefined,
  persisted: { status: "started" | "completed" } | null,
): ExerciseProgress {
  // A completed run wins over everything.
  if (persisted?.status === "completed") return "completed"
  // Started locally: either it is on disk or the product recorded an attempt.
  if (local || persisted?.status === "started") {
    return exercise.progress === "locked" ? "started" : "started"
  }
  // Otherwise trust the platform's locked/available state.
  return exercise.progress === "completed" ? "completed" : exercise.progress
}

/** Reads the solution files' content for the editor. */
export async function readSolutionFiles(directory: string, files: readonly string[]): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = []
  for (const path of files) {
    try {
      out.push({ path, content: await readFile(join(directory, path), "utf8") })
    } catch {
      // skip unreadable
    }
  }
  return out
}

/** The file the editor should open first for an exercise. */
export function primarySolutionFile(local: LocalExerciseState, problem?: Problem): string | null {
  if (problem && problem.solutionFiles.length > 0) {
    const declared = problem.solutionFiles.find((f) => local.solutionFiles.includes(f))
    if (declared) return declared
    if (local.solutionFiles.includes(problem.solutionFiles[0]!)) return problem.solutionFiles[0]!
  }
  return local.solutionFiles.sort()[0] ?? local.testFiles.sort()[0] ?? null
}
