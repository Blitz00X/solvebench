// Explicit preload so the TUI runs from ANY working directory, not only the
// repository root. Relying on bunfig.toml alone breaks `bun /path/main.tsx`
// from another cwd, where Solid would fall back to the React JSX runtime.
import "@opentui/solid/preload"
import { render } from "@opentui/solid"
import { App } from "./app"
import { bootstrapApp } from "./bootstrap"
import { resolve } from "node:path"
import metadata from "../../../package.json"

export { bootstrapApp } from "./bootstrap"
export { AppController } from "./controller"
export { App } from "./app"
export { createSessionStore } from "./store"

export interface CliArgs {
  repoRoot?: string
  help?: boolean
  version?: boolean
  sample?: boolean
}

/** Parses `--repo <path>` from argv. */
export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--help" || arg === "-h") args.help = true
    else if (arg === "--version" || arg === "-v") args.version = true
    else if (arg === "--sample") args.sample = true
    else if (arg === "--repo") {
      const value = argv[i + 1]
      if (value && !value.startsWith("--")) {
        args.repoRoot = value
        i++
      }
    } else if (arg.startsWith("--repo=")) {
      args.repoRoot = arg.slice("--repo=".length)
    }
  }
  return args
}

/**
 * Real entry point. Composes the shipping pipeline (exercise workspace ->
 * toolchains -> sqlite progress -> provider) and renders the TUI.
 *
 * Usage:
 *   bun run dev                      # workspace: the current directory
 *   bun run dev -- --repo ~/project  # workspace: another directory
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (args.help) {
    console.log(`SolveBench ${metadata.version}
Usage: solvebench [--sample] [--repo PATH]

  --sample       Open the built-in Python sample without a platform account
  --repo PATH    Use PATH for exercises, connections and local progress
  --help, -h     Show this help without starting the terminal UI
  --version, -v  Print the installed version

In the UI: Ctrl+O imports exercises; F5 saves and tests; ? shows shortcuts.
Ctrl+C exits safely. Sample tests require Python 3; no model key is required.
AI uses your configured provider; mock mode is an offline demonstration.`)
    return
  }
  if (args.version) { console.log(`solvebench ${metadata.version}`); return }
  const repoRoot = resolve(args.repoRoot ?? process.cwd())
  const app = await bootstrapApp({ repoRoot, ...(args.sample ? { initialSource: "local" } : {}) })
  if (args.sample) {
    await app.exercise.init()
    const result = await app.exercise.trySample()
    if (!result.ok) throw new Error(result.error.detail)
  }
  for (const warning of app.warnings) console.error(`solvebench config: ${warning}`)
  for (const warning of app.connection.ok ? [] : [app.connection.note]) {
    console.error(`solvebench provider: ${warning}`)
  }
  await render(() => (
    <App
      state={app.store.state}
      controller={app.controller}
      providerLabel={app.connection.kind === "mock" ? "Offline demo · no AI model connected" : `${app.connection.kind}:${app.connection.model}`}
      exercise={app.exercise}
    />
  ), { exitOnCtrlC: false })
}

if (import.meta.main) {
  void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
