import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ExerciseProgressRepository, openDatabase, progressKey } from "../src/index"

const dirs: string[] = []
async function tempDb(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "solvebench-progress-"))
  dirs.push(dir)
  return join(dir, "ph.db")
}
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true })
})

describe("ExerciseProgressRepository", () => {
  test("records a start and survives a reopen", async () => {
    const path = await tempDb()
    {
      const db = openDatabase(path)
      new ExerciseProgressRepository(db).markStarted("exercism", "python", "hello-world")
      db.close()
    }
    const db = openDatabase(path)
    const record = new ExerciseProgressRepository(db).get("exercism", "python", "hello-world")
    db.close()
    expect(record).not.toBeNull()
    expect(record!.status).toBe("started")
    expect(record!.attempts).toBe(1)
  })

  test("a passing local run records the attempt but is not platform acceptance", async () => {
    const db = openDatabase(await tempDb())
    const repo = new ExerciseProgressRepository(db)
    repo.markStarted("exercism", "python", "two-fer")
    repo.recordRun("exercism", "python", "two-fer", 0, 3)
    let record = repo.get("exercism", "python", "two-fer")!
    expect(record.status).toBe("started")
    expect(record.attempts).toBe(2)
    expect(record.lastFailed).toBe(3)

    repo.recordRun("exercism", "python", "two-fer", 3, 0)
    record = repo.get("exercism", "python", "two-fer")!
    expect(record.status).toBe("started")
    expect(record.completedAt).toBeNull()
    repo.markCompleted("exercism", "python", "two-fer")
    expect(repo.get("exercism", "python", "two-fer")!.status).toBe("completed")
    db.close()
  })

  test("completion is sticky: a later failing run does not re-open it", async () => {
    const db = openDatabase(await tempDb())
    const repo = new ExerciseProgressRepository(db)
    repo.recordRun("exercism", "python", "x", 5, 0)
    repo.markCompleted("exercism", "python", "x")
    expect(repo.get("exercism", "python", "x")!.status).toBe("completed")
    repo.recordRun("exercism", "python", "x", 2, 3)
    const record = repo.get("exercism", "python", "x")!
    expect(record.status).toBe("completed")
    expect(record.lastFailed).toBe(3)
    expect(record.attempts).toBe(2)
    db.close()
  })

  test("forTrack lists only that track and summary counts by status", async () => {
    const db = openDatabase(await tempDb())
    const repo = new ExerciseProgressRepository(db)
    repo.recordRun("exercism", "python", "a", 1, 0)
    repo.markCompleted("exercism", "python", "a")
    repo.recordRun("exercism", "python", "b", 0, 1)
    repo.recordRun("exercism", "rust", "c", 1, 0)
    expect(repo.forTrack("exercism", "python")).toHaveLength(2)
    expect(repo.forTrack("exercism", "python").some((r) => r.trackSlug === "rust")).toBe(false)
    expect(repo.summary("exercism", "python")).toEqual({ started: 1, completed: 1 })
    db.close()
  })

  test("all() can filter by source", async () => {
    const db = openDatabase(await tempDb())
    const repo = new ExerciseProgressRepository(db)
    repo.recordRun("exercism", "python", "a", 1, 0)
    repo.recordRun("leetcode", "arrays", "two-sum", 1, 0)
    expect(repo.all("exercism")).toHaveLength(1)
    expect(repo.all()).toHaveLength(2)
    db.close()
  })

  test("progressKey is stable and distinct", () => {
    expect(progressKey("exercism", "python", "a")).toBe(progressKey("exercism", "python", "a"))
    expect(progressKey("exercism", "python", "a")).not.toBe(progressKey("exercism", "python", "b"))
  })
})

describe("schema migration", () => {
  test("a fresh database has only the exercise_progress table and a current version", async () => {
    const db = openDatabase(await tempDb())
    const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version
    const table = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='exercise_progress'")
      .get() as { name: string } | null
    const legacyNames = ["sessions", "findings", "transactions", "graph_nodes", "audit_log"]
    const present = legacyNames.filter(name =>
      db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) !== null,
    )
    db.close()
    expect(version).toBe(3)
    expect(table?.name).toBe("exercise_progress")
    // The legacy pair-programming tables are gone from a fresh database.
    expect(present).toEqual([])
  })
})
