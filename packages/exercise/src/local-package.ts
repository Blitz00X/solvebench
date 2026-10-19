import { z } from "zod"
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { solutionPath } from "./workspace"
import { isTestFile } from "./local-state"
import { homedir } from "node:os"

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/)
const file = z.string().min(1).refine(value => !isAbsolute(value) && !value.includes("\\") && value.split("/").every(part => part && part !== "." && part !== ".."), "Expected a relative file path without traversal")
export const LocalExerciseManifest = z.object({
  title: z.string().trim().min(1),
  slug: identifier.optional(),
  language: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9+-]{0,39}$/),
  difficulty: z.enum(["easy", "medium", "hard", "unknown"]).default("unknown"),
  statement: file.default("question.md"),
  solutionFiles: z.array(file).min(1).refine(files => new Set(files).size === files.length, "Duplicate solution files"),
  testFiles: z.array(file).optional(),
  testCommand: z.array(z.string().min(1)).min(1),
  timeoutMs: z.number().int().min(1).max(600_000).default(120_000),
})
export type LocalExerciseManifest = z.infer<typeof LocalExerciseManifest>
export interface LocalPackage { directory: string; slug: string; manifest: LocalExerciseManifest; files: string[] }
export interface ImportedExercise { trackSlug: string; slug: string; title: string }
const excluded = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", "build", "target"])

async function regularFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  let bytes = 0
  async function walk(current: string, prefix = "") {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue
      const path = join(current, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${rel}`)
      if (entry.isDirectory()) await walk(path, rel)
      else if (entry.isFile()) {
        bytes += (await lstat(path)).size
        files.push(rel)
        if (files.length > 2000 || bytes > 100 * 1024 * 1024) throw new Error("Exercise exceeds 2000 files or 100 MiB")
      } else throw new Error(`Not a regular file: ${rel}`)
    }
  }
  await walk(directory)
  return files
}

export async function readLocalPackage(directory: string, importedSlug?: string, validateSnapshot = true): Promise<LocalPackage> {
  try {
    if (!(await lstat(directory)).isDirectory()) throw new Error("Expected an exercise directory")
    const manifest = LocalExerciseManifest.parse(JSON.parse(await readFile(join(directory, "exercise.json"), "utf8")))
    const slug = identifier.parse(importedSlug ?? manifest.slug ?? basename(directory).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, ""))
    const files = validateSnapshot ? await regularFiles(directory) : []
    const tests = manifest.testFiles ?? files.filter(path => isTestFile(path) && !manifest.solutionFiles.includes(path))
    for (const path of [manifest.statement, ...manifest.solutionFiles, ...tests]) {
      const target = await solutionPath(directory, path)
      if (!(await lstat(target)).isFile()) throw new Error(`Expected a regular file: ${path}`)
    }
    if (tests.some(path => manifest.solutionFiles.includes(path))) throw new Error("Solution files and test files must be separate")
    return { directory, slug, manifest: { ...manifest, testFiles: tests }, files }
  } catch (error) { throw new Error(`${basename(directory)}: ${error instanceof Error ? error.message : String(error)}`) }
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

/** Validate and stage the whole collection before publishing any exercise. */
export async function importLocalPackages(input: string, root: string): Promise<ImportedExercise[]> {
  const directory = resolve(input.startsWith("~/") ? join(homedir(), input.slice(2)) : input)
  if (!(await lstat(directory)).isDirectory()) throw new Error("Choose an exercise folder or a collection folder")
  const candidates = await exists(join(directory, "exercise.json")) ? [directory] : (await readdir(directory, { withFileTypes: true }))
    .filter(entry => !excluded.has(entry.name) && !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
    .map(entry => join(directory, entry.name))
  if (!candidates.length) throw new Error("No exercise folders found; each exercise needs exercise.json")
  const packages = await Promise.all(candidates.map(path => readLocalPackage(path)))
  const keys = new Set<string>()
  await mkdir(root, { recursive: true })
  if ((await lstat(root)).isSymbolicLink()) throw new Error("Local exercise storage cannot be a symbolic link")
  for (const item of packages) {
    const key = `${item.manifest.language}/${item.slug}`
    if (keys.has(key) || await exists(join(root, key))) throw new Error(`Already imported: ${key}. Existing solutions are preserved.`)
    keys.add(key)
    const languageDir = join(root, item.manifest.language)
    await mkdir(languageDir, { recursive: true })
    if ((await lstat(languageDir)).isSymbolicLink()) throw new Error("Local language storage cannot be a symbolic link")
  }
  const stage = await mkdtemp(join(dirname(root), ".local-import-"))
  const published: string[] = []
  try {
    for (let index = 0; index < packages.length; index++) {
      const item = packages[index]!, destination = join(stage, String(index))
      await mkdir(destination)
      for (const path of item.files) {
        await mkdir(dirname(join(destination, path)), { recursive: true })
        await cp(join(item.directory, path), join(destination, path), { dereference: false, errorOnExist: true, force: false })
      }
      // Persist detected test files so runtime reads never need to scan generated artifacts.
      await writeFile(join(destination, "exercise.json"), JSON.stringify({ ...item.manifest, slug: item.slug }, null, 2) + "\n")
      // Check the staged snapshot as well, including late-added symlinks.
      await readLocalPackage(destination, item.slug)
    }
    for (let index = 0; index < packages.length; index++) {
      const item = packages[index]!, destination = join(root, item.manifest.language, item.slug)
      if (await exists(destination)) throw new Error(`Already imported: ${item.slug}`)
      await rename(join(stage, String(index)), destination)
      published.push(destination)
    }
    return packages.map(item => ({ trackSlug: item.manifest.language, slug: item.slug, title: item.manifest.title }))
  } catch (error) {
    for (const destination of published) await rm(destination, { recursive: true, force: true })
    throw error
  } finally { await rm(stage, { recursive: true, force: true }) }
}
