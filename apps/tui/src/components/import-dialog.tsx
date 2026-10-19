import { createSignal } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"

export function ImportDialog(props: {
  onImport: (path: string) => Promise<string | null>
  onClose: () => void
}) {
  const dimensions = useTerminalDimensions()
  const [path, setPath] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")
  const submit = async () => {
    if (busy()) return
    if (!path().trim()) { setError("Enter an exercise or collection folder path"); return }
    setBusy(true); setError("")
    try {
      const message = await props.onImport(path().trim())
      if (message) setError(message)
      else props.onClose()
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  useKeyboard(key => {
    if (key.name === "escape") { if (!busy()) props.onClose(); key.preventDefault() }
    else if (busy()) key.preventDefault()
  })
  return <box id="import-dialog" position="absolute" top={2} left={1}
    width={Math.max(20, dimensions().width - 2)} height={Math.max(10, dimensions().height - 4)}
    zIndex={20} border borderColor="#38bdf8" backgroundColor="#151e2e" padding={1} flexDirection="column" title="IMPORT EXERCISES">
    <text height={2}>Choose a local exercise folder or a collection containing exercise folders.</text>
    <text height={2}>Each exercise needs exercise.json, its statement and solution files. Test commands run when you press Test.</text>
    <input id="import-path" placeholder="/home/you/my-exercises" value={path()} focused={!busy()} onInput={setPath} onSubmit={() => { void submit() }} />
    <box height={2} marginTop={1} flexDirection="row" gap={2}>
      <box id="confirm-import" paddingX={1} backgroundColor="#234660" onMouseDown={event => { event.stopPropagation(); void submit() }}><text>{busy() ? "Importing…" : "Import · Enter"}</text></box>
      <box id="cancel-import" paddingX={1} onMouseDown={event => { event.stopPropagation(); if (!busy()) props.onClose() }}><text>Cancel · Esc</text></box>
    </box>
    <scrollbox flexGrow={1} minHeight={0}><text fg="#fb7185">{error()}</text></scrollbox>
  </box>
}
