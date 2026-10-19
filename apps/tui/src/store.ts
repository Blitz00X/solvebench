import type { ChatMessage, SessionState } from "@solvebench/shared"
import { MAX_CHAT_HISTORY } from "@solvebench/shared"
import { createStore } from "solid-js/store"

export interface SessionStore {
  readonly state: SessionState
  /** Append to the transcript, trimming the oldest turns beyond the cap. */
  appendChat(message: ChatMessage): void
  clearChat(): void
}

/**
 * Thin Solid store wrapper. The TUI never mutates state directly; it calls the
 * store and renders the result, so every pane sees the same transcript.
 */
export function createSessionStore(initial: SessionState): SessionStore {
  const [proxy, setState] = createStore<{ value: SessionState }>({ value: initial })

  return {
    get state() {
      return proxy.value
    },
    appendChat(message: ChatMessage) {
      const chat = [...proxy.value.chat, message].slice(-MAX_CHAT_HISTORY)
      setState("value", "chat", chat)
    },
    clearChat() {
      setState("value", "chat", [])
    },
  }
}

export { createStore }
