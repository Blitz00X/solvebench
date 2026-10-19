#!/usr/bin/env bun
/**
 * Live catalog smoke test. Proves the Exercism data layer works against the
 * real API: tracks, per-track exercises with progress, and a full problem for a
 * downloaded exercise. Skips cleanly (exit 0) when no token is configured, so
 * the suite stays usable offline.
 */
import { resolveExercismConfig } from "../packages/exercise/src/config"
import { ExercismSource } from "../packages/exercise/src/exercism-source"

const config = resolveExercismConfig({ projectRoot: process.cwd() })
const source = new ExercismSource({ config })

if (!(await source.isConfigured())) {
  console.log("verify:catalog SKIP — no exercism token configured")
  process.exit(0)
}

const failures: string[] = []
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} - ${label}${detail ? ` (${detail})` : ""}`)
  if (!ok) failures.push(label)
}

const tracks = await source.listTracks()
check("listTracks returns tracks", tracks.ok && tracks.value.length > 20, tracks.ok ? `${tracks.value.length} tracks` : tracks.error.detail)

const python = await source.listExercises("python")
check("listExercises(python) returns exercises", python.ok && python.value.length > 50, python.ok ? `${python.value.length} exercises` : python.error.detail)

if (python.ok) {
  const states = new Set(python.value.map((e) => e.progress))
  check("progress states are present", states.has("locked") || states.size > 1, [...states].join(","))
  check("every exercise has a title", python.value.every((e) => e.title.length > 0))
}

const problem = await source.getProblem("python", "hello-world")
check("getProblem returns a real statement", problem.ok && problem.value.body.length > 50, problem.ok ? `${problem.value.body.length} chars` : problem.error.detail)

if (failures.length) {
  console.error(`\nverify:catalog FAILED (${failures.length})`)
  process.exit(1)
}
console.log("\nverify:catalog passed")
