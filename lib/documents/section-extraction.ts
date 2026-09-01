/**
 * S2a: section extraction from ingested page text / text items.
 * Used at upload (rebuild) and for citation→section resolution.
 */

export type PageInput = {
  pageNumber: number
  textContent: string
  textItems?: Array<{
    text: string
    fontSize?: number
    y?: number
  }>
}

export type DocumentSection = {
  id: string
  title: string
  level: number
  pageNumber: number
  /** Character offset of the heading within the page textContent (best effort). */
  startOffset: number
  detection: "numbered" | "chapter" | "all_caps" | "font_size" | "markdown" | "nl_title"
}

const NUMBERED_HEADING =
  /^(?:(?:chapter|hoofdstuk|section|paragraaf|artikel)\s+)?(\d+(?:\.\d+){0,4})\.?\s+([A-ZÁÉÍÓÚÄËÏÖÜÀÈÌÒÙa-záéíóúäëïöüàèìòù][^\n]{2,120})$/i

const CHAPTER_HEADING =
  /^(?:chapter|hoofdstuk|deel|part)\s+(\d+|[IVXLC]+)[:.\s]+([^\n]{3,120})$/i

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+)$/

/** Common Dutch / bilingual programme section titles without numeric prefixes. */
const NL_TITLE_HEADING =
  /^(inleiding|samenvatting|leeswijzer|begrippenlijst|begrippen|bijlage(?:\s+[a-z0-9.-]+)?|conclusie|conclusies|doelstelling(?:en)?|ambitie(?:s)?|maatregelen|uitvoering|monitoring|communicatie|juridische\s+grondslag|beleidskader|reikwijdte|afkortingen)\b(?:\s*[:–—-]\s*(.+))?$/i

function medianFontSize(items: NonNullable<PageInput["textItems"]>): number {
  const sizes = items.map((i) => i.fontSize).filter((n): n is number => typeof n === "number" && n > 0)
  if (sizes.length === 0) return 12
  const sorted = [...sizes].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 12
}

function pushUnique(sections: DocumentSection[], next: DocumentSection) {
  const key = `${next.pageNumber}:${next.title.toLowerCase()}`
  if (sections.some((s) => `${s.pageNumber}:${s.title.toLowerCase()}` === key)) return
  sections.push(next)
}

/**
 * Reject lines that are unlikely to be headings (lists, page markers, long prose).
 */
export function looksLikeFalsePositiveHeading(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (/^(pagina|page|blz\.?)\s*\d+\s*$/i.test(trimmed)) return true
  if (/^\d+\s*$/.test(trimmed)) return true
  if (/^https?:\/\//i.test(trimmed)) return true
  if (/^[•·▪▫◦]\s/.test(trimmed)) return true
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > 14) return true
  // Sentence-like: many words and ends with sentence punctuation
  if (words.length >= 8 && /[.!?]$/.test(trimmed)) return true
  // List-ish numbered item that continues as a full sentence
  if (/^\d+\.\s+[a-z]/.test(trimmed) && words.length >= 10) return true
  // Table-ish
  if ((trimmed.match(/\|/g) || []).length >= 2) return true
  return false
}

/**
 * Extract candidate sections from page text.
 * Prefers numbered / chapter / markdown / NL titles; falls back to ALL CAPS and large fonts.
 */
