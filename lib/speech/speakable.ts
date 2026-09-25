/** The speech model reads at most about 2 000 tokens per request; parts stay well below that. */
const MAX_PART_CHARS = 1500

/** Answer text as it should be spoken: no citation codes, markdown, links or tables. */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/\[citation:\{[\s\S]*?\}\]/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\s*\n\s*\n\s*/g, "\n\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim()
}

/** Splits text at sentence ends so each part can be spoken in one request. */
export function speakableParts(text: string, maxChars = MAX_PART_CHARS): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? []
  const parts: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) parts.push(current)
      current = ""
      for (let start = 0; start < sentence.length; start += maxChars) parts.push(sentence.slice(start, start + maxChars))
      continue
    }
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > maxChars) {
      parts.push(current)
      current = sentence
    } else {
      current = next
    }
  }
  if (current) parts.push(current)
  return parts
}
