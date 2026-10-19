import { test, expect } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { ToolchainManager, type Execute } from "../src/toolchains"

test("an already suitable Python/pytest environment causes no downloads or installs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tools-")), commands: string[][] = [], downloads: string[] = []
  try {
    const run: Execute = async args => { commands.push(args); return { code: 0, output: args.includes("pytest") ? "pytest 9.1.1" : "Python 3.12.3" } }
    const manager = new ToolchainManager(root, run, (async url => { downloads.push(String(url)); return new Response("") }) as typeof fetch)
    const progress: string[] = []
    await manager.prepare("python", root, text => progress.push(text))
    await manager.prepare("python", root, text => progress.push(text))
    expect(commands).toHaveLength(2)
    expect(downloads).toHaveLength(0)
    expect(progress.at(-1)).toContain("ready")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("an outdated Rust compiler triggers the managed installer, respects edition2024 and preserves system paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "rust-tools-")), commands: string[][] = [], downloads: string[] = []
  try {
    const directory = join(root, "task"); await mkdir(directory); await writeFile(join(directory, "Cargo.toml"), '[package]\nedition="2024"')
    const manager = new ToolchainManager(join(root, "managed"), async args => { commands.push(args); return { code: 0, output: args[0] === "rustc" ? "rustc 1.75.0" : "installed" } },
      (async url => { downloads.push(String(url)); return new Response("installer fixture") }) as typeof fetch)
    await manager.prepare("rust", directory, () => {})
    expect(downloads[0]).toContain("static.rust-lang.org")
    expect(commands.at(-1)?.[0]).toBe(join(root, "managed/rustup-init"))
    expect(commands.at(-1)).toContain("--no-modify-path")
    expect(manager.env(directory).RUSTUP_HOME).toBe(join(root, "managed/rustup"))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("Node project dependencies and Yarn packageManager are installed with the declared version", async () => {
  const root = await mkdtemp(join(tmpdir(), "node-tools-")), commands: string[][] = []
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "yarn@4.5.0" }))
    const manager = new ToolchainManager(join(root, "managed"), async args => { commands.push(args); return { code: 0, output: "v22.16.0" } })
    await manager.prepare("typescript", root, () => {})
    expect(commands.at(-1)).toEqual(["npx", "--yes", "@yarnpkg/cli-dist@4.5.0", "install"])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("a failed install surfaces the command output and cannot announce readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "failed-tools-")), progress: string[] = []
  try {
    await writeFile(join(root, "package.json"), "{}")
    const manager = new ToolchainManager(root, async args => ({ code: args[0] === "npm" ? 1 : 0, output: args[0] === "npm" ? "registry unavailable" : "v22.16.0" }))
    await expect(manager.prepare("javascript", root, text => progress.push(text))).rejects.toThrow("registry unavailable")
    expect(progress).not.toContain("Environment ready")
  } finally { await rm(root, { recursive: true, force: true }) }
})
