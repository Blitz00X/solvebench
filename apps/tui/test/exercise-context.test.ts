import { describe, expect, test } from "bun:test"
import { SessionState } from "@solvebench/shared"
import { MockProvider, chatSystemPrompt, buildChatRequest, type ChatRequest } from "@solvebench/agent-runtime"
import { createSessionStore } from "../src/store"
import { AppController } from "../src/controller"

function setup(exerciseContext?: () => ChatRequest["context"]["exercise"] | undefined) {
  const store = createSessionStore(SessionState.parse({ id: "s", repoRoot: "/repo", mode: "pair", driver: "human" }))
  const seen: ChatRequest[] = []
  const provider = new MockProvider()
  const original = provider.chat.bind(provider)
  provider.chat = async (req: ChatRequest) => {
    seen.push(req)
    return original(req)
  }
  const controller = new AppController({ store, provider, ...(exerciseContext ? { exerciseContext } : {}) })
  return { controller, seen }
}

const exerciseContext = () => ({
  source: "exercism",
  track: "python",
  slug: "two-fer",
  title: "Two Fer",
  difficulty: "easy",
  statement: "Create a sentence of the form: One for X, one for me.",
  lastTest: { passed: 1, failed: 2, total: 3, command: "pytest", failing: ["test_no_name", "test_a_name"] },
})

describe("exercise context reaches the model automatically", () => {
  test("the chat request carries the exercise, code and last test", async () => {
    const { controller, seen } = setup(exerciseContext)
    controller.setActiveFile("two_fer.py", "def two_fer(name='you'):\n    pass")
    await controller.ask("why is this failing?")
    expect(seen).toHaveLength(1)
    const ctx = seen[0]!.context
    expect(ctx.exercise).toBeDefined()
    expect(ctx.exercise!.title).toBe("Two Fer")
    expect(ctx.exercise!.statement).toContain("One for X")
    expect(ctx.exercise!.lastTest!.failed).toBe(2)
    expect(ctx.exercise!.lastTest!.failing).toContain("test_no_name")
    // The code on screen is there too.
    expect(ctx.activeFile!.content).toContain("two_fer")
  })

  test("without an exercise context the request still works (no crash)", async () => {
    const { controller, seen } = setup()
    await controller.ask("hello")
    expect(seen).toHaveLength(1)
    expect(seen[0]!.context.exercise).toBeUndefined()
  })

  test("the context is read fresh on every message, so it tracks edits and test runs", async () => {
    let statement = "first statement"
    const { controller, seen } = setup(() => ({
      source: "exercism",
      track: "python",
      slug: "x",
      title: "X",
      difficulty: "easy",
      statement,
    }))
    await controller.ask("one")
    statement = "updated statement"
    await controller.ask("two")
    expect(seen[0]!.context.exercise!.statement).toBe("first statement")
    expect(seen[1]!.context.exercise!.statement).toBe("updated statement")
  })
})

describe("tutor system prompt", () => {
  test("frames the model as an exercise tutor seeing statement, code and tests", () => {
    const prompt = chatSystemPrompt().toLowerCase()
    expect(prompt).toContain("coding-exercise tutor")
    expect(prompt).toContain("exercise statement")
    expect(prompt).toContain("test run")
  })

  test("tells the model to match the level of help asked for", () => {
    const prompt = chatSystemPrompt().toLowerCase()
    expect(prompt).toContain("hint")
    expect(prompt).toContain("smallest useful hint")
    expect(prompt).toContain("ask for the solution".replace("ask", "")) // "explicitly ask for the solution"
  })

  test("keeps the no-mutation rule", () => {
    expect(chatSystemPrompt().toLowerCase()).toContain("cannot modify the repository")
  })

  test("the built request puts the system prompt first", () => {
    const req = buildChatRequest([{ role: "user", text: "hi" }], { mode: "pair", driver: "human" })
    expect(req.messages[0]!.role).toBe("system")
    expect(req.messages[0]!.content).toBe(chatSystemPrompt())
  })
})
