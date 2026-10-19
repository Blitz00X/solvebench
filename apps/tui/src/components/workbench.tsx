import { For, Show, createEffect, createSignal, onMount, onCleanup } from "solid-js"
import { useKeyboard, usePaste, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
import type { SessionState } from "@solvebench/shared"
import type { AppController } from "../controller"
import { EMPTY_EXERCISE_STATE, type ExerciseController } from "../exercise-controller"
import type { ExerciseProgress } from "@solvebench/exercise"
import { EditorPane } from "./editor-pane"
import { MarkdownView } from "./markdown-view"
import { ImportDialog } from "./import-dialog"
import { ExitDialog } from "./exit-dialog"

const C = { bg: "#0e1420", panel: "#151e2e", border: "#29374b", text: "#e2e8f0", dim: "#94a3b8", accent: "#38bdf8", green: "#4ade80", red: "#fb7185" }

const MARKERS: Record<ExerciseProgress, string> = {
  completed: "✓",
  started: "→",
  available: "○",
  locked: "·",
}

function progressMarker(progress: ExerciseProgress): string {
  return MARKERS[progress]
}

/**
 * Keyboard-navigable focus regions. Tab cycles through these; the editor is
 * entered from the Code tab (or Ctrl+E) and left with Esc, so Tab stays free
 * for indentation while typing code.
 */
type Focus = "header" | "list" | "content" | "editor" | "chat" | "assistant" | "footer"
const REGION_CYCLE: Focus[] = ["header", "list", "content", "chat", "footer"]

const FOCUS_LABEL: Record<Focus, string> = {
  header: "header", list: "list", content: "content", editor: "editor", chat: "command", assistant: "assistant", footer: "actions",
}
const FOCUS_HINT: Record<Focus, string> = {
  header: "←→ Enter",
  list: "↑↓ move · Enter open · / search",
  content: "←→ tabs · ↑↓ scroll/files · f full screen",
  editor: "Tab indent · Esc content · Ctrl+L chat",
  chat: "type + Enter send · Esc read · PgUp/PgDn scroll",
  assistant: "↑↓ PgUp/PgDn scroll · Enter type · f full screen",
  footer: "←→ Enter",
}

const HELP_LINES = [
  "Keyboard shortcuts",
  "  Tab / Shift+Tab   move between panes: header · tasks · content · chat · actions",
  "  Esc               editor → content; chat → reading; exit full screen",
  "  f                 toggle full screen for content or AI reading pane",
  "  ?                 open/close help outside text inputs",
  "  F5                save + run tests        F6  submit",
  "  F7                next task               F8  switch platform",
  "  Ctrl+E            editor                  Ctrl+L  ask the assistant",
  "  Ctrl+S            save                    Ctrl+T  language picker",
  "  Ctrl+O            import local exercises",
  "  Ctrl+C            exit (save / discard / cancel if code is unsaved)",
  "  tasks:  ↑↓/jk move · Enter open · / search · r test · s submit · e edit · t next language",
  "  content: ←→ Problem/Code/Tests · ↑↓ PgUp/PgDn Home/End scroll",
  "  Code tab: ↑↓ choose file · Enter edit · Tab indents in editor",
  "  chat: type + Enter send · Esc read · Enter type again · f full screen while reading",
  "  header & actions: ←→ choose a button · Enter activates it",
]

type Tab = "problem" | "code" | "tests"
type Action = { id?: string; label: string; run: () => void; active?: boolean; disabled?: boolean }
type ScrollHandle = ScrollBoxRenderable

function Button(props: { id?: string; label: string; active?: boolean; selected?: boolean; disabled?: boolean; action: () => void }) {
  return <box id={props.id} height={1} flexShrink={0} paddingX={1} backgroundColor={props.selected ? "#2b5580" : props.active ? "#234660" : C.panel} onMouseDown={event => { event.stopPropagation(); if (!props.disabled) props.action() }}>
    <text fg={props.disabled ? C.border : props.active || props.selected ? C.accent : C.text}>{props.label}</text>
  </box>
}

export interface WorkbenchProps {
  state: SessionState
  controller: AppController
  exercise: ExerciseController
  providerLabel?: string
  onExit?: () => void
}

/** Exercise-first UI. Every mouse action and keyboard shortcut uses the same session operation. */
export function Workbench(props: WorkbenchProps) {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const [session, setSession] = createSignal(props.exercise.getState())
  const [focus, setFocus] = createSignal<Focus>("list")
  const [tab, setTab] = createSignal<Tab>("problem")
  const initialExercise = props.exercise.getState()
  const [buffer, setBuffer] = createSignal(initialExercise.buffers[initialExercise.activeFile ?? ""] ?? "")
  const [sending, setSending] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [query, setQuery] = createSignal("")
  const [trackQuery, setTrackQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [picker, setPicker] = createSignal(false)
  const [dialog, setDialog] = createSignal(false)
  const [help, setHelp] = createSignal(false)
  const [importOpen, setImportOpen] = createSignal(false)
  const [exitOpen, setExitOpen] = createSignal(false)
  const finishExit = () => { if (props.onExit) props.onExit(); else renderer.destroy() }
  const [notice, setNotice] = createSignal("")
  const [secret, setSecret] = createSignal("")
  const [narrowView, setNarrowView] = createSignal<"work" | "ai">("work")
  const [fullscreen, setFullscreen] = createSignal<"content" | "assistant" | null>(null)
  const [headerIndex, setHeaderIndex] = createSignal(0)
  const [footerIndex, setFooterIndex] = createSignal(0)
  const [pickerIndex, setPickerIndex] = createSignal(0)
  let prompt: InputRenderable | undefined
  let filter: InputRenderable | undefined
  let list: ScrollHandle | undefined
  let problemScroll: ScrollHandle | undefined
  let testsScroll: ScrollHandle | undefined
  let chatScroll: ScrollHandle | undefined
  let pickerScroll: ScrollHandle | undefined
  let helpScroll: ScrollHandle | undefined
  let credentialIndex = 0
  const credentials: Record<string, string> = {}
  const wide = () => dimensions().width >= 110
  createEffect(() => { setNarrowView(focus() === "chat" || focus() === "assistant" ? "ai" : "work") })
  createEffect(() => {
    if (!fullscreen()) return
    if (focus() === "chat" || focus() === "assistant") setFullscreen("assistant")
    else if (focus() === "content" || focus() === "editor") setFullscreen("content")
    else setFullscreen(null)
  })
  const showWork = () => fullscreen() !== "assistant" && (fullscreen() === "content" || wide() || narrowView() === "work")
  const showAssistant = () => fullscreen() !== "content" && (fullscreen() === "assistant" || wide() || narrowView() === "ai")
  const toggleFullscreen = (pane: "content" | "assistant") => {
    setFocus(pane)
    setFullscreen(fullscreen() === pane ? null : pane)
  }
  const currentSource = () => { session(); return props.exercise.deps.source }
  const canImport = () => props.exercise.getSources().some(source => source.importExercises)
  const openImport = () => { setPicker(false); setHelp(false); setDialog(false); setImportOpen(true) }
  const trySample = async () => {
    if (busy()) return
    const result = await props.exercise.trySample()
    if (!result.ok) { setNotice(result.error.detail); return }
    setNotice(""); setQuery(""); setTab("problem"); setFocus("content")
  }
  const busy = () => session().loading || session().runningTests || session().submitting || session().preparing
  const file = () => session().activeFile
  const items = () => session().exercises.filter(e => `${e.title} ${e.slug}`.toLowerCase().includes(query().toLowerCase()))
  const selectedIndex = () => Math.max(0, items().findIndex(e => e.slug === session().activeSlug))
  const visibleItems = () => {
    const all = items()
    // Small lists render fully so every task is reachable by scrolling and
    // nothing can hide outside a window; only huge catalogs (thousands of
    // questions) window around the selection.
    if (all.length <= 250) return all
    const count = Math.max(3, Math.floor((dimensions().height - 13) / 2)) + 12
    const start = Math.max(0, Math.min(selectedIndex() - Math.floor(count / 2), all.length - count))
    return all.slice(start, start + count)
  }
  // Keyboard navigation must keep the selection on screen.
  createEffect(() => {
    const slug = items()[selectedIndex()]?.slug
    if (!slug || !list) return
    queueMicrotask(() => list?.scrollChildIntoView?.(`exercise-${slug}`))
  })
  const filteredTracks = () => session().tracks.filter(t => `${t.title} ${t.slug}`.toLowerCase().includes(trackQuery().toLowerCase()))
  const trackSupported = (slug: string) => !currentSource().supportedTracks || currentSource().supportedTracks!.includes(slug)
  const openPicker = () => { setTrackQuery(""); setPickerIndex(0); setPicker(true) }
  const closePicker = () => { setPicker(false); setTrackQuery(""); setFocus("list") }
  const chooseTrack = (slug: string) => {
    if (!trackSupported(slug)) return
    closePicker()
    void props.exercise.selectTrack(slug)
  }
  createEffect(() => {
    const track = filteredTracks()[pickerIndex()]
    if (picker() && track) queueMicrotask(() => pickerScroll?.scrollChildIntoView(`track-${track.slug}`))
  })

  const headerActions = (): Action[] => {
    const source = currentSource()
    return [
      ...props.exercise.getSources().map(s => ({
        label: s.label,
        active: source.id === s.id,
        run: () => { setFocus("list"); void props.exercise.switchSource(s.id) },
      })),
      { label: `Language: ${session().activeTrack ?? "select"} ▾`, run: openPicker },
      ...(!source.importExercises ? [{
        label: "Connect",
        run: () => {
          credentialIndex = 0
          setSecret("")
          setNotice(`Enter ${props.exercise.deps.source.connectionFields?.[0] ?? "token"}`)
          setDialog(true)
        },
      }] : []),
      ...(canImport() ? [{ id: "import-exercises", label: "Import · Ctrl+O", run: openImport }] : []),
      ...(props.exercise.deps.sampleDirectory ? [{ id: "try-sample", label: "Try sample", disabled: busy(), run: () => { void trySample() } }] : []),
    ]
  }
  const footerActions = (): Action[] => [
    { label: "Test · F5", disabled: !session().openedSlug || busy(), run: () => void run() },
    { label: "Submit · F6", disabled: !props.exercise.deps.source.submit || !session().openedSlug || busy(), run: () => void submit() },
    { label: "Next task · F7", disabled: busy(), run: () => void next() },
    { label: "Ask AI · Ctrl+L", run: () => { setFocus("chat"); setNarrowView("ai") } },
  ]

  const publish = (text: string) => {
    setBuffer(text)
    props.exercise.setBuffer(text)
    // Empty solution is valid; it keeps the opened file identity.
    props.controller.setActiveFile(file() ?? "(unsaved)", text)
  }
  const previousHook = props.controller.onActiveFileChange
  const previousOpen = props.exercise.deps.onOpenFile
  props.controller.onActiveFileChange = (_path, content) => setBuffer(content)
  props.exercise.deps.onOpenFile = (path, content) => {
    const s = props.exercise.getState()
    props.controller.activateTask(s.openedSlug ? `${props.exercise.deps.source.id}/${s.openedTrack}/${s.openedSlug}` : "scratch")
    props.controller.setActiveFile(path || undefined, content)
    setBuffer(content)
  }
  const unsubscribe = props.exercise.subscribe(setSession)
  onCleanup(() => {
    unsubscribe()
    props.controller.onActiveFileChange = previousHook
    props.exercise.deps.onOpenFile = previousOpen
  })
  onMount(() => { void props.exercise.init() })

  const perform = async (action: () => Promise<void>) => {
    try { await action() } catch (error) { setNotice(String(error)) }
  }
  const open = async (slug = session().activeSlug) => {
    if (!slug || busy()) return
    setNotice("")
    await perform(() => props.exercise.open(slug))
    if (session().openedSlug === slug) { setBuffer(session().buffers[file() ?? ""] ?? ""); setTab("code"); setFocus("editor") }
  }
  const run = async () => {
    if (busy()) return
    await perform(() => props.exercise.runTests())
    setTab("tests")
    setFocus(fullscreen() ? "content" : "list")
  }
  const submit = async () => {
    if (busy() || !props.exercise.deps.source.submit) return
    await perform(async () => {
      const s = session()
      if (!s.lastReport || s.dirty || s.reportRevision !== s.revision) await props.exercise.runTests()
      await props.exercise.submit()
    })
    setTab("tests")
    setFocus("content")
  }
  const next = async () => {
    if (busy()) return
    let slug: string | undefined
    await perform(async () => { slug = await props.exercise.nextExercise() })
    if (slug) await open(slug)
    else setNotice("No next unlocked task in this language")
  }
  const ask = async () => {
    const text = prompt?.value.trim()
    if (!text || sending()) return
    setSending(true)
    setDraft("")
    if (prompt) prompt.value = ""
    try { await props.controller.ask(text) } finally { setSending(false) }
  }
  const connect = async () => {
    const fields = props.exercise.deps.source.connectionFields ?? []
    const field = fields[credentialIndex]
    if (field && secret()) credentials[field] = secret().trim()
    credentialIndex++
    if (credentialIndex < fields.length) {
      setSecret("")
      setNotice(`Enter ${fields[credentialIndex]}`)
      return
    }
    await props.exercise.connect(credentials)
    setSecret("")
    for (const field of fields) delete credentials[field]
    credentialIndex = 0
    setDialog(false)
  }

  usePaste(event => {
    if (!dialog()) return
    setSecret(value => value + new TextDecoder().decode(event.bytes).replace(/[\r\n]/g, ""))
    event.preventDefault()
  })
  useKeyboard(key => {
    const escape = key.name.toLowerCase() === "escape"
    if (exitOpen()) return
    if (key.ctrl && key.name === "c") {
      key.preventDefault()
      if (busy() || importOpen()) { setNotice("Wait for the current operation or close the import dialog before exiting"); return }
      if (session().dirty) setExitOpen(true)
      else finishExit()
      return
    }
    if (importOpen()) return

    // ---------- modal: connection dialog ----------
    if (dialog()) {
      if (escape) { setSecret(""); setNotice(""); setDialog(false); for (const field of Object.keys(credentials)) delete credentials[field] }
      else if (key.name === "return") void connect()
      else if (key.name === "backspace") setSecret(value => value.slice(0, -1))
      else if (!key.ctrl && !key.meta && key.sequence && key.sequence >= " ") setSecret(value => value + key.sequence)
      key.preventDefault()
      return
    }

    // ---------- modal: help overlay ----------
    if (help()) {
      if (escape || key.name === "return" || key.name === "q" || key.sequence === "?") setHelp(false)
      else if (key.name === "up" || key.name === "down") helpScroll?.scrollBy(key.name === "up" ? -1 : 1)
      else if (key.name === "pageup" || key.name === "pagedown") helpScroll?.scrollBy(key.name === "pageup" ? -8 : 8)
      else if (key.name === "home") helpScroll?.scrollTo(0)
      else if (key.name === "end") helpScroll?.scrollTo(helpScroll.scrollHeight)
      key.preventDefault()
      return
    }

    // ---------- modal: language picker ----------
    if (picker()) {
      const tracks = filteredTracks()
      const at = Math.max(0, Math.min(pickerIndex(), tracks.length - 1))
      if (escape) closePicker()
      else if (key.name === "up" || key.name === "down") setPickerIndex(Math.max(0, Math.min(tracks.length - 1, at + (key.name === "up" ? -1 : 1))))
      else if (key.name === "home") setPickerIndex(0)
      else if (key.name === "end") setPickerIndex(Math.max(0, tracks.length - 1))
      else if (key.name === "pageup" || key.name === "pagedown") setPickerIndex(Math.max(0, Math.min(tracks.length - 1, at + (key.name === "pageup" ? -8 : 8))))
      else if (key.name === "return") {
        const track = tracks[at]
        if (track) chooseTrack(track.slug)
      } else return // typing filters in the search input
      key.preventDefault()
      return
    }

    // ---------- global actions ----------
    if (key.ctrl && key.name === "o" && canImport()) { openImport(); key.preventDefault(); return }
    if (key.ctrl && key.name === "l") { setFocus("chat"); setNarrowView("ai"); key.preventDefault(); return }
    if (key.ctrl && key.name === "e") { setFocus(focus() === "editor" ? "list" : "editor"); setNarrowView("work"); setTab("code"); key.preventDefault(); return }
    if (key.ctrl && key.name === "s") { void perform(() => props.exercise.save()); key.preventDefault(); return }
    if (key.ctrl && key.name === "t") { openPicker(); key.preventDefault(); return }
    if (key.name === "f5") { void run(); key.preventDefault(); return }
    if (key.name === "f6") { void submit(); key.preventDefault(); return }
    if (key.name === "f7") { void next(); key.preventDefault(); return }
    if (key.name === "f8") {
      const sources = props.exercise.getSources()
      const index = sources.findIndex(s => s.id === currentSource().id)
      const target = sources[(index + 1) % sources.length]
      if (target) { setFocus("list"); void props.exercise.switchSource(target.id) }
      key.preventDefault(); return
    }
    if (escape) {
      setSearching(false); filter?.blur()
      if (focus() === "editor") setFocus("content")
      else if (focus() === "chat") setFocus("assistant")
      else if (fullscreen()) setFullscreen(null)
      else setFocus("list")
      key.preventDefault(); return
    }

    // Tab belongs to the editor only; all other regions can leave text inputs.
    if (key.name === "tab" && focus() !== "editor") {
      setSearching(false); filter?.blur()
      setFullscreen(null)
      const at = REGION_CYCLE.indexOf(focus() === "assistant" ? "chat" : focus())
      const delta = key.shift ? -1 : 1
      setFocus(REGION_CYCLE[(at + delta + REGION_CYCLE.length) % REGION_CYCLE.length]!)
      key.preventDefault(); return
    }

    // ---------- typing contexts own their keys ----------
    const typing = focus() === "editor" || focus() === "chat" || Boolean(filter?.focused)
    if (typing) {
      if (focus() === "chat" && (key.name === "pageup" || key.name === "pagedown")) {
        chatScroll?.scrollBy?.(key.name === "pageup" ? -10 : 10)
        key.preventDefault()
      }
      return
    }

    // ---------- help and region cycling ----------
    if (key.sequence === "?" || key.name === "?") { setHelp(true); key.preventDefault(); return }
    if (key.name === "f" && !key.ctrl && !key.meta && (focus() === "content" || focus() === "assistant")) {
      toggleFullscreen(focus() === "assistant" ? "assistant" : "content")
      key.preventDefault(); return
    }

    if (focus() === "assistant") {
      if (key.name === "return") setFocus("chat")
      else if (key.name === "up" || key.name === "down") chatScroll?.scrollBy(key.name === "up" ? -3 : 3)
      else if (key.name === "pageup" || key.name === "pagedown") chatScroll?.scrollBy(key.name === "pageup" ? -10 : 10)
      else if (key.name === "home") chatScroll?.scrollTo(0)
      else if (key.name === "end") chatScroll?.scrollTo(chatScroll.scrollHeight)
      else return
      key.preventDefault(); return
    }

    // ---------- per-region keys ----------
    if (focus() === "header") {
      const actions = headerActions()
      const at = Math.max(0, Math.min(headerIndex(), actions.length - 1))
      if (key.name === "left" || key.name === "right") setHeaderIndex(Math.max(0, Math.min(actions.length - 1, at + (key.name === "left" ? -1 : 1))))
      else if (key.name === "return" && !actions[at]?.disabled) actions[at]?.run()
      else return
      key.preventDefault(); return
    }
    if (focus() === "footer") {
      const actions = footerActions()
      const at = Math.max(0, Math.min(footerIndex(), actions.length - 1))
      if (key.name === "left" || key.name === "right") setFooterIndex(Math.max(0, Math.min(actions.length - 1, at + (key.name === "left" ? -1 : 1))))
      else if (key.name === "return" && !actions[at]?.disabled) actions[at]?.run()
      else return
      key.preventDefault(); return
    }
    if (focus() === "content") {
      const scroll = tab() === "tests" ? testsScroll : tab() === "problem" ? problemScroll : undefined
      if (key.name === "left" || key.name === "right") {
        const tabs: Tab[] = ["problem", "code", "tests"]
        const at = tabs.indexOf(tab())
        setTab(tabs[(at + (key.name === "left" ? -1 : 1) + tabs.length) % tabs.length]!)
      } else if (key.name === "return") { setTab("code"); setFocus("editor") }
      else if (tab() === "code" && (key.name === "up" || key.name === "down")) {
        const files = Object.keys(session().buffers)
        const at = files.indexOf(file() ?? "")
        const path = files[(at + (key.name === "up" ? -1 : 1) + files.length) % files.length]
        if (path) props.exercise.chooseFile(path)
      }
      else if (key.name === "up" || key.name === "down") scroll?.scrollBy(key.name === "up" ? -3 : 3)
      else if (key.name === "pageup" || key.name === "pagedown") scroll?.scrollBy?.(key.name === "pageup" ? -12 : 12)
      else if (key.name === "home") scroll?.scrollTo?.(0)
      else if (key.name === "end") scroll?.scrollTo(scroll.scrollHeight)
      else return
      key.preventDefault(); return
    }

    // ---------- task list (default) ----------
    if (key.name === "up" || key.name === "k" || key.name === "down" || key.name === "j") {
      const delta = key.name === "up" || key.name === "k" ? -1 : 1
      const target = items()[Math.max(0, Math.min(items().length - 1, selectedIndex() + delta))]
      if (target) props.exercise.select(target.slug)
    } else if (key.name === "return") void open()
    else if (key.name === "r") void run()
    else if (key.name === "s") void submit()
    else if (key.name === "e") { setTab("code"); setFocus("editor") }
    else if (key.name === "t") void props.exercise.nextTrack()
    else if (key.sequence === "/") { setSearching(true); filter?.focus() }
    else return
    key.preventDefault()
  })

  return <box width="100%" height="100%" flexDirection="column" backgroundColor={C.bg} paddingX={1}>
    <box visible={!fullscreen()} height={3} flexDirection="row" alignItems="center" gap={1}>
      <text fg={C.accent}>SOLVEBENCH</text>
      <For each={headerActions()}>{(action, index) => <Button id={action.id} label={action.label} disabled={importOpen() || exitOpen() || action.disabled} active={action.active} selected={focus() === "header" && headerIndex() === index()} action={action.run} />}</For>
      <Show when={!wide()}><Button label={narrowView() === "work" ? "AI →" : "← Tasks"} action={() => { setNarrowView(narrowView() === "work" ? "ai" : "work"); setFocus(narrowView() === "ai" ? "chat" : "list") }} /></Show>
    </box>
    <Show when={exitOpen()}>
      <box position="absolute" top={0} left={0} width="100%" height="100%" zIndex={29}
        onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()} />
      <ExitDialog save={() => props.exercise.save()} exit={finishExit} cancel={() => setExitOpen(false)} />
    </Show>
    <Show when={importOpen() && !exitOpen()}><ImportDialog onClose={() => setImportOpen(false)} onImport={async path => {
      const result = await props.exercise.importExercises(path)
      if (!result.ok) return result.error.detail
      setQuery(""); setNotice(`Imported ${result.value.length} local exercise(s)`); setFocus("list"); setTab("problem")
      return null
    }} /></Show>
    <Show when={dialog()}>
      <box border borderColor={C.accent} flexDirection="column" paddingX={1} height={8} flexShrink={0}>
        <text height={2}>Connection · {notice()} · Enter to save, Esc to close</text>
        <text height={2} fg={C.dim}>Exercism: Settings → API/CLI token. LeetCode: session cookie and csrftoken (once).</text>
        <text height={1} fg={C.dim}>Credentials are masked and stored locally.</text>
        <text height={1} id="connection-input" fg={C.accent}>{"●".repeat(Math.min(secret().length, 64)) || "Paste the key…"}</text>
      </box>
    </Show>
    <Show when={help()}>
      <scrollbox id="help" ref={node => { helpScroll = node }} position="absolute" top={1} left={1} width={Math.max(20, dimensions().width - 2)} height={Math.max(4, dimensions().height - 3)} zIndex={10} backgroundColor={C.panel} border borderColor={C.accent} flexDirection="column" paddingX={1} title="KEYBOARD SHORTCUTS">
        <For each={HELP_LINES}>{line => <text fg={line.startsWith("  ") ? C.text : C.accent}>{line}</text>}</For>
        <text fg={C.dim}>↑↓ / PgUp/PgDn scroll · Esc or ? to close</text>
      </scrollbox>
    </Show>
    <Show when={picker()}>
      <box border borderColor={C.accent} height={Math.min(16, dimensions().height - 8)} flexShrink={0} flexDirection="column">
        <box height={1} flexShrink={0}><input id="language-search" placeholder="Search languages…" focused onInput={value => { setTrackQuery(value); setPickerIndex(0) }} /></box>
        <scrollbox ref={node => { pickerScroll = node }} flexGrow={1} minHeight={0}><For each={filteredTracks()}>{(track, index) => <box id={`track-${track.slug}`} height={1} flexShrink={0}><Button label={`${track.title}${!trackSupported(track.slug) ? " · environment not available yet" : ""}`} disabled={!trackSupported(track.slug)} active={session().activeTrack === track.slug} selected={pickerIndex() === index()} action={() => chooseTrack(track.slug)} /></box>}</For></scrollbox>
        <text height={1} flexShrink={0} fg={C.dim}>↑↓ choose · Enter select · Esc close</text>
      </box>
    </Show>
    <box flexGrow={1} minHeight={0} flexDirection="row" gap={1}>
      <box visible={showWork()} flexGrow={1} minWidth={0} flexDirection="row" gap={1}>
        <box visible={!fullscreen()} id="exercises" width={wide() ? 26 : 22} border borderColor={focus() === "list" ? C.accent : C.border} backgroundColor={C.panel} flexDirection="column" title={`EXERCISES: ${session().activeTrack ?? ""}`} onMouseDown={() => setFocus("list")}>
          <input id="exercise-search" ref={node => { filter = node }} value={query()} placeholder="/ Search tasks…" focused={showWork() && searching() && focus() === "list" && !picker() && !dialog() && !help() && !importOpen() && !exitOpen()} onInput={value => setQuery(value)} onMouseDown={() => { setFocus("list"); setSearching(true) }} />
          <Show when={session().loading}><text fg={C.dim}>Loading…</text></Show>
          <Show when={currentSource().importExercises && !session().loading && !session().exercises.length}><text fg={C.dim}>Try sample above, or import a folder with Ctrl+O.</text></Show>
          <scrollbox id="exercise-list" ref={node => { list = node }} flexGrow={1} minHeight={0} flexDirection="column">
            <For each={visibleItems()}>{exercise => <box id={`exercise-${exercise.slug}`} height={2} paddingX={1} flexDirection="column" backgroundColor={exercise.slug === session().activeSlug ? "#234660" : C.panel} onMouseDown={() => { props.exercise.select(exercise.slug); void open(exercise.slug) }}>
              <text height={1} wrapMode="none" fg={exercise.progress === "completed" ? C.green : C.text}>{progressMarker(exercise.progress)} {exercise.title.length > (wide() ? 19 : 15) ? `${exercise.title.slice(0, wide() ? 18 : 14)}…` : exercise.title}</text>
              <text height={1} wrapMode="none" fg={C.dim}>{exercise.difficulty}{exercise.progress === "locked" ? " · locked" : ""}</text>
            </box>}</For>
          </scrollbox>
          <text fg={C.dim}>{items().length} tasks · Enter: open</text>
        </box>
        <box id="content-pane" flexGrow={1} minWidth={20} flexDirection="column">
          <box height={3} flexDirection="row" alignItems="center" gap={1}>
            <Button label="Problem" active={tab() === "problem"} action={() => { setTab("problem"); setFocus("content") }} />
            <Button label="Code" active={tab() === "code"} action={() => { setTab("code"); setFocus("editor") }} />
            <Button label="Test results" active={tab() === "tests"} action={() => { setTab("tests"); setFocus("content") }} />
            <Button id="content-fullscreen" label={fullscreen() === "content" ? "Restore · f" : "Full screen · f"} action={() => toggleFullscreen("content")} />
          </box>
          <Show when={tab() === "problem"}>
            <scrollbox id="problem" ref={node => { problemScroll = node }} flexGrow={1} border borderColor={focus() === "content" ? C.accent : C.border} padding={1} title={`PROBLEM: ${session().problem?.title ?? "Select a task"}`} onMouseDown={() => setFocus("content")}>
              <MarkdownView content={session().problem?.body ?? "Pick a task on the left. The problem and starter solution open together."} />
            </scrollbox>
          </Show>
          <Show when={tab() === "code"}>
            <box height={2} flexDirection="row" gap={1}>
              <For each={Object.keys(session().buffers)}>{path => <Button label={path} active={file() === path} action={() => props.exercise.chooseFile(path)} />}</For>
            </box>
            <EditorPane buffer={buffer()} onBufferChange={publish} focused={showWork() && focus() === "editor" && !dialog() && !picker() && !help() && !importOpen() && !exitOpen()} fileName={file() ?? undefined} modified={session().dirty} onFocus={() => setFocus("editor")} />
          </Show>
          <Show when={tab() === "tests"}>
            <scrollbox id="test-results" ref={node => { testsScroll = node }} flexGrow={1} border borderColor={focus() === "content" ? C.accent : C.border} padding={1} title="TEST RESULTS" onMouseDown={() => setFocus("content")}>
              <text fg={session().lastReport?.failed ? C.red : C.green}>{session().lastReport ? `${session().lastReport!.passed}/${session().lastReport!.total} passed · ${session().lastReport!.command}` : "No test run yet"}</text>
              <Show when={session().reportRevision && session().revision !== session().reportRevision}><text fg={C.red}>This result belongs to a previous solution version. Test the current code.</text></Show>
              <text>{session().lastReport?.raw ?? ""}</text>
              <Show when={session().lastSubmit}><text fg={session().lastSubmit?.ok ? C.green : C.red}>{session().lastSubmit?.status ?? "submitted"}: {session().lastSubmit?.message}</text><text>{session().lastSubmit?.url ?? ""}</text></Show>
              <Show when={session().lastSubmit && session().submitRevision !== session().revision}><text fg={C.red}>This upload belongs to a previous solution version; later edits are not submitted yet.</text></Show>
            </scrollbox>
          </Show>
        </box>
      </box>
        <box visible={showAssistant()} id="assistant" width={fullscreen() === "assistant" || !wide() ? "100%" : 38} border borderColor={focus() === "chat" || focus() === "assistant" ? C.accent : C.border} backgroundColor={C.panel} flexDirection="column" title="AI · CHAT">
          <Button id="assistant-fullscreen" label={fullscreen() === "assistant" ? "Restore · f" : "Full screen · f"} action={() => toggleFullscreen("assistant")} />
          <text width="100%" height={1} wrapMode="none" fg={C.dim} content={session().openedSlug ? `Context ready · ${session().openedSlug}` : "Waiting for a task"} />
          <text width="100%" height={1} wrapMode="none" fg={C.dim} content={props.providerLabel ?? "model"} />
          <scrollbox id="chat-log" ref={node => { chatScroll = node }} flexGrow={1} minHeight={0} stickyScroll stickyStart="bottom" paddingX={1} onMouseDown={() => setFocus("assistant")}>
            <For each={props.state.chat}>{message => <box flexDirection="column" flexShrink={0} marginBottom={1}>
              <text height={1} fg={message.role === "user" ? C.accent : C.green}>{message.role === "user" ? "You" : "Assistant"}</text>
              <Show when={message.role === "assistant"} fallback={<text fg={C.text}>{message.text}</text>}>
                <MarkdownView content={message.text} />
              </Show>
            </box>}</For>
          </scrollbox>
          <Show when={sending()}><text fg={C.dim}>Getting a response…</text></Show>
          <input id="chat-input" ref={node => { prompt = node }} value={draft()} onInput={setDraft} placeholder={focus() === "assistant" ? "Enter to type · f full screen" : "Help me…"} focused={showAssistant() && focus() === "chat" && !dialog() && !picker() && !help() && !importOpen() && !exitOpen()} onMouseDown={() => setFocus("chat")} onSubmit={() => { void ask() }} />
        </box>
    </box>
    <box visible={!fullscreen()} height={3} flexDirection="row" alignItems="center" gap={1}>
      <For each={footerActions()}>{(action, index) => <Button label={action.label} disabled={action.disabled} selected={focus() === "footer" && footerIndex() === index()} action={action.run} />}</For>
      <text fg={C.dim}>{session().environment}</text>
    </box>
    <text id="workbench-status" height={1} fg={session().error ? C.red : C.dim}>{session().error ?? (notice() || `focus:${FOCUS_LABEL[focus()]} · ${FOCUS_HINT[focus()]} · Tab panes · ? help · ${session().openedTrack ?? ""}/${session().openedSlug ?? "pick a task"} · ${session().dirty ? "unsaved changes" : "saved"}`)}</text>
  </box>
}
