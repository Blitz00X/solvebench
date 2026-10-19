import { SyntaxStyle, type ContentChangeEvent, type TextareaRenderable } from "@opentui/core"
import { createEffect, on, onCleanup } from "solid-js"

export interface EditorPaneProps {
  /** Content to show. Changes from outside (file opened) replace the buffer. */
  buffer: string
  /** Called with the full current text whenever the human edits the buffer. */
  onBufferChange?: (text: string) => void
  focused?: boolean
  fileName?: string
  modified?: boolean
  onFocus?: () => void
}

interface EditorHandle {
  plainText?: string
  setText?: (text: string) => void
  insertText?: (text: string) => void
  clearAllHighlights?: () => void
  addHighlightByCharRange?: (highlight: { start: number; end: number; styleId: number }) => void
}

/**
 * Center pane: the human-owned editable buffer. This is the single source of
 * truth for "the code on screen": what is typed here is what the agent gets.
 *
 * The synchronization is deliberately one-directional per source:
 *   - human edits -> onBufferChange (the controller learns the new text)
 *   - external file loads -> setText (without echoing back an edit event)
 */
export function EditorPane(props: EditorPaneProps) {
  let editor: EditorHandle | undefined
  let applyingExternal = false
  let lastExternal = props.buffer
  const syntax = SyntaxStyle.fromStyles({ keyword: { fg: "#c4b5fd", bold: true }, string: { fg: "#86efac" }, number: { fg: "#fdba74" }, comment: { fg: "#64748b", italic: true } })
  onCleanup(() => syntax.destroy())
  const highlight = () => {
    const text = editor?.plainText ?? ""
    editor?.clearAllHighlights?.()
    const tokens = /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:class|public|private|protected|static|void|int|float|double|return|if|else|for|while|def|import|from|const|let|function|async|await|export|fn|pub|use|struct|func|package|var|new|true|false|null|None|self)\b|\b\d+(?:\.\d+)?\b/g
    for (const match of text.matchAll(tokens)) {
      const token = match[0], scope = token.startsWith("//") || token.startsWith("#") || token.startsWith("/*") ? "comment" : token.startsWith('"') || token.startsWith("'") ? "string" : /^\d/.test(token) ? "number" : "keyword"
      editor?.addHighlightByCharRange?.({ start: match.index!, end: match.index! + token.length, styleId: syntax.getStyleId(scope)! })
    }
  }

  // External content changes (opening a file, reload) replace the buffer.
  createEffect(
    on(
      () => props.buffer,
      (next) => {
        if (next === lastExternal) return
        lastExternal = next
        if (!editor?.setText) return
        applyingExternal = true
        editor.setText(next)
        highlight()
        applyingExternal = false
      },
    ),
  )

  const publish = () => {
    if (applyingExternal) return
    const text = editor?.plainText
    if (typeof text === "string") {
      lastExternal = text
      props.onBufferChange?.(text)
      highlight()
    }
  }

  return (
    <box
      id="workspace"
      flexGrow={1}
      height="100%"
      borderStyle="single"
      flexDirection="column"
      title={`EDIT${props.fileName ? `: ${props.fileName}` : ""}${props.modified ? " *" : ""}`}
    >
      <line_number flexGrow={1} fg="#64748b" paddingRight={1}>
      <textarea
        id="editor"
        ref={(node: unknown) => {
          editor = node as EditorHandle
          // Seed the controller with what the editor actually holds at mount.
          queueMicrotask(() => {
            const text = editor?.plainText
            if (typeof text === "string" && text.length > 0) props.onBufferChange?.(text)
          })
        }}
        initialValue={props.buffer}
        flexGrow={1}
        focused={props.focused ?? true}
        syntaxStyle={syntax}
        onMouseDown={() => props.onFocus?.()}
        onKeyDown={key => {
          if (key.name === "tab" && !key.shift && !key.ctrl && !key.meta) {
            editor?.insertText?.("    ")
            key.preventDefault()
          }
        }}
        onContentChange={(_event: ContentChangeEvent) => publish()}
      />
      </line_number>
    </box>
  )
}
