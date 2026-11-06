import { join, resolve } from "node:path"
import { existsSync } from "node:fs"
import type { SessionState } from "@solvebench/shared"
import { SessionState as SessionStateSchema } from "@solvebench/shared"
import { openDatabase, ExerciseProgressRepository } from "@solvebench/storage"
import { createDefaultRegistry, resolveExercismConfig, ToolchainManager } from "@solvebench/exercise"
import { ExerciseController } from "./exercise-controller"
import type { ExerciseSource } from "@solvebench/exercise"
import type { ModelProvider } from "@solvebench/agent-runtime"
import { connectionStatus, createProvider, loadConfig, type ConnectionStatus } from "@solvebench/agent-runtime"
import type { AppController } from "./controller"
import { createSessionStore } from "./store"
import { AppController as Controller } from "./controller"

export interface BootstrapOptions {
  repoRoot?: string
  dbPath?: string
  /** Composition ports for embedding and deterministic integration tests. */
  exerciseSource?: ExerciseSource
  modelProvider?: ModelProvider
  prepareEnvironment?: boolean
  initialSource?: string
}

export interface BootstrappedApp {
  controller: AppController
  /** Exercise workflow, wired to the same provider and storage. */
  exercise: ExerciseController
  /** Reactive store value; pass this to <App state={...} />. */
  state: SessionState
  store: ReturnType<typeof createSessionStore>
  /** Resolved provider connection state, for display. */
  connection: ConnectionStatus
  /** Non-fatal config warnings (bad file, missing key, ...). */
  warnings: string[]
}

/**
 * Composes the shipping pipeline: exercise workspace -> language toolchains ->
 * sqlite progress -> provider -> TUI controller. This is the shipping wiring;
 * tests exercise the same composition.
 */
export async function bootstrapApp(options: BootstrapOptions = {}): Promise<BootstrappedApp> {
  const repoRoot = options.repoRoot ?? process.cwd()
  const currentData = join(repoRoot, ".solvebench")
  const legacyData = join(repoRoot, ".pairharness")
  const dataDirectory = !existsSync(currentData) && existsSync(legacyData) ? legacyData : currentData
  const dbPath = options.dbPath ?? join(dataDirectory, dataDirectory === legacyData ? "pairharness.db" : "solvebench.db")

  const db = openDatabase(dbPath)

  const sessionId = crypto.randomUUID()
  const state = SessionStateSchema.parse({ id: sessionId, repoRoot, mode: "pair", driver: "human" })
  const store = createSessionStore(state)

  // Exercise workflow: registered sources, isolated workspace, persisted progress.
  const exercismConfig = resolveExercismConfig({ projectRoot: repoRoot })
  const toolchains = new ToolchainManager(join(dataDirectory, "toolchains"))
  const registry = createDefaultRegistry()
  const sources = registry.createAll({
    repoRoot,
    workspace: exercismConfig.workspace,
    dataDirectory,
    toolchains,
    exercismConfig,
  })
  const requestedSource = options.initialSource ?? (exercismConfig.token ? "exercism" : "local")
  const exerciseSource = options.exerciseSource ?? sources[requestedSource] ?? sources.local!
  const exerciseProgress = new ExerciseProgressRepository(db)
  const exercise: ExerciseController = new ExerciseController({
    source: exerciseSource,
    sources,
    sampleDirectory: resolve(import.meta.dir, "../../../examples/local-exercises"),
    workspace: exercismConfig.workspace,
    progress: exerciseProgress,
    prepare: options.prepareEnvironment === false ? undefined : (track, directory, report) => {
      const source = exercise.deps.source
      return source.prepareEnvironment
        ? source.prepareEnvironment(track, directory, report)
        : toolchains.prepare(track, directory, report)
    },
  })

  const loadedConfig = loadConfig(repoRoot)
  const connection = connectionStatus(loadedConfig)
  const provider = options.modelProvider ?? createProvider(loadedConfig.config.provider)

  const controller = new Controller({
    store,
    provider,
    // The tutor always receives the active exercise: statement, on-screen code
    // and the last test result. Nothing to attach by hand.
    exerciseContext: () => {
      const s = exercise.getState()
      if (!s.problem || !s.openedTrack) return undefined
      const report = s.lastReport
      return {
        source: exercise.deps.source.id,
        track: s.openedTrack,
        slug: s.problem.slug,
        title: s.problem.title,
        difficulty: s.problem.difficulty,
        statement: s.problem.body,
        revision: s.revision,
        solutionFiles: s.buffers,
        testFiles: s.testFiles,
        ...(report
          ? {
              lastTest: {
                passed: report.passed,
                failed: report.failed,
                total: report.total,
                command: report.command,
                raw: report.raw,
                revision: s.reportRevision ?? undefined,
                stale: s.reportRevision !== s.revision,
                failing: report.cases
                  .filter((c) => c.outcome === "failed" || c.outcome === "error")
                  .map((c) => c.name)
                  .slice(0, 10),
              },
            }
          : {}),
      }
    },
  })
  // Session wiring belongs to the composition root, not a mount-time UI hook.
  exercise.deps.onOpenFile = (path, content) => {
    const s = exercise.getState()
    controller.activateTask(s.openedSlug ? `${exercise.deps.source.id}/${s.openedTrack}/${s.openedSlug}` : "scratch")
    controller.setActiveFile(path || undefined, content)
  }

  return {
    controller,
    exercise,
    store,
    state: store.state,
    connection,
    warnings: loadedConfig.warnings,
  }
}
