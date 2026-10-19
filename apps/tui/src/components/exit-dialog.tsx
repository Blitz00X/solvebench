import { createSignal } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"

export function ExitDialog(props: { save: () => Promise<void>; exit: () => void; cancel: () => void }) {
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal(0)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal("")
  const activate = async (index: number) => {
    if (saving()) return
    if (index === 2) { props.cancel(); return }
    if (index === 1) { props.exit(); return }
    setSaving(true); setError("")
    try { await props.save(); props.exit() }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }
  useKeyboard(key => {
    key.preventDefault()
    if (saving()) return
    if (key.name === "escape") props.cancel()
    else if (key.name === "left" || key.name === "right" || key.name === "tab") {
      const delta = key.name === "left" || key.shift ? -1 : 1
      setSelected((selected() + delta + 3) % 3)
    } else if (key.name === "return") void activate(selected())
  })
  return <box position="absolute" top={2} left={1} zIndex={30} width={Math.max(20, dimensions().width - 2)}
    height={Math.max(10, Math.min(15, dimensions().height - 4))} border borderColor="#fbbf24" backgroundColor="#151e2e" padding={1} flexDirection="column" title="UNSAVED CHANGES">
    <text height={2}>Save the current solution before exiting?</text>
    <box flexDirection="row" gap={1} height={2}>
      {(["Save and exit", "Discard and exit", "Cancel"] as const).map((label, index) =>
        <box paddingX={1} backgroundColor={selected() === index ? "#234660" : "#151e2e"}
          onMouseDown={event => { event.stopPropagation(); void activate(index) }}>
          <text>{index === 0 && saving() ? "Saving…" : label}</text>
        </box>)}
    </box>
    <text height={2}>←/→ or Tab choose · Enter confirm · Esc cancel</text>
    <scrollbox flexGrow={1} minHeight={0}><text fg="#fb7185">{error()}</text></scrollbox>
  </box>
}
