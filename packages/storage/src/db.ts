import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

export const SCHEMA_VERSION = 3

/**
 * The workbench persists only per-exercise progress. The earlier
 * pair-programming schema (sessions, findings, transactions, graph, audit) is
 * gone; migration 3 drops those tables from databases created before the pivot.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercise_progress (
    source_id TEXT NOT NULL,
    track_slug TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_passed INTEGER NOT NULL DEFAULT 0,
    last_failed INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, track_slug, slug)
  );

  CREATE INDEX IF NOT EXISTS idx_exercise_track ON exercise_progress(source_id, track_slug);
  CREATE INDEX IF NOT EXISTS idx_exercise_status ON exercise_progress(status);
  `,
  // Version 2 existed before the pivot; kept as a marker so version numbering
  // stays continuous for databases that already applied it.
  `SELECT 1;`,
  `
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS findings;
  DROP TABLE IF EXISTS transactions;
  DROP TABLE IF EXISTS graph_nodes;
  DROP TABLE IF EXISTS graph_edges;
  DROP TABLE IF EXISTS audit_log;
  DROP TABLE IF EXISTS context_artifacts;
  `,
]

/**
 * Opens (and migrates) a SQLite database. Versioned migrations only move
 * forward; a corrupt database is never silently reset. The parent directory is
 * created when missing so callers can pass a nested path safely.
 */
export function openDatabase(path: string): Database {
  if (path !== ":memory:") {
    const dir = dirname(path)
    if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  const db = new Database(path, { create: true, strict: false })
  db.run("PRAGMA foreign_keys = ON;")
  db.run("PRAGMA journal_mode = WAL;")

  const current = readUserVersion(db)
  if (current > SCHEMA_VERSION) {
    db.close()
    throw new Error(`database schema is newer (${current}) than supported (${SCHEMA_VERSION})`)
  }
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    const sql = MIGRATIONS[v - 1]
    if (!sql) throw new Error(`missing migration for version ${v}`)
    db.transaction(() => {
      db.run(sql)
      db.run("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)", [v, Date.now()])
      db.run(`PRAGMA user_version = ${v}`)
    })()
  }
  return db
}

function readUserVersion(db: Database): number {
  const row = db.query("PRAGMA user_version").get() as { user_version?: number } | null
  return row?.user_version ?? 0
}
