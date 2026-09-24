const PAGE_MARKER = /^--\s*(\d+)\s+of\s+(\d+)\s*--\s*$/
const FALLBACK_PAGE_CHARS = 3000

export type TextPage = { pageNumber: number; text: string }

/**
 * Split extracted text into pages. PDF text keeps a "-- N of M --" line after each page;
 * other text is cut into pages of about FALLBACK_PAGE_CHARS at paragraph breaks.
 */
export function splitTextIntoPages(text: string): TextPage[] {
  const source = (text || "").replace(/\r\n?/g, "\n")
  if (!source.trim()) return []

  const lines = source.split("\n")
  if (lines.some((line) => PAGE_MARKER.test(line.trim()))) {
    const pages: TextPage[] = []
    let buffer: string[] = []
    for (const line of lines) {
      const marker = line.trim().match(PAGE_MARKER)
      if (marker) {
        const body = buffer.join("\n").trim()
        if (body) pages.push({ pageNumber: Number(marker[1]), text: body })
        buffer = []
        continue
      }
      buffer.push(line)
    }
    const tail = buffer.join("\n").trim()
    if (tail) pages.push({ pageNumber: (pages.at(-1)?.pageNumber ?? 0) + 1, text: tail })
    return pages
  }

  const paragraphs = source.split(/\n{2,}/)
  const pages: TextPage[] = []
  let current = ""
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > FALLBACK_PAGE_CHARS) {
      pages.push({ pageNumber: pages.length + 1, text: current.trim() })
      current = ""
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph
    while (current.length > FALLBACK_PAGE_CHARS * 2) {
      pages.push({ pageNumber: pages.length + 1, text: current.slice(0, FALLBACK_PAGE_CHARS).trim() })
      current = current.slice(FALLBACK_PAGE_CHARS)
    }
  }
  if (current.trim()) pages.push({ pageNumber: pages.length + 1, text: current.trim() })
  return pages
}
