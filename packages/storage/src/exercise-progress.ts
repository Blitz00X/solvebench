import { createHash } from "node:crypto"
import type { Database } from "bun:sqlite"

export type ProgressStatus = "started" | "completed"

export interface ExerciseProgressRecord {
  sourceId: string
  trackSlug: string
  slug: string
  status: ProgressStatus
  attempts: number
  lastPassed: number
  lastFailed: number
  lastRunAt: number | null
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

/**
 * Per-exercise progress. This is the product's own record of what has been
 * worked on: it survives restarts and is independent of the platform's view.
 */
export class ExerciseProgressRepository {
  constructor(private readonly db: Database) {}

  /** Records the start of an exercise attempt (download/open). */
  markStarted(sourceId: string, trackSlug: string, slug: string): void {
    const now = Date.now()
    this.db.run(
      `INSERT INTO exercise_progress (source_id, track_slug, slug, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, 'started', 1, ?, ?)
       ON CONFLICT(source_id, track_slug, slug) DO UPDATE SET
         status = CASE WHEN exercise_progress.status = 'completed' THEN 'completed' ELSE 'started' END,
         updated_at = excluded.updated_at`,
      [sourceId, trackSlug, slug, now, now],
    )
  }

  /**
   * Marks an exercise completed directly, e.g. after a successful submission.
   * Idempotent: a second call does not move the completion timestamp.
   */
  markCompleted(sourceId: string, trackSlug: string, slug: string): void {
    const now = Date.now()
    this.db.run(
      `INSERT INTO exercise_progress (source_id, track_slug, slug, status, attempts, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'completed', 1, ?, ?, ?)
       ON CONFLICT(source_id, track_slug, slug) DO UPDATE SET
         status = 'completed',
         completed_at = COALESCE(exercise_progress.completed_at, excluded.completed_at),
         updated_at = excluded.updated_at`,
      [sourceId, trackSlug, slug, now, now, now],
    )
  }

  /** Records a test run: increments attempts, stores the latest counts. */
  recordRun(sourceId: string, trackSlug: string, slug: string, passed: number, failed: number): void {
    // Passing local tests is not server acceptance. Completion is synchronized
    // from the platform or recorded by markCompleted after an accepted judge.
    const completed = false
    const now = Date.now()
    this.db.run(
      `INSERT INTO exercise_progress (source_id, track_slug, slug, status, attempts, last_passed, last_failed, last_run_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id, track_slug, slug) DO UPDATE SET
         status = CASE WHEN excluded.status = 'completed' THEN 'completed' ELSE exercise_progress.status END,
         attempts = exercise_progress.attempts + 1,
         last_passed = excluded.last_passed,
         last_failed = excluded.last_failed,
         last_run_at = excluded.last_run_at,
         completed_at = COALESCE(excluded.completed_at, exercise_progress.completed_at),
         updated_at = excluded.updated_at`,
      [
        sourceId,
        trackSlug,
        slug,
        completed ? "completed" : "started",
        passed,
        failed,
        now,
        completed ? now : null,
        now,
        now,
      ],
    )
  }

  get(sourceId: string, trackSlug: string, slug: string): ExerciseProgressRecord | null {
    const row = this.db
      .query("SELECT * FROM exercise_progress WHERE source_id = ? AND track_slug = ? AND slug = ?")
      .get(sourceId, trackSlug, slug) as RawProgress | null
    return row ? toRecord(row) : null
  }

  forTrack(sourceId: string, trackSlug: string): ExerciseProgressRecord[] {
    const rows = this.db
      .query("SELECT * FROM exercise_progress WHERE source_id = ? AND track_slug = ? ORDER BY updated_at DESC")
      .all(sourceId, trackSlug) as RawProgress[]
    return rows.map(toRecord)
  }

  all(sourceId?: string): ExerciseProgressRecord[] {
    const rows = sourceId
      ? (this.db.query("SELECT * FROM exercise_progress WHERE source_id = ? ORDER BY updated_at DESC").all(sourceId) as RawProgress[])
      : (this.db.query("SELECT * FROM exercise_progress ORDER BY updated_at DESC").all() as RawProgress[])
    return rows.map(toRecord)
  }

  /** Counts by status for one track, for the header line. */
  summary(sourceId: string, trackSlug: string): { started: number; completed: number } {
    const rows = this.db
      .query("SELECT status, COUNT(*) AS c FROM exercise_progress WHERE source_id = ? AND track_slug = ? GROUP BY status")
      .all(sourceId, trackSlug) as { status: string; c: number }[]
    let started = 0
    let completed = 0
    for (const row of rows) {
      if (row.status === "completed") completed += row.c
      else started += row.c
    }
    return { started, completed }
  }
}

interface RawProgress {
  source_id: string
  track_slug: string
  slug: string
  status: string
  attempts: number
  last_passed: number
  last_failed: number
  last_run_at: number | null
  completed_at: number | null
  created_at: number
  updated_at: number
}

function toRecord(row: RawProgress): ExerciseProgressRecord {
  return {
    sourceId: row.source_id,
    trackSlug: row.track_slug,
    slug: row.slug,
    status: row.status === "completed" ? "completed" : "started",
    attempts: row.attempts,
    lastPassed: row.last_passed,
    lastFailed: row.last_failed,
    lastRunAt: row.last_run_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function progressKey(sourceId: string, trackSlug: string, slug: string): string {
  return createHash("sha256").update(`${sourceId}\u0000${trackSlug}\u0000${slug}`).digest("hex").slice(0, 16)
}
