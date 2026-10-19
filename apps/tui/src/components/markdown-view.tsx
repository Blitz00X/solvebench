import { SyntaxStyle } from "@opentui/core"
import { onCleanup } from "solid-js"

/** Shared prose and code theme for exercise statements and assistant replies. */
export function MarkdownView(props: { content: string }) {
  const syntax = SyntaxStyle.fromStyles({
    default: { fg: "#e2e8f0" },
    "markup.heading": { fg: "#38bdf8", bold: true },
    "markup.heading.1": { fg: "#38bdf8", bold: true },
    "markup.heading.2": { fg: "#7dd3fc", bold: true },
    "markup.heading.3": { fg: "#a5b4fc", bold: true },
    "markup.heading.4": { fg: "#a5b4fc", bold: true },
    "markup.heading.5": { fg: "#a5b4fc", bold: true },
    "markup.heading.6": { fg: "#a5b4fc", bold: true },
    "markup.strong": { fg: "#f8fafc", bold: true },
    "markup.italic": { fg: "#c4b5fd", italic: true },
    "markup.raw": { fg: "#fcd34d", bg: "#1e293b" },
    "markup.raw.block": { fg: "#e2e8f0" },
    "markup.link": { fg: "#7dd3fc" },
    "markup.link.label": { fg: "#7dd3fc", underline: true },
    "markup.link.url": { fg: "#94a3b8", dim: true },
    "markup.list": { fg: "#38bdf8", bold: true },
    "markup.quote": { fg: "#94a3b8", italic: true },
    "markup.strikethrough": { fg: "#94a3b8", dim: true },
    "punctuation.special": { fg: "#64748b" },
    conceal: { fg: "#64748b" },
    keyword: { fg: "#c4b5fd", bold: true },
    string: { fg: "#86efac" },
    number: { fg: "#fdba74" },
    comment: { fg: "#64748b", italic: true },
    function: { fg: "#7dd3fc" },
    type: { fg: "#fcd34d" },
  })
  onCleanup(() => syntax.destroy())
  return <markdown width="100%" flexShrink={0} content={props.content} syntaxStyle={syntax}
    fg="#e2e8f0" conceal concealCode={false} streaming={false} internalBlockMode="top-level"
    tableOptions={{ style: "grid", widthMode: "content", wrapMode: "word", borderColor: "#475569" }} />
}
