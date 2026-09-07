function decodeHeadingEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

export function normalizeChapterHeadingText(value: string) {
  return decodeHeadingEntities(value.replace(/<[^>]+>/g, ""))
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

const EMPTY_LEAD_RE =
  /^(?:<(?:p|div)(?:\s[^>]*)?>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/(?:p|div)>\s*)+/i
const LEADING_HEADING_RE = /^<(h[12])(\s[^>]*)?>([\s\S]*?)<\/\1>\s*/i

/** Drop a leading h1/h2 that repeats the outline title (the document already shows that heading). */
export function stripDuplicateChapterHeading(html: string, outlineTitle: string) {
  const expected = normalizeChapterHeadingText(outlineTitle)
  if (!html.trim() || !expected) return html

  const trimmed = html.replace(/^\s+/, "")
  const emptyLead = trimmed.match(EMPTY_LEAD_RE)?.[0] ?? ""
  const afterLead = trimmed.slice(emptyLead.length)
  const heading = afterLead.match(LEADING_HEADING_RE)
  if (!heading) return html
  if (normalizeChapterHeadingText(heading[3] || "") !== expected) return html
  return afterLead.slice(heading[0].length)
}