export function extractSectionsFromPages(pages: PageInput[]): DocumentSection[] {
  const sections: DocumentSection[] = []
  let counter = 0

  for (const page of pages) {
    const lines = page.textContent
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)

    for (const line of lines) {
      if (looksLikeFalsePositiveHeading(line)) continue

      const md = line.match(MARKDOWN_HEADING)
      if (md) {
        const title = md[2].trim()
        if (looksLikeFalsePositiveHeading(title)) continue
        pushUnique(sections, {
          id: `sec_${++counter}`,
          title,
          level: md[1].length,
          pageNumber: page.pageNumber,
          startOffset: Math.max(0, page.textContent.indexOf(line)),
          detection: "markdown",
        })
        continue
      }

      const numbered = line.match(NUMBERED_HEADING)
      if (numbered) {
        const depth = numbered[1].split(".").length
        const title = `${numbered[1]} ${numbered[2].trim()}`
        if (looksLikeFalsePositiveHeading(title)) continue
        pushUnique(sections, {
          id: `sec_${++counter}`,
          title,
          level: Math.min(depth, 6),
          pageNumber: page.pageNumber,
          startOffset: Math.max(0, page.textContent.indexOf(line)),
          detection: "numbered",
        })
        continue
      }

      const chapter = line.match(CHAPTER_HEADING)
      if (chapter) {
        pushUnique(sections, {
          id: `sec_${++counter}`,
          title: line,
          level: 1,
          pageNumber: page.pageNumber,
          startOffset: Math.max(0, page.textContent.indexOf(line)),
          detection: "chapter",
        })
        continue
      }

      const nl = line.match(NL_TITLE_HEADING)
      if (nl) {
        const subtitle = (nl[2] || "").trim()
        const title = subtitle ? `${nl[1]}: ${subtitle}` : nl[1]
        pushUnique(sections, {
          id: `sec_${++counter}`,
          title,
          level: 1,
          pageNumber: page.pageNumber,
          startOffset: Math.max(0, page.textContent.indexOf(line)),
          detection: "nl_title",
        })
        continue
      }

      // ALL CAPS short heading (policy docs often use this)
      if (
        line.length >= 6 &&
        line.length <= 80 &&
        /[A-ZÁÉÍÓÚ]{3}/.test(line) &&
        line === line.toUpperCase() &&
        /[A-ZÁÉÍÓÚ]/.test(line) &&
        !/[.!?]$/.test(line) &&
        !/\d{4}/.test(line) // years / codes often not section titles alone
      ) {
        pushUnique(sections, {
          id: `sec_${++counter}`,
          title: line,
          level: 2,
          pageNumber: page.pageNumber,
          startOffset: Math.max(0, page.textContent.indexOf(line)),
          detection: "all_caps",
        })
      }
    }

    // Font-size heuristic: lines whose average fontSize is clearly above page median
    if (page.textItems && page.textItems.length > 0) {
      const median = medianFontSize(page.textItems)
      const threshold = median * 1.35
      let buffer = ""
      let bufferSizes: number[] = []
      let bufferStartY: number | undefined

      const flush = () => {
        const title = buffer.trim()
        if (!title || title.length < 4 || title.length > 120 || looksLikeFalsePositiveHeading(title)) {
          buffer = ""
          bufferSizes = []
          return
        }
        const avg = bufferSizes.reduce((a, b) => a + b, 0) / bufferSizes.length
        if (avg >= threshold) {
          pushUnique(sections, {
            id: `sec_${++counter}`,
            title,
            level: avg >= median * 1.8 ? 1 : 2,
            pageNumber: page.pageNumber,
            startOffset: Math.max(0, page.textContent.indexOf(title)),
            detection: "font_size",
          })
        }
        buffer = ""
        bufferSizes = []
        bufferStartY = undefined
      }

      for (const item of page.textItems) {
        const size = item.fontSize ?? median
        const y = item.y
        const gap = bufferStartY !== undefined && y !== undefined ? Math.abs(y - bufferStartY) : 0
        if (buffer && gap > size * 1.5) flush()
        buffer += (buffer ? " " : "") + item.text
        bufferSizes.push(size)
        if (bufferStartY === undefined) bufferStartY = y
        if (/[.!?]$/.test(item.text) || buffer.length > 120) flush()
      }
      flush()
    }
  }

  return sections
}

/**
 * Resolve a citation target to the best matching section on the same page (title containment).
 */
export function resolveSectionForQuote(
  sections: DocumentSection[],
  pageNumber: number,
  quote: string,
  pageText: string,
): DocumentSection | null {
  const onPage = sections.filter((s) => s.pageNumber === pageNumber)
  if (onPage.length === 0) return null

  const quoteIndex = pageText.indexOf(quote)
  if (quoteIndex === -1) {
    return onPage[0] ?? null
  }

  let best: DocumentSection | null = null
  for (const section of onPage) {
    if (section.startOffset <= quoteIndex) {
      if (!best || section.startOffset >= best.startOffset) best = section
    }
  }
  return best ?? onPage[0] ?? null
}
