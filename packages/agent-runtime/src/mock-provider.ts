import type { ChatRequest, ModelProvider, ModelResult } from "./provider"

/**
 * Deterministic provider for tests and offline runs. Given the same request it
 * always returns the same result — no network, no API key.
 */
export class MockProvider implements ModelProvider {
  /**
   * Deterministic echo for chat. It never pretends to know the repository, so
   * tests and offline runs stay honest about being a mock.
   */
  async chat(request: ChatRequest): Promise<ModelResult> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user")
    const file = request.context.activeFile?.path
    const where = file ? ` (context: ${file})` : ""
    return {
      text: `[mock] You said: ${lastUser?.content ?? ""}${where}. Configure a real provider to get an actual answer.`,
      observations: [],
      evidence: [],
      degraded: false,
    }
  }
}
