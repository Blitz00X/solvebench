import { z } from "zod"
import { Driver, Mode } from "./driver"
import { ChatMessage } from "./chat"

/**
 * The whole shared session surface. The exercise workbench needs exactly this:
 * who the session is for, which mode it runs in, and the conversation with the
 * model. Everything else lives with the exercise workflow that owns it.
 */
export const SessionState = z.object({
  id: z.string(),
  repoRoot: z.string(),
  mode: Mode,
  driver: Driver,
  goal: z.string().optional(),
  /** Direct conversation with the model; never mutates the working tree. */
  chat: z.array(ChatMessage).default([]),
})
export type SessionState = z.infer<typeof SessionState>
