import { z } from "zod"

export const ChatRole = z.enum(["user", "assistant", "system"])
export type ChatRole = z.infer<typeof ChatRole>

export const ChatMessage = z.object({
  role: ChatRole,
  text: z.string(),
  /** Epoch ms; ordering and display only. */
  at: z.number().int().nonnegative().default(() => Date.now()),
  /** True when the provider could not answer (offline, missing key, http error). */
  degraded: z.boolean().default(false),
})
export type ChatMessage = z.infer<typeof ChatMessage>

/** History sent to the provider is capped so context cannot grow without bound. */
export const MAX_CHAT_HISTORY = 40
