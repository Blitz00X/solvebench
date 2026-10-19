import { realpath, readFile, writeFile, rename, stat, chmod, rm } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import { createHash } from "node:crypto"

export function solutionRevision(files: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))).digest("hex")
}

/** Resolve both the root and the parent to reject traversal and symlink escapes. */
export async function solutionPath(directory: string, file: string): Promise<string> {
  if (isAbsolute(file)) throw new Error("Solution paths must be relative")
  const root = await realpath(directory)
  const target = resolve(root, file)
  const parent = await realpath(dirname(target))
  const rel = relative(root, parent)
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Solution path escapes the exercise")
  const actual = await realpath(target)
  const actualRel = relative(root, actual)
  if (actualRel === ".." || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel)) throw new Error("Solution symlink escapes the exercise")
  return target
}

export async function readSolution(directory: string, file: string): Promise<string> {
  return readFile(await solutionPath(directory, file), "utf8")
}

export async function saveSolution(directory: string, file: string, content: string): Promise<void> {
  const target = await solutionPath(directory, file)
  const temporary = `${target}.saving-${crypto.randomUUID()}`
  const original = await stat(target)
  try {
    await writeFile(temporary, content, "utf8")
    await chmod(temporary, original.mode & 0o777)
    await rename(temporary, target)
  } finally { await rm(temporary, { force: true }) }
}
