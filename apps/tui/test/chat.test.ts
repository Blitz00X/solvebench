import { describe, expect, test } from "bun:test"
import { SessionState } from "@solvebench/shared"
import { MockProvider } from "@solvebench/agent-runtime"
import { createSessionStore } from "../src/store"
import { AppController } from "../src/controller"

function makeController(deps: Partial<ConstructorParameters<typeof AppController>[0]> = {}) {
  const store = createSessionStore(SessionState.parse({ id: "s", repoRoot: "/repo", mode: "pair", driver: "human" }))
  return { controller: new AppController({ store, provider: new MockProvider(), ...deps }), store }
}

describe("talking to the model through the controller", () => {
  test("appends the user message and the assistant reply", async () => {
    const { controller } = makeController()
    const result = await controller.ask("what does rotate do?")
    expect(result.message).toBe("chat ok")
    expect(controller.state.chat).toHaveLength(2)
    expect(controller.state.chat[0]!.role).toBe("user")
    expect(controller.state.chat[0]!.text).toBe("what does rotate do?")
    expect(controller.state.chat[1]!.role).toBe("assistant")
    expect(controller.state.chat[1]!.text).toContain("rotate")
  })

  test("an empty message is not sent and does not append", async () => {
    const { controller } = makeController()
    const result = await controller.ask("   ")
    expect(result.message).toContain("nothing to send")
    expect(controller.state.chat).toHaveLength(0)
  })

  test("multi-word messages keep their full text", async () => {
    const { controller } = makeController()
    await controller.ask("why  is   verify failing here?")
    expect(controller.state.chat[0]!.text).toBe("why  is   verify failing here?")
  })

  test("history stays bounded by MAX_CHAT_HISTORY", async () => {
    const { controller } = makeController()
    for (let i = 0; i < 30; i++) await controller.ask(`message ${i}`)
    // 30 user + 30 assistant appended, trimmed to the cap.
    expect(controller.state.chat.length).toBeLessThanOrEqual(40)
  })

  test("switching tasks clears the previous task's transcript", async () => {
    const { controller } = makeController()
    await controller.ask("first")
    expect(controller.state.chat).toHaveLength(2)
    controller.activateTask("other-task")
    expect(controller.state.chat).toHaveLength(0)
  })

  test("degraded provider replies are marked, not hidden", async () => {
    const failing = new MockProvider()
    failing.chat = async () => ({ text: "(provider unavailable: missing-api-key)", observations: [], evidence: [], degraded: true })
    const { controller } = makeController({ provider: failing })
    await controller.ask("hi")
    expect(controller.state.chat[1]!.degraded).toBe(true)
    expect(controller.state.chat[1]!.text).toContain("missing-api-key")
  })

  test("a throwing provider is caught and reported", async () => {
    const boom = new MockProvider()
    boom.chat = async () => {
      throw new Error("network down")
    }
    const { controller } = makeController({ provider: boom })
    const result = await controller.ask("hi")
    expect(result.message).toContain("network down")
    expect(controller.state.chat[1]!.text).toContain("network down")
  })
})
