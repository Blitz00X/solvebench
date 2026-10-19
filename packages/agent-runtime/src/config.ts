import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

/**
 * Local provider configuration. This file is read from the repository root and
 * is gitignored by default: it may name an environment variable, and the value
 * itself is never written here.
 */
export const ProviderConfigSchema = z.object({
  kind: z.enum(["mock", "http"]).default("mock"),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).optional(),
  /** Name of the environment variable holding the key (not the key itself). */
  apiKeyEnv: z.string().min(1).default("SOLVEBENCH_API_KEY"),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeoutMs: z.number().int().positive().optional(),
  /**
   * Thinking budget for reasoning models. "none" disables thinking, which is
   * both faster and keeps the transcript free of internal monologue.
   */
  reasoningEffort: z.enum(["none", "low", "medium", "high"]).optional(),
})
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  kind: "mock",
  apiKeyEnv: "SOLVEBENCH_API_KEY",
}

export const SolveBenchConfigSchema = z.object({
  provider: ProviderConfigSchema.default(() => DEFAULT_PROVIDER_CONFIG),
})
export type SolveBenchConfig = z.infer<typeof SolveBenchConfigSchema>

export const CONFIG_FILENAME = "solvebench.config.json"

export interface LoadedConfig {
  config: SolveBenchConfig
  /** Where the config came from, for display. */
  source: string
  /** Non-fatal problems, e.g. malformed file. */
  warnings: string[]
}

/**
 * Loads provider configuration. Search order:
 *   1. <repoRoot>/solvebench.config.json
 *   2. <repoRoot>/pairharness.config.json (legacy)
 *   3. $XDG_CONFIG_HOME/solvebench/config.json (or ~/.config/...)
 *   4. $XDG_CONFIG_HOME/pairharness/config.json (legacy)
 * A missing file is not an error: the deterministic mock is the default.
 */
export function loadConfig(repoRoot: string, home = process.env.HOME ?? ""): LoadedConfig {
  const warnings: string[] = []
  const candidates = [
    { path: join(repoRoot, CONFIG_FILENAME), label: CONFIG_FILENAME },
    { path: join(repoRoot, "pairharness.config.json"), label: "pairharness.config.json (legacy)" },
    {
      path: join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "solvebench", "config.json"),
      label: "~/.config/solvebench/config.json",
    },
    {
      path: join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "pairharness", "config.json"),
      label: "~/.config/pairharness/config.json (legacy)",
    },
  ]
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue
    try {
      const raw = JSON.parse(readFileSync(candidate.path, "utf8")) as unknown
      const config = SolveBenchConfigSchema.parse(raw)
      if (config.provider.kind === "http" && !config.provider.baseUrl) {
        warnings.push(`${candidate.label}: provider.kind is "http" but baseUrl is missing; using the mock`)
        return { config: { provider: { kind: "mock", apiKeyEnv: config.provider.apiKeyEnv } }, source: candidate.label, warnings }
      }
      return { config, source: candidate.label, warnings }
    } catch (error) {
      warnings.push(`${candidate.label}: ${error instanceof Error ? error.message : "invalid config"}`)
      return { config: { provider: { kind: "mock", apiKeyEnv: "SOLVEBENCH_API_KEY" } }, source: candidate.label, warnings }
    }
  }
  return { config: { provider: { kind: "mock", apiKeyEnv: "SOLVEBENCH_API_KEY" } }, source: "(defaults)", warnings }
}

/** The key is read at call time and never returned in full by describe paths. */
export function resolveApiKey(config: Pick<ProviderConfig, "apiKeyEnv"> & Partial<ProviderConfig>, env: Record<string, string | undefined> = process.env): string | undefined {
  return config.apiKeyEnv === "SOLVEBENCH_API_KEY"
    ? env.SOLVEBENCH_API_KEY || env.PAIRHARNESS_API_KEY
    : env[config.apiKeyEnv]
}

export interface ConnectionStatus {
  kind: "mock" | "http"
  model: string
  baseUrl?: string
  apiKeyEnv: string
  hasKey: boolean
  source: string
  ok: boolean
  note: string
}

/** Human-readable connection state for /config and the status bar. */
export function connectionStatus(loaded: LoadedConfig, env: Record<string, string | undefined> = process.env): ConnectionStatus {
  const provider = loaded.config.provider
  if (provider.kind === "mock") {
    return {
      kind: "mock",
      model: "mock",
      apiKeyEnv: provider.apiKeyEnv,
      hasKey: false,
      source: loaded.source,
      ok: true,
      note: "deterministic offline provider",
    }
  }
  const hasKey = Boolean(resolveApiKey(provider, env))
  return {
    kind: "http",
    model: provider.model ?? "(unset)",
    ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
    apiKeyEnv: provider.apiKeyEnv,
    hasKey,
    source: loaded.source,
    ok: hasKey,
    note: hasKey ? "ready" : `set ${provider.apiKeyEnv} to enable`,
  }
}

/** Writes a starter config so the user has something to edit. */
export function configTemplate(): string {
  return JSON.stringify(
    {
      provider: {
        kind: "http",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEnv: "SOLVEBENCH_API_KEY",
      },
    },
    null,
    2,
  )
}
