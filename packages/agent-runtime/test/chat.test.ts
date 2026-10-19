import { describe, expect, test } from "bun:test"
import { MockProvider } from "../src/mock-provider"
import { buildChatRequest, chatSystemPrompt } from "../src/provider"
import { HttpModelProvider, HttpProviderConfig } from "../src/http-provider"

const context = { mode: "pair", driver: "human", goal: "fix race" }

describe("buildChatRequest", () => {
  test("puts a system prompt first and preserves order", () => {
    const req = buildChatRequest(
      [
        { role: "user", text: "what does rotate do?" },
        { role: "assistant", text: "it rotates the token" },
        { role: "user", text: "and verify?" },
      ],
      context,
    )
    expect(req.messages[0]!.role).toBe("system")
    expect(req.messages[0]!.content).toBe(chatSystemPrompt())
    expect(req.messages[1]!.content).toBe("what does rotate do?")
    expect(req.messages[2]!.content).toBe("it rotates the token")
    expect(req.messages[3]!.content).toBe("and verify?")
  })

  test("system prompt forbids claiming repo mutation", () => {
    expect(chatSystemPrompt().toLowerCase()).toContain("cannot modify the repository")
    expect(chatSystemPrompt().toLowerCase()).toContain("describe it")
  })
})

describe("MockProvider.chat", () => {
  test("is deterministic and echoes the last user message", async () => {
    const provider = new MockProvider()
    const request = buildChatRequest([{ role: "user", text: "hello" }], context)
    const a = await provider.chat(request)
    const b = await provider.chat(request)
    expect(a.text).toBe(b.text)
    expect(a.text).toContain("hello")
    expect(a.degraded).toBe(false)
  })

  test("mentions the active file as context when present", async () => {
    const provider = new MockProvider()
    const request = buildChatRequest([{ role: "user", text: "hi" }], {
      ...context,
      activeFile: { path: "src/auth.ts", content: "x" },
    })
    const result = await provider.chat(request)
    expect(result.text).toContain("src/auth.ts")
  })
})

describe("HttpModelProvider.chat", () => {
  const config = HttpProviderConfig.parse({ baseUrl: "https://example.test/v1", model: "m" })
  const okBody = JSON.stringify({ choices: [{ message: { content: "real answer" } }] })

  test("sends history and context, returns the answer", async () => {
    let sentBody = ""
    const fetchImpl = async (_url: string, init?: { body?: string }) => {
      sentBody = init?.body ?? ""
      return { ok: true, status: 200, text: async () => okBody }
    }
    const provider = new HttpModelProvider(config, fetchImpl, { SOLVEBENCH_API_KEY: "k" })
    const request = buildChatRequest([{ role: "user", text: "why is verify() failing?" }], {
      ...context,
      activeFile: { path: "src/auth.ts", content: "export function verify() {}" },
    })
    const result = await provider.chat(request)
    expect(result.text).toBe("real answer")
    expect(sentBody).toContain("why is verify() failing?")
    expect(sentBody).toContain("src/auth.ts")
    // The repository context is a system message, not a user turn.
    expect(sentBody).toContain("Repository context")
  })

  test("degrades without a key", async () => {
    const provider = new HttpModelProvider(config, async () => ({ ok: true, status: 200, text: async () => okBody }), {})
    const result = await provider.chat(buildChatRequest([{ role: "user", text: "hi" }], context))
    expect(result.degraded).toBe(true)
    expect(result.text).toContain("missing-api-key")
  })

  test("never leaks the key into the request body", async () => {
    let body = ""
    const fetchImpl = async (_url: string, init?: { body?: string }) => {
      body = init?.body ?? ""
      return { ok: true, status: 200, text: async () => okBody }
    }
    const provider = new HttpModelProvider(config, fetchImpl, { SOLVEBENCH_API_KEY: "sk-verysecret" })
    await provider.chat(buildChatRequest([{ role: "user", text: "hi" }], context))
    expect(body).not.toContain("sk-verysecret")
  })
})
