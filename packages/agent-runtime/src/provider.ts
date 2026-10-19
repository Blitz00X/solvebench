import { z } from "zod"

export const ModelResult = z.object({
  text: z.string(),
  observations: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  /** Set when structured parsing degraded to plain text. */
  degraded: z.boolean().default(false),
})
export type ModelResult = z.infer<typeof ModelResult>

export interface ModelProvider {
  /** Direct conversation; the only interaction the workbench needs. */
  chat(request: ChatRequest): Promise<ModelResult>
}

export const ChatRequest = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  context: z.object({
    mode: z.string(),
    driver: z.string(),
    goal: z.string().optional(),
    activeFile: z.object({ path: z.string(), content: z.string() }).optional(),
    /** The coding exercise being worked on, if any. */
    exercise: z
      .object({
        source: z.string(),
        track: z.string(),
        slug: z.string(),
        title: z.string(),
        difficulty: z.string(),
        statement: z.string(),
        revision: z.string().optional(),
        solutionFiles: z.record(z.string(), z.string()).optional(),
        testFiles: z.record(z.string(), z.string()).optional(),
        /** Last test run, so the model can reason about the failure. */
        lastTest: z
          .object({
            passed: z.number(),
            failed: z.number(),
            total: z.number(),
            command: z.string(),
            failing: z.array(z.string()),
            raw: z.string().optional(),
            revision: z.string().optional(),
            stale: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
})
export type ChatRequest = z.infer<typeof ChatRequest>

/**
 * Shared system prompt for direct chat. The product is a coding-exercise
 * harness, so the model is told to act as a tutor: it sees the exercise, the
 * human's code and the test result, and it responds the way the human asks
 * (explain, hint, or show a solution) without ever claiming to have edited.
 */
export function chatSystemPrompt(): string {
  return [
    "You are a coding-exercise tutor and AI assistant in an exercise workbench.",
    "The user is solving programming exercises. You are given the exercise statement, the code currently on screen, and the result of the last test run.",
    "Answer the user directly and concisely.",
    "Match the level of help they ask for: if they want a hint, give the smallest useful hint and do not dump the full solution; if they ask you to explain, explain; if they explicitly ask for the solution, you may provide it.",
    "Ground every answer in the actual exercise, the code they wrote and the failing tests. Do not invent files or behavior you cannot see.",
    "A message such as 'help me' or 'yardım et' refers to the current exercise and solution. Inspect the supplied statement, code and results and give a concrete next step. Do not ask the user to paste a problem or code already supplied. State any genuinely missing evidence instead of inventing it.",
    "Test results have a solution revision; a stale result describes an earlier version, not the current buffer. Do not count a successful upload as platform acceptance.",
    "You cannot modify the repository. If a change is needed, describe it clearly so the human can apply it.",
    "Prefer concrete, runnable guidance over generic advice.",
  ].join(" ")
}

export function buildChatRequest(
  history: readonly { role: "user" | "assistant"; text: string }[],
  context: ChatRequest["context"],
): ChatRequest {
  return ChatRequest.parse({
    messages: [
      { role: "system", content: chatSystemPrompt() },
      ...history.map((m) => ({ role: m.role, content: m.text })),
    ],
    context,
  })
}
