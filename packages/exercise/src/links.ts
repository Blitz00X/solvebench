/**
 * Reference-style links (`["Hello, World!"][ref]` plus a `[ref]: url`
 * definition) are legal markdown but their definition lines render as noise in
 * the terminal and in the model's context. Resolve every usage to an inline
 * link and drop the definition lines.
 */
export function resolveReferenceLinks(markdown: string): string {
  const definitions = new Map<string, string>()
  const kept: string[] = []
  for (const line of markdown.split("\n")) {
    const definition = line.match(/^ {0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+"[^"]*")?\s*$/)
    if (definition) {
      definitions.set(definition[1]!.trim().toLowerCase(), definition[2]!)
      continue
    }
    kept.push(line)
  }
  if (definitions.size === 0) return markdown
  return kept
    .join("\n")
    .replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (whole, label: string, ref: string) => {
      const url = definitions.get((ref || label).trim().toLowerCase())
      return url ? `[${label}](${url})` : whole
    })
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
}
