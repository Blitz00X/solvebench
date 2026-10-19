import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface ExercismConfig {
  /** API base URL, e.g. https://api.exercism.org/v1. */
  apiBaseUrl: string
  /** Bearer token for the API. Never logged. */
  token: string
  /** Absolute path of the local workspace for this project. */
  workspace: string
  /** Directory holding the exercism CLI's own config when isolated. */
  configHome: string
  /** Path to the exercism binary. */
  cliPath: string
}

export interface ExercismConfigOverrides {
  projectRoot: string
  apiBaseUrl?: string
  token?: string
  workspace?: string
  configHome?: string
  cliPath?: string
  /** Read the user's existing ~/.config/exercism/user.json as a fallback. */
  fallbackToUserConfig?: boolean
}

export const DEFAULT_API_BASE = "https://api.exercism.org"

function userConfigPath(configHomeOverride?: string): string {
  if (configHomeOverride) return join(configHomeOverride, "exercism", "user.json")
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "exercism", "user.json")
}

function readUserConfig(configHomeOverride?: string): Partial<{ apibaseurl: string; token: string; workspace: string }> {
  const path = userConfigPath(configHomeOverride)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, "utf8")) as { apibaseurl?: string; token?: string; workspace?: string }
  } catch {
    return {}
  }
}

/**
 * Resolves the Exercism connection.
 *
 * The workspace always lives inside the SolveBench project so the exercise
 * files travel with the repo, and the CLI runs with its own config home so the
 * user's existing ~/.config/exercism setup is never modified. The token is read
 * from the environment first, then from the user's existing config, so the
 * product works out of the box on this machine.
 */
export function resolveExercismConfig(overrides: ExercismConfigOverrides): ExercismConfig {
  const fallback = overrides.fallbackToUserConfig === false ? {} : readUserConfig()
  const configHome = overrides.configHome ?? process.env.EXERCISM_CONFIG_HOME ?? join(overrides.projectRoot, ".exercism-cli")
  let local: { token?: string } = {}
  try { local = JSON.parse(readFileSync(join(configHome, "user.json"), "utf8")) } catch { /* first launch */ }
  // The CLI stores a v1 base URL, but every endpoint the product uses lives on
  // the v2 root; an explicit override or EXERCISM_API_BASE always wins.
  const normaliseBase = (url: string) => url.replace(/\/v1\/?$/, "")
  return {
    apiBaseUrl: normaliseBase(overrides.apiBaseUrl ?? process.env.EXERCISM_API_BASE ?? fallback.apibaseurl ?? DEFAULT_API_BASE),
    token: overrides.token ?? process.env.EXERCISM_API_TOKEN ?? local.token ?? fallback.token ?? "",
    workspace: overrides.workspace ?? process.env.EXERCISM_WORKSPACE ?? join(overrides.projectRoot, "exercises"),
    configHome,
    cliPath: overrides.cliPath ?? process.env.EXERCISM_CLI ?? join(homedir(), ".local", "bin", "exercism"),
  }
}

export function isConfigured(config: ExercismConfig): boolean {
  return config.token.length > 0 && config.apiBaseUrl.length > 0
}
