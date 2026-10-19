import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { configTemplate, connectionStatus, loadConfig, resolveApiKey } from "../src/config"

const dirs: string[] = []
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "solvebench-config-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true })
})

describe("loadConfig", () => {
  test("reads legacy workspace configuration and prefers the renamed config when both exist", async () => {
    const dir = await tempDir()
    await writeFile(join(dir, "pairharness.config.json"), JSON.stringify({ provider: { kind: "http", baseUrl: "https://x/v1", model: "legacy" } }))
    expect(loadConfig(dir, join(dir, "home")).config.provider.model).toBe("legacy")
    await writeFile(join(dir, "solvebench.config.json"), JSON.stringify({ provider: { kind: "http", baseUrl: "https://x/v1", model: "renamed" } }))
    expect(loadConfig(dir, join(dir, "home")).config.provider.model).toBe("renamed")
  })
  test("defaults to the mock when no file exists", async () => {
    const dir = await tempDir()
    const loaded = loadConfig(dir, join(dir, "home"))
    expect(loaded.config.provider.kind).toBe("mock")
    expect(loaded.source).toBe("(defaults)")
    expect(loaded.warnings).toEqual([])
  })

  test("reads a repo-root config file", async () => {
    const dir = await tempDir()
    await writeFile(
      join(dir, "solvebench.config.json"),
      JSON.stringify({
        provider: { kind: "http", baseUrl: "https://api.example/v1", model: "my-model", apiKeyEnv: "MY_KEY" },
      }),
    )
    const loaded = loadConfig(dir, join(dir, "home"))
    expect(loaded.config.provider.kind).toBe("http")
    expect(loaded.config.provider.model).toBe("my-model")
    expect(loaded.config.provider.apiKeyEnv).toBe("MY_KEY")
    expect(loaded.source).toBe("solvebench.config.json")
  })

  test("falls back to the XDG config when the repo has none", async () => {
    const dir = await tempDir()
    const xdg = join(dir, "xdg")
    await mkdir(join(xdg, "solvebench"), { recursive: true })
    await writeFile(
      join(xdg, "solvebench", "config.json"),
      JSON.stringify({ provider: { kind: "http", baseUrl: "https://x/v1", model: "m" } }),
    )
    const previous = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = xdg
    try {
      const loaded = loadConfig(dir, join(dir, "home"))
      expect(loaded.config.provider.kind).toBe("http")
      expect(loaded.source).toContain("config.json")
    } finally {
      if (previous === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = previous
    }
  })

  test("a malformed file warns and falls back to the mock", async () => {
    const dir = await tempDir()
    await writeFile(join(dir, "solvebench.config.json"), "{ this is not json")
    const loaded = loadConfig(dir, join(dir, "home"))
    expect(loaded.config.provider.kind).toBe("mock")
    expect(loaded.warnings.length).toBeGreaterThan(0)
  })

  test("http kind without baseUrl warns and uses the mock", async () => {
    const dir = await tempDir()
    await writeFile(join(dir, "solvebench.config.json"), JSON.stringify({ provider: { kind: "http" } }))
    const loaded = loadConfig(dir, join(dir, "home"))
    expect(loaded.config.provider.kind).toBe("mock")
    expect(loaded.warnings.join(" ")).toContain("baseUrl")
  })
})

describe("connectionStatus", () => {
  test("reports the mock as ready", async () => {
    const dir = await tempDir()
    const status = connectionStatus(loadConfig(dir, join(dir, "home")))
    expect(status.ok).toBe(true)
    expect(status.kind).toBe("mock")
  })

  test("reports a missing key for http without leaking a value", () => {
    const status = connectionStatus(
      { config: { provider: { kind: "http", baseUrl: "https://x/v1", model: "m", apiKeyEnv: "MY_KEY" } }, source: "test", warnings: [] },
      {},
    )
    expect(status.ok).toBe(false)
    expect(status.hasKey).toBe(false)
    expect(status.note).toContain("MY_KEY")
  })

  test("reports readiness when the key is present, never the key itself", () => {
    const status = connectionStatus(
      { config: { provider: { kind: "http", baseUrl: "https://x/v1", model: "m", apiKeyEnv: "MY_KEY" } }, source: "test", warnings: [] },
      { MY_KEY: "sk-secret-value" },
    )
    expect(status.ok).toBe(true)
    expect(status.hasKey).toBe(true)
    expect(JSON.stringify(status)).not.toContain("sk-secret-value")
  })
})

describe("resolveApiKey", () => {
  test("supports the legacy default key while honoring an explicit key name and new-key precedence", () => {
    const config = { kind: "http" as const, apiKeyEnv: "SOLVEBENCH_API_KEY" }
    expect(resolveApiKey(config, { PAIRHARNESS_API_KEY: "legacy" })).toBe("legacy")
    expect(resolveApiKey(config, { PAIRHARNESS_API_KEY: "legacy", SOLVEBENCH_API_KEY: "new" })).toBe("new")
    expect(resolveApiKey(config, { PAIRHARNESS_API_KEY: "legacy", SOLVEBENCH_API_KEY: "" })).toBe("legacy")
    expect(resolveApiKey({ ...config, apiKeyEnv: "CUSTOM_KEY" }, { PAIRHARNESS_API_KEY: "legacy" })).toBeUndefined()
  })
  test("reads from the named env var only", () => {
    expect(resolveApiKey({ kind: "http", apiKeyEnv: "K", baseUrl: "https://x", model: "m" }, { K: "v" })).toBe("v")
    expect(resolveApiKey({ kind: "http", apiKeyEnv: "K", baseUrl: "https://x", model: "m" }, {})).toBeUndefined()
  })
})

describe("configTemplate", () => {
  test("produces valid JSON with an apiKeyEnv field and no key value", () => {
    const parsed = JSON.parse(configTemplate()) as { provider: { apiKeyEnv: string; apiKey?: string } }
    expect(parsed.provider.apiKeyEnv).toBe("SOLVEBENCH_API_KEY")
    expect(parsed.provider.apiKey).toBeUndefined()
  })
})
