import { join } from "node:path"
import type { ExercismConfig } from "./config"
import { CsesSource } from "./cses-source"
import { ExercismSource } from "./exercism-source"
import { LeetCodeSource } from "./leetcode-source"
import { LocalExerciseSource } from "./local-source"
import type { ExerciseSource } from "./source"
import type { ToolchainManager } from "./toolchains"

/**
 * Everything a source needs from the composition root. Keeping this explicit
 * means a new source can be added without reaching into the TUI or bootstrap.
 */
export interface SourceContext {
  repoRoot: string
  /** Shared exercise workspace; sources may use a subdirectory of their own. */
  workspace: string
  /** Owner-local state directory (.solvebench). */
  dataDirectory: string
  toolchains: ToolchainManager
  exercismConfig: ExercismConfig
}

export interface SourceDefinition {
  /** Stable id, used in progress records and task keys. */
  id: string
  label: string
  create(context: SourceContext): ExerciseSource
}

/**
 * Central source registry. Adding a platform is one `register` call plus the
 * source class; the TUI already renders whatever this registry returns.
 */
export class SourceRegistry {
  private readonly definitions = new Map<string, SourceDefinition>()

  register(definition: SourceDefinition): this {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(definition.id)) {
      throw new Error(`Invalid source id: ${definition.id}`)
    }
    if (this.definitions.has(definition.id)) {
      throw new Error(`Source already registered: ${definition.id}`)
    }
    this.definitions.set(definition.id, definition)
    return this
  }

  list(): SourceDefinition[] {
    return [...this.definitions.values()]
  }

  create(id: string, context: SourceContext): ExerciseSource | undefined {
    return this.definitions.get(id)?.create(context)
  }

  createAll(context: SourceContext): Record<string, ExerciseSource> {
    const sources: Record<string, ExerciseSource> = {}
    for (const definition of this.definitions.values()) {
      sources[definition.id] = definition.create(context)
    }
    return sources
  }
}

/**
 * The shipped sources. A new platform belongs here, after its class is added to
 * the package index; the registry supplies it to the source picker, the
 * progress store and the assistant context automatically.
 */
export function createDefaultRegistry(): SourceRegistry {
  return new SourceRegistry()
    .register({
      id: "exercism",
      label: "Exercism",
      create: (context) => new ExercismSource({ config: context.exercismConfig, toolchains: context.toolchains }),
    })
    .register({
      id: "leetcode",
      label: "LeetCode",
      create: (context) => new LeetCodeSource(join(context.repoRoot, "exercises/leetcode")),
    })
    .register({
      id: "local",
      label: "Local",
      create: (context) => new LocalExerciseSource(join(context.repoRoot, "exercises/local")),
    })
    .register({
      id: "cses",
      label: "CSES",
      create: (context) => new CsesSource({ workspace: join(context.repoRoot, "exercises/cses") }),
    })
}
