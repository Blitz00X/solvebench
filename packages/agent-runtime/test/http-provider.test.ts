import { describe, expect, test } from "bun:test"
import { HttpModelProvider, HttpProviderConfig, parseChatCompletion } from "../src/http-provider"
import { createProvider, providerLabel } from "../src/provider-factory"
import { MockProvider } from "../src/mock-provider"
import { buildChatRequest } from "../src/provider"

const config = HttpProviderConfig.parse({ baseUrl: "https://example.test/v1", model: "test-model" })
const request = () => buildChatRequest([{ role: "user", text: "hint" }], { mode: "pair", driver: "human" })

function fetchReturning(status: number, body: string) {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body })
}

describe("HttpModelProvider", () => {
  test("legacy default key still authenticates after the rename without entering the request body", async () => {
    let authorization = "", body = ""
    const provider = new HttpModelProvider(config, async (_url, init) => {
      authorization = init?.headers?.authorization ?? ""
      body = init?.body ?? ""
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "hint" } }] }) }
    }, { PAIRHARNESS_API_KEY: "legacy-test-key" })
    expect(provider.describe().hasKey).toBe(true)
    expect((await provider.chat(request())).degraded).toBe(false)
    expect(authorization).toBe("Bearer legacy-test-key")
    expect(body).not.toContain("legacy-test-key")
  })
  test("returns a degraded result when the API key is missing", async () => {
    const provider = new HttpModelProvider(config, fetchReturning(200, "{}"), {})
    const result = await provider.chat(request())
    expect(result.degraded).toBe(true)
    expect(result.text).toContain("missing-api-key")
  })

  test("parses an OpenAI-compatible response", async () => {
    const body = JSON.stringify({ choices: [{ message: { content: "look at token rotation" } }] })
    const provider = new HttpModelProvider(config, fetchReturning(200, body), { SOLVEBENCH_API_KEY: "secret" })
    const result = await provider.chat(request())
    expect(result.degraded).toBe(false)
    expect(result.text).toBe("look at token rotation")
  })

  test("http errors degrade instead of throwing", async () => {
    const provider = new HttpModelProvider(config, fetchReturning(500, "boom"), { SOLVEBENCH_API_KEY: "k" })
    const result = await provider.chat(request())
    expect(result.degraded).toBe(true)
    expect(result.text).toContain("http-error")
  })

  test("malformed bodies degrade cleanly", async () => {
    const provider = new HttpModelProvider(config, fetchReturning(200, "not json"), { SOLVEBENCH_API_KEY: "k" })
    const result = await provider.chat(request())
    expect(result.degraded).toBe(true)
    expect(result.text).toContain("structured-parse-failed")
  })

  test("never leaks the key in describe() or the serialized request", async () => {
    const provider = new HttpModelProvider(config, fetchReturning(200, "{}"), { SOLVEBENCH_API_KEY: "super-secret-key" })
    const described = JSON.stringify(provider.describe())
    expect(described).not.toContain("super-secret-key")
    expect(described).toContain("SOLVEBENCH_API_KEY")
    expect(provider.describe().hasKey).toBe(true)
  })

  test("sends the key only in the authorization header", async () => {
    let seenHeaders: Record<string, string> | undefined
    let seenBody = ""
    const spy = async (_url: string, init?: { headers?: Record<string, string>; body?: string }) => {
      seenHeaders = init?.headers
      seenBody = init?.body ?? ""
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "ok" } }] }) }
    }
    const provider = new HttpModelProvider(config, spy, { SOLVEBENCH_API_KEY: "abc123" })
    await provider.chat(request())
    expect(seenHeaders!.authorization).toBe("Bearer abc123")
    expect(seenBody).not.toContain("abc123")
  })
})

describe("parseChatCompletion", () => {
  test("returns null on empty content", () => {
    expect(parseChatCompletion(JSON.stringify({ choices: [{ message: { content: "" } }] }))).toBeNull()
    expect(parseChatCompletion("{}")).toBeNull()
  })

  test("reads a normal completion", () => {
    const r = parseChatCompletion(JSON.stringify({ choices: [{ message: { content: "hello" } }] }))
    expect(r!.text).toBe("hello")
    expect(r!.degraded).toBe(false)
  })

  test("surfaces reasoning when content is empty and the budget ran out", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "", reasoning: "thinking about it..." }, finish_reason: "length" }],
    })
    const r = parseChatCompletion(body)
    expect(r).not.toBeNull()
    expect(r!.text).toContain("out of output budget")
    expect(r!.text).not.toContain("thinking about it") // Never display model thinking.
    // Truncated reasoning is a degraded answer: it is not a real reply.
    expect(r!.degraded).toBe(true)
  })

  test("labels reasoning-only replies that finished normally", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "", reasoning: "only thoughts" }, finish_reason: "stop" }],
    })
    const r = parseChatCompletion(body)
    expect(r!.text).toContain("reasoning-only")
    expect(r!.degraded).toBe(true)
  })

  test("prefers content over reasoning when both are present", () => {
    const body = JSON.stringify({
      choices: [{ message: { content: "the answer", reasoning: "the thoughts" }, finish_reason: "stop" }],
    })
    expect(parseChatCompletion(body)!.text).toBe("the answer")
  })
})

describe("createProvider", () => {
  test("defaults to the deterministic mock", () => {
    expect(createProvider(undefined)).toBeInstanceOf(MockProvider)
    expect(createProvider({ kind: "mock" })).toBeInstanceOf(MockProvider)
    expect(providerLabel(new MockProvider())).toBe("mock")
  })

  test("builds the http provider when configured", async () => {
    const provider = createProvider(
      { kind: "http", baseUrl: "https://example.test/v1", model: "m" },
      { fetchImpl: fetchReturning(200, JSON.stringify({ choices: [{ message: { content: "hi" } }] })), env: { SOLVEBENCH_API_KEY: "k" } },
    )
    expect(provider).toBeInstanceOf(HttpModelProvider)
    expect(providerLabel(provider)).toBe("http:m")
    const result = await provider.chat(request())
    expect(result.text).toBe("hi")
  })
})

describe("reasoning_effort", () => {
  const baseCfg = { baseUrl: "https://example.test/v1", model: "m" }
  const okBody = JSON.stringify({ choices: [{ message: { content: "hi" } }] })

  function captureProvider(extra: Record<string, unknown>) {
    let body = ""
    const fetchImpl = async (_url: string, init?: { body?: string }) => {
      body = init?.body ?? ""
      return { ok: true, status: 200, text: async () => okBody }
    }
    const config = HttpProviderConfig.parse({ ...baseCfg, ...extra })
    return { provider: new HttpModelProvider(config, fetchImpl, { SOLVEBENCH_API_KEY: "k" }), sent: () => body }
  }

  test("omits reasoning_effort when unset, so defaults are untouched", async () => {
    const { provider, sent } = captureProvider({})
    await provider.chat(buildChatRequest([{ role: "user", text: "x" }], { mode: "pair", driver: "human" }))
    expect(sent()).not.toContain("reasoning_effort")
  })

  test('sends reasoning_effort:"none" when configured (fast, no thinking)', async () => {
    const { provider, sent } = captureProvider({ reasoningEffort: "none" })
    await provider.chat(buildChatRequest([{ role: "user", text: "x" }], { mode: "pair", driver: "human" }))
    expect(sent()).toContain('"reasoning_effort":"none"')
  })

  test("rejects an unknown effort value at config parse time", () => {
    expect(() => HttpProviderConfig.parse({ ...baseCfg, reasoningEffort: "turbo" })).toThrow()
  })
})
