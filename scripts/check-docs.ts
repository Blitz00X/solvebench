#!/usr/bin/env bun
/**
 * Check relative links and images in tracked Markdown files.
 *
 * External URLs, anchors and mail links are ignored. The check is deliberately
 * local: it catches moved or renamed files, not remote 404s.
 */
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const ignored = new Set([".git", "node_modules", "dist", "build", "coverage", ".tmp", "exercises", ".solvebench", ".pairharness", ".exercism-cli", ".goal", ".scratch"])
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const problems: string[] = []
let checked = 0

async function walk(directory: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")
  const out: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") out.push(path)
  }
  return out
}

for (const file of await walk(root)) {
  const text = await readFile(file, "utf8")
  for (const match of text.matchAll(linkPattern)) {
    const raw = match[1]!
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) continue
    const target = decodeURIComponent(raw.split("#")[0]!.split("?")[0]!)
    if (!target) continue
    checked++
    const absolute = resolve(dirname(file), target)
    if (!existsSync(absolute)) {
      problems.push(`${relative(root, file)}: missing ${raw}`)
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"))
  console.error(`\n${problems.length} broken local link(s) across ${checked} checked link(s).`)
  process.exit(1)
}
console.log(`Checked ${checked} local link(s) in tracked Markdown; all resolve.`)
