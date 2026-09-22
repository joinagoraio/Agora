export type ProgrammeCitationSource = {
  id: string
  title: string
  documentRole?: string | null
  label?: string | null
}

export type ProgrammeCitationMarker = {
  quote: string
  documentId?: string
  pageNumber?: number
}

export type ProgrammeCitationHit = {
  start: number
  end: number
  citation: ProgrammeCitationMarker
}

function decodeCitationJson(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

export function findProgrammeCitationMarkers(text: string): ProgrammeCitationHit[] {
  const hits: ProgrammeCitationHit[] = []
  const opener = /\[citation:\s*\{/gi
  let match: RegExpExecArray | null
  while ((match = opener.exec(text))) {
    const jsonStart = match.index + match[0].length - 1
    let depth = 0
    let jsonEnd = -1
    for (let index = jsonStart; index < text.length; index += 1) {
      const char = text[index]
      if (char === "{") depth += 1
      else if (char === "}") {
        depth -= 1
        if (depth === 0) {
          jsonEnd = index
          break
        }
      }
    }
    if (jsonEnd < 0 || text[jsonEnd + 1] !== "]") continue
    const end = jsonEnd + 2
    try {
      const parsed = JSON.parse(decodeCitationJson(text.slice(jsonStart, jsonEnd + 1))) as {
        quote?: unknown
        documentId?: unknown
        pageNumber?: unknown
      }
      const quote = typeof parsed.quote === "string" ? parsed.quote.trim() : ""
      if (!quote) continue
      const documentId = typeof parsed.documentId === "string" ? parsed.documentId.trim() : ""
      const pageNumber =
        typeof parsed.pageNumber === "number" && Number.isFinite(parsed.pageNumber)
          ? parsed.pageNumber
          : undefined
      hits.push({
        start: match.index,
        end,
        citation: {
          quote,
          documentId: documentId || undefined,
          pageNumber,
        },
      })
      opener.lastIndex = end
    } catch {
      opener.lastIndex = jsonEnd + 1
    }
  }
  return hits
}

function shortSourceTitle(title: string): string {
  const trimmed = title.trim()
  const headed = trimmed.split(/\s+[—–]\s+|\s+-\s+/)[0]?.trim() || trimmed
  const looksLikeFile = /\.[a-z0-9]{1,5}$/i.test(headed) || /^\d+[-_]/.test(headed) || headed.includes("_")
  const name = looksLikeFile
    ? headed
        .replace(/\.[a-z0-9]{1,5}$/i, "")
        .replace(/^\d+[-_.\s]+/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : headed
  const short = name.length > 36 ? `${name.slice(0, 33).trimEnd()}…` : name
  if (!short) return ""
  return short.charAt(0).toUpperCase() + short.slice(1)
}

export function plainCitationQuote(quote: string): string {
  return quote.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
}

export function programmeCitationLabel(input: {
  title?: string | null
  label?: string | null
  pageNumber?: number | null
  index: number
}): string {
  const named = input.label?.trim() || shortSourceTitle(input.title || "")
  const short = named.length > 36 ? `${named.slice(0, 33).trimEnd()}…` : named
  const page = input.pageNumber ? `p.${input.pageNumber}` : ""
  if (short && page) return `${short}, ${page}`
  if (short) return short
  if (page) return page
  return String(input.index)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function programmeCitationAnchorHtml(
  citation: ProgrammeCitationMarker,
  sources: ProgrammeCitationSource[],
  index: number,
  workspaceId?: string | null,
): string {
  const source = citation.documentId
    ? sources.find((item) => item.id === citation.documentId)
    : undefined
  const title = source?.title?.trim() || ""
  const quote = plainCitationQuote(citation.quote)
  const label = programmeCitationLabel({
    title,
    label: source?.label,
    pageNumber: citation.pageNumber,
    index,
  })
  const href =
    workspaceId && citation.documentId
      ? `/workspaces/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(citation.documentId)}`
      : ""
  const attrs = [
    `class="programme-citation"`,
    `data-citation-title="${escapeHtml(title)}"`,
    `data-citation-quote="${escapeHtml(quote)}"`,
    href ? `href="${escapeHtml(href)}"` : "",
    href ? `target="_blank"` : "",
    href ? `rel="noreferrer"` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const tag = href ? "a" : "span"
  return `<${tag} ${attrs}>${escapeHtml(label)}</${tag}>`
}

export function renderProgrammeCitationHtml(
  html: string,
  input: { sources?: ProgrammeCitationSource[]; workspaceId?: string | null } = {},
): string {
  const sources = input.sources || []
  const hits = findProgrammeCitationMarkers(html)
  if (hits.length === 0) return html
  let cursor = 0
  let next = ""
  hits.forEach((hit, index) => {
    next += html.slice(cursor, hit.start)
    next += programmeCitationAnchorHtml(hit.citation, sources, index + 1, input.workspaceId)
    cursor = hit.end
  })
  next += html.slice(cursor)
  return next
}
