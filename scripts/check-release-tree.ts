#!/usr/bin/env bun
/**
 * Audit the tracked release tree before a public tag.
 *
 * This is a guard, not proof: pattern searches reduce risk but cannot establish
 * that every possible secret is absent. The checks cover the release tree at
 * HEAD and the paths reachable from HEAD's history, so a private artifact that
 * was deleted from the working tree but is still committed is reported.
 */
import { execFileSync } from "node:child_process"
import { lstatSync, readFileSync } from "node:fs"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const MAX_BYTES = 1024 * 1024

const privatePaths: { pattern: RegExp; reason: string }[] = [
  { pattern: /(^|\/)\.env($|\.)/, reason: "environment file (only .env.example belongs in the tree)" },
  { pattern: /(^|\/)(?:\.pairharness|\.solvebench|\.exercism-cli|\.goal|\.scratch|exercises|node_modules)(\/|$)/, reason: "local runtime state" },
  { pattern: /\.(?:db|db-shm|db-wal|sqlite|sqlite3)$/i, reason: "local database" },
  { pattern: /\.(?:pem|key|p12|pfx)$/i, reason: "private key material" },
]

const secretPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, reason: "private key block" },
  { pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/, reason: "API key shape (sk-...)" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, reason: "GitHub token shape" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, reason: "GitHub fine-grained token shape" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: "AWS access key shape" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, reason: "Slack token shape" },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, reason: "Google API key shape" },
]

// "you", "user" and "username" are documentation placeholders, not a person.
const personalPathPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /\/home\/(?!you\/|user\/|username\/)[A-Za-z0-9._-]+\//, reason: "absolute Linux home path" },
  { pattern: /\/Users\/(?!you\/|user\/|username\/)[A-Za-z0-9._-]+\//, reason: "absolute macOS home path" },
  { pattern: /[A-Za-z]:\\\\Users\\\\(?!you\\\\|user\\\\|username\\\\)[A-Za-z0-9._-]+\\\\/, reason: "absolute Windows home path" },
]

const textExtensions = new Set([
  "", ".md", ".txt", ".json", ".jsonl", ".yml", ".yaml", ".toml", ".ts", ".tsx", ".js", ".jsx",
  ".sh", ".py", ".css", ".html", ".example", ".lock", ".goal", ".gitignore", ".gitattributes",
])

interface Entry {
  symlink: boolean
  size: number
  path: string
}

const problems: string[] = []
let scanned = 0

// Audit what a commit would contain: tracked files plus untracked files that are
// not ignored. Reading the working tree also covers a change that is not yet
// staged, which is when this check is most useful.
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
const entries: Entry[] = []
for (const path of tracked.split("\u0000").filter(Boolean)) {
  try {
    const stat = lstatSync(join(root, path))
    entries.push({ symlink: stat.isSymbolicLink(), size: stat.size, path })
  } catch {
    problems.push(`${path}: listed by git but missing from the working tree`)
  }
}

for (const entry of entries) {
  if (entry.symlink) {
    problems.push(`${entry.path}: symbolic link`)
    continue
  }
  if (entry.size > MAX_BYTES) {
    problems.push(`${entry.path}: ${(entry.size / 1024).toFixed(0)} KiB exceeds the 1 MiB release limit`)
  }
  const isPublicExample = entry.path === ".env.example" || entry.path.endsWith("/.env.example")
  const privateMatch = isPublicExample ? undefined : privatePaths.find(({ pattern }) => pattern.test(entry.path))
  if (privateMatch) {
    problems.push(`${entry.path}: ${privateMatch.reason}`)
  }
  const extension = extname(entry.path).toLowerCase()
  if (!textExtensions.has(extension)) continue
  if (entry.size > MAX_BYTES) continue
  let text: string
  try {
    text = readFileSync(join(root, entry.path), "utf8")
  } catch {
    continue
  }
  if (text.includes("\u0000")) continue
  scanned++
  const lines = text.split("\n")
  for (const [index, line] of lines.entries()) {
    for (const { pattern, reason } of secretPatterns) {
      if (pattern.test(line)) problems.push(`${entry.path}:${index + 1}: ${reason}`)
    }
    for (const { pattern, reason } of personalPathPatterns) {
      if (pattern.test(line) && !line.includes("example.com")) problems.push(`${entry.path}:${index + 1}: ${reason}`)
    }
  }
}

// The package version, the installer's pinned tag and the release tag must move
// together; a public install otherwise fetches a tag that does not match the UI.
const packageVersion = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string }).version
const installerVersion = readFileSync(join(root, "install.sh"), "utf8").match(/^version=(.+)$/m)?.[1]?.trim()
if (!packageVersion || !installerVersion) {
  problems.push("cannot read package.json version or install.sh version")
} else if (`v${packageVersion}` !== installerVersion) {
  problems.push(`version mismatch: package.json is ${packageVersion}, install.sh pins ${installerVersion}`)
}

const headTags = execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
if (packageVersion && headTags.length > 0 && !headTags.includes(`v${packageVersion}`)) {
  problems.push(`HEAD is tagged ${headTags.join(", ")} but package.json is ${packageVersion}`)
}

// The public tag must not be able to walk back to a private runtime artifact.
const historyPaths = execFileSync(
  "git",
  ["log", "--format=%H", "HEAD", "--", ".pairharness", ".solvebench", ".exercism-cli", ".goal", ".scratch", "*.db", "*.sqlite", "*.sqlite3", ".env"],
  { cwd: root, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
if (historyPaths.length > 0) {
  problems.push(`HEAD history contains local state or database commits: ${historyPaths.slice(0, 5).join(", ")}`)
}

if (problems.length > 0) {
  console.error(problems.join("\n"))
  console.error(`\n${problems.length} release-tree problem(s) across ${entries.length} tracked file(s).`)
  process.exit(1)
}

console.log(`Audited ${entries.length} tracked file(s), ${scanned} text file(s), and HEAD history; no private paths, credential shapes, databases or oversized files found.`)
