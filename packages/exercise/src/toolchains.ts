import { mkdir, readFile, readdir, writeFile, chmod } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { testEnv } from "./runners"
import { createHash } from "node:crypto"

export const SUPPORTED_TRACKS = ["bash", "python", "javascript", "typescript", "go", "rust", "java", "c", "cpp"]
export interface Execution { code: number; output: string }
export type Execute = (args: string[], cwd: string, env: Record<string, string>) => Promise<Execution>
export async function execute(args: string[], cwd: string, env: Record<string, string>): Promise<Execution> {
  const proc = Bun.spawn(args, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { code, output: `${out}\n${err}`.trim() }
}

/** Explicit, visible environment setup in user-owned directories. */
export class ToolchainManager {
  private prepared = new Map<string, string>()
  constructor(readonly root: string, private run: Execute = execute, private fetchImpl: typeof fetch = fetch) {}
  env(directory: string): Record<string, string> {
    const env = testEnv()
    return { ...env,
      PATH: [join(directory, ".venv/bin"), join(this.root, "bin"), join(this.root, "node/bin"), join(this.root, "go/bin"), join(this.root, "jdk/bin"), join(this.root, "cargo/bin"), env.PATH].join(":"),
      CARGO_HOME: join(this.root, "cargo"), RUSTUP_HOME: join(this.root, "rustup"),
      UV_PYTHON_INSTALL_DIR: join(this.root, "python"),
      ...(existsSync(join(this.root, "jdk/bin/java")) ? { JAVA_HOME: join(this.root, "jdk") } : {}),
    }
  }
  private async command(args: string[], directory: string, env: Record<string, string>): Promise<string> {
    const result = await this.run(args, directory, env)
    if (result.code !== 0) throw new Error(`${args[0]}: ${result.output.slice(-2000)}`)
    return result.output
  }
  private async download(url: string, destination: string): Promise<void> {
    const result = await this.fetchImpl(url)
    if (!result.ok) throw new Error(`Download failed: ${result.status} ${new URL(url).host}`)
    await writeFile(destination, new Uint8Array(await result.arrayBuffer()))
  }
  private async archive(url: string, folder: string, env: Record<string, string>): Promise<void> {
    await mkdir(folder, { recursive: true })
    const archive = join(this.root, `${crypto.randomUUID()}.tar.gz`)
    await this.download(url, archive)
    await this.command(["tar", "-xf", archive, "--strip-components=1", "-C", folder], this.root, env)
    await Bun.file(archive).delete()
  }
  private async available(binary: string, args: string[], directory: string, env: Record<string, string>): Promise<string | null> {
    try {
      const result = await this.run([binary, ...args], directory, env)
      return result.code === 0 ? result.output : null
    } catch { return null }
  }
  async prepare(track: string, directory: string, report: (message: string) => void): Promise<void> {
    if (!SUPPORTED_TRACKS.includes(track)) throw new Error(`Environment setup is not supported for ${track}`)
    await mkdir(this.root, { recursive: true })
    await mkdir(join(this.root, "bin"), { recursive: true })
    let env = this.env(directory)
    const manifests = []
    for (const file of ["package.json", "requirements.txt", "Cargo.toml", "go.mod", "build.gradle"]) {
      try { manifests.push(await readFile(join(directory, file), "utf8")) } catch { /* absent */ }
    }
    const fingerprint = createHash("sha256").update(`${track}:${manifests.join("\n")}`).digest("hex")
    if (this.prepared.get(directory) === fingerprint) { report("Environment ready"); return }
    const arch = process.arch === "arm64" ? "aarch64" : "x86_64"
    const nodeArch = process.arch === "arm64" ? "arm64" : "x64"
    if (process.platform !== "linux") throw new Error("Managed installation currently supports Linux; use an installed toolchain on other systems")
    report(`Checking ${track} environment`)
    if (track === "python") {
      const python = await this.available("python3", ["--version"], directory, env)
      const pytest = await this.available("python3", ["-m", "pytest", "--version"], directory, env)
      if (python && /Python 3\.(1[1-9]|[2-9]\d)/.test(python) && pytest) { this.prepared.set(directory, fingerprint); report("Python + pytest ready"); return }
      if (!await this.available("uv", ["--version"], directory, env)) {
        report("Installing uv in the workbench")
        await this.archive(`https://github.com/astral-sh/uv/releases/latest/download/uv-${arch}-unknown-linux-gnu.tar.gz`, join(this.root, "bin"), env)
      }
      const pkg = await this.available("python3", ["--version"], directory, env)
      if (!pkg || !/Python 3\.(1[1-9]|[2-9]\d)/.test(pkg)) {
        report("Installing Python 3.12")
        await this.command(["uv", "python", "install", "3.12"], directory, env)
      }
      if (!existsSync(join(directory, ".venv/bin/python"))) await this.command(["uv", "venv", "--python", "3.12", ".venv"], directory, env)
      report("Preparing pytest")
      await this.command(["uv", "pip", "install", "--python", join(directory, ".venv/bin/python"), "pytest"], directory, env)
    }
    if (track === "javascript" || track === "typescript") {
      const version = await this.available("node", ["--version"], directory, env)
      if (!version || Number(version.match(/v(\d+)/)?.[1] ?? 0) < 20) {
        report("Installing Node.js 22")
        await this.archive(`https://nodejs.org/dist/v22.16.0/node-v22.16.0-linux-${nodeArch}.tar.gz`, join(this.root, "node"), env)
        env = this.env(directory)
      }
      const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as { packageManager?: string }
      report("Installing exercise dependencies")
      if (pkg.packageManager?.startsWith("yarn@") || existsSync(join(directory, "yarn.lock"))) {
        const version = pkg.packageManager?.match(/^yarn@(\d+\.\d+\.\d+)$/)?.[1] ?? "4.9.2"
        await this.command(["npx", "--yes", `@yarnpkg/cli-dist@${version}`, "install"], directory, env)
      } else await this.command(["npm", "install", "--no-audit", "--no-fund"], directory, env)
    }
    if (track === "go") {
      const version = await this.available("go", ["version"], directory, env)
      if (!version || !/go1\.(2[2-9]|[3-9]\d)/.test(version)) {
        report("Installing Go 1.24")
        await this.archive(`https://go.dev/dl/go1.24.4.linux-${process.arch === "arm64" ? "arm64" : "amd64"}.tar.gz`, join(this.root, "go"), env)
      }
    }
    if (track === "rust") {
      const manifest = await readFile(join(directory, "Cargo.toml"), "utf8")
      const version = await this.available("rustc", ["--version"], directory, env)
      const minimum = manifest.includes("2024") ? 85 : 75
      if (!version || Number(version.match(/rustc 1\.(\d+)/)?.[1] ?? 0) < minimum) {
        report("Installing a current Rust toolchain")
        const installer = join(this.root, "rustup-init")
        await this.download(`https://static.rust-lang.org/rustup/dist/${arch}-unknown-linux-gnu/rustup-init`, installer)
        await chmod(installer, 0o700)
        await this.command([installer, "-y", "--no-modify-path", "--profile", "minimal"], directory, env)
      }
    }
    if (track === "java") {
      const version = await this.available("java", ["-version"], directory, env)
      if (!version || Number(version.match(/version "(\d+)/)?.[1] ?? 0) < 21) {
        report("Installing Temurin JDK 21")
        await this.archive(`https://api.adoptium.net/v3/binary/latest/21/ga/linux/${nodeArch}/jdk/hotspot/normal/eclipse`, join(this.root, "jdk"), env)
      }
      if (existsSync(join(directory, "gradlew"))) await chmod(join(directory, "gradlew"), 0o700)
    }
    if (track === "bash" && !await this.available("bats", ["--version"], directory, env)) {
      report("Installing bats")
      const folder = join(this.root, "bats")
      await this.archive("https://github.com/bats-core/bats-core/archive/refs/tags/v1.12.0.tar.gz", folder, env)
      await this.command(["bash", "install.sh", this.root], folder, env)
    }
    if (track === "c" || track === "cpp") {
      const compiler = track === "c" ? "gcc" : "g++"
      if (!await this.available(compiler, ["--version"], directory, env)) {
        report("Installing a user-local C/C++ compiler (Zig)")
        const folder = join(this.root, "zig")
        await this.archive(`https://ziglang.org/download/0.14.1/zig-${arch}-linux-0.14.1.tar.xz`, folder, env)
        for (const [name, flag] of [["gcc", "cc"], ["g++", "c++"]]) {
          const path = join(this.root, "bin", name!)
          await writeFile(path, `#!/bin/sh\nexec '${folder.replace(/'/g, "'\\''")}/zig' ${flag} "$@"\n`, { mode: 0o700 })
          await chmod(path, 0o700)
        }
      }
      if (!await this.available("make", ["--version"], directory, env)) {
        report("Building GNU Make in the workbench")
        const folder = join(this.root, "make-source")
        await this.archive("https://ftp.gnu.org/gnu/make/make-4.4.1.tar.gz", folder, env)
        await this.command(["sh", "configure", `--prefix=${this.root}`], folder, env)
        await this.command(["sh", "build.sh"], folder, env)
        await this.command(["./make", "install"], folder, env)
      }
      if (track === "cpp" && !await this.available("cmake", ["--version"], directory, env)) {
        report("Installing CMake")
        await this.archive(`https://github.com/Kitware/CMake/releases/download/v3.31.8/cmake-3.31.8-linux-${arch}.tar.gz`, this.root, env)
      }
    }
    this.prepared.set(directory, fingerprint)
    report("Environment ready")
  }
}
