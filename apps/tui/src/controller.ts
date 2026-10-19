import type { SessionState } from "@solvebench/shared"
import { buildChatRequest, type ChatRequest, type ModelProvider } from "@solvebench/agent-runtime"
import type { SessionStore } from "./store"

export interface ControllerDeps {
  store: SessionStore
  provider: ModelProvider
  /**
   * The active exercise context for the model. Supplied by the exercise
   * workflow so the tutor always sees the exercise, the code and the last test.
   */
  exerciseContext?: () => ChatRequest["context"]["exercise"] | undefined
}

export interface ControllerResult {
  message: string
}

/**
 * The interaction surface between the human and the model: ask a question, get
 * an answer, and keep track of which file the editor is showing. It never
 * mutates files, transactions or permissions.
 */
export class AppController {
  private activeFile: { path: string; content: string } | undefined
  /** Set while the buffer differs from what was loaded from disk. */
  private bufferDirty = false
  private taskKey = ""

  /** Host hook: tells the UI to reload the editor for a new file. */
  onActiveFileChange?: (path: string | undefined, content: string) => void
  /** Host hook: the buffer diverged from disk. */
  onBufferDirty?: () => void

  constructor(private readonly deps: ControllerDeps) {}

  get state(): SessionState {
    return this.deps.store.state
  }

  /**
   * The host pushes the currently open file here. Everything the model sees
   * (chat context) reads from this single source, so the editor and the agent
   * always agree on what "the file" is.
   */
  setActiveFile(path: string | undefined, content: string): void {
    this.activeFile = path ? { path, content } : undefined
    this.bufferDirty = false
    this.onActiveFileChange?.(path, content)
  }

  /**
   * The editor reports live edits here. This keeps the agent's view of the
   * active file identical to what is on screen, including unsaved changes.
   */
  setActiveFileBuffer(text: string): void {
    // The editor starts empty. An empty buffer with no file open is NOT a
    // scratch document: it means "no context", so the agent must not pretend
    // there is a file. Ignore it entirely.
    if (text.length === 0) {
      if (this.activeFile && this.activeFile.content.length > 0) this.activeFile = undefined
      this.bufferDirty = false
      return
    }
    if (!this.activeFile) {
      // Typed from scratch with no file open: treat it as an in-memory buffer.
      this.activeFile = { path: "(unsaved)", content: text }
    } else {
      this.activeFile = { ...this.activeFile, content: text }
    }
    this.bufferDirty = true
    this.onBufferDirty?.()
  }

  isBufferDirty(): boolean {
    return this.bufferDirty
  }

  getActiveFile(): { path: string; content: string } | undefined {
    return this.activeFile
  }

  /** Switching tasks clears the previous task's transcript. */
  activateTask(key: string): void {
    if (this.taskKey && this.taskKey !== key) this.deps.store.clearChat()
    this.taskKey = key
  }

  /**
   * The only interaction the product needs: ask the model about what is on
   * screen. Plain text goes here directly, with no command parsing at all.
   */
  async ask(message: string): Promise<ControllerResult> {
    const trimmed = message.trim()
    if (!trimmed) return { message: "nothing to send" }

    const exercise = this.deps.exerciseContext?.()
    const key = exercise ? `${exercise.source}/${exercise.track}/${exercise.slug}` : "scratch"
    this.activateTask(key)
    this.deps.store.appendChat({ role: "user", text: message, at: Date.now(), degraded: false })

    const history = this.state.chat
      .filter((m) => m.role !== "system")
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }))
    const activeFile = this.activeFile && exercise?.solutionFiles
      ? { ...this.activeFile, content: exercise.solutionFiles[this.activeFile.path] ?? this.activeFile.content }
      : this.activeFile
    const request = buildChatRequest(history, {
      mode: this.state.mode,
      driver: this.state.driver,
      ...(this.state.goal ? { goal: this.state.goal } : {}),
      ...(activeFile ? { activeFile } : {}),
      ...(exercise ? { exercise } : {}),
    })
    try {
      const result = await this.deps.provider.chat(request)
      const currentExercise = this.deps.exerciseContext?.()
      const currentKey = currentExercise ? `${currentExercise.source}/${currentExercise.track}/${currentExercise.slug}` : "scratch"
      if (currentKey !== key) return { message: "Task changed; the previous task's reply was not shown" }
      this.deps.store.appendChat({
        role: "assistant",
        text: result.text,
        at: Date.now(),
        degraded: result.degraded,
      })
      return { message: "chat ok" }
    } catch (error) {
      const text = error instanceof Error ? error.message : "provider failed"
      this.deps.store.appendChat({ role: "assistant", text: `(error) ${text}`, at: Date.now(), degraded: true })
      return { message: `chat failed: ${text}` }
    }
  }
}
