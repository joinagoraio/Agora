import { normalizeHelpQuery } from "@/lib/guidance/help-format"

export type AskFormatOptions = {
  question?: string | null
}

const CITATION_PLACEHOLDER = /@@CITE(\d+)@@/g
const CITATION_MARKER = /\[citation:\{[\s\S]*?\}\]/g
const CATALOGUE_INTRO = /\b(they are|these are|the goals are|the measures are|as follows|namely)\s*:?\s*$/i
const LIST_MARKER = /(?:^|\s+)(?:\d+\.|[-*+])(?=\s|$)/g
const QUOTE_LINE = /^\s*(?:(?:[-*+]|\d+\.)\s+)?([“"][^”"]+[”"])\s*(@@CITE\d+@@)?\s*$/
const LONG_QUOTE = /[“"]([^”"]{20,})[”"]/g

export function compileAskAnswer(text: string, options: AskFormatOptions = {}): string {
  if (!text.trim()) return text
  const protectedBlock = protectCitations(text)
  let body = protectedBlock.text.replace(/\r\n/g, "\n").trim()
  body = promoteQuoteLines(body)
  body = promoteInlineQuoteCatalogues(body)
  body = ensureAskHeading(body, options.question)
  body = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return restoreCitations(body, protectedBlock.citations)
}

function protectCitations(text: string): { text: string; citations: string[] } {
  const citations: string[] = []
  const next = text.replace(CITATION_MARKER, (match) => {
    citations.push(match)
    return `@@CITE${citations.length - 1}@@`
  })
  return { text: next, citations }
}

function restoreCitations(text: string, citations: string[]): string {
  return text.replace(CITATION_PLACEHOLDER, (_match, index) => citations[Number(index)] ?? "")
}

function promoteQuoteLines(text: string): string {
  const lines = text.split("\n")
  const out: string[] = []
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length >= 2) {
      out.push(buffer.map((line) => formatQuoteListItem(line)).join("\n"))
    } else {
      out.push(...buffer)
    }
    buffer = []
  }

  for (const line of lines) {
    if (QUOTE_LINE.test(line.trim())) {
      buffer.push(line.trim())
      continue
    }
    flush()
    out.push(line)
  }
  flush()
  return out.join("\n")
}

function formatQuoteListItem(line: string): string {
  const match = line.trim().match(QUOTE_LINE)
  if (!match) return line
  const citation = match[2] ? ` ${match[2]}` : ""
  return `- ${match[1]}${citation}`
}

function promoteInlineQuoteCatalogues(text: string): string {
  return text
    .split(/\n\n+/)
    .map((block) => {
      if (/^[-*]\s+[“"]/.test(block.trim()) || block.includes("\n- ")) return block
      const quotes = [...block.matchAll(LONG_QUOTE)]
      if (quotes.length < 3) return block
      let lead = block
      for (const quote of quotes) {
        lead = lead.replace(quote[0], " ")
      }
      lead = lead
        .replace(LIST_MARKER, " ")
        .replace(/\s+/g, " ")
        .replace(CATALOGUE_INTRO, "")
        .replace(/[:]\s*$/g, "")
        .trim()
      const list = quotes.map((quote) => `- ${quote[0]}`).join("\n")
      return [lead, list].filter(Boolean).join("\n\n")
    })
    .join("\n\n")
}

function ensureAskHeading(text: string, question?: string | null): string {
  if (/^#{1,2}\s/m.test(text)) return text
  if (!/(^|\n)\s*[-*]\s+/.test(text)) return text
  const heading = headingFromAskQuestion(question)
  if (!heading) return text
  return `## ${heading}\n\n${text}`
}

function headingFromAskQuestion(question?: string | null): string | null {
  if (!question?.trim()) return null
  const key = normalizeHelpQuery(question)
  if (!key || key.length > 48 || key.split(/\s+/).length > 6) return null
  if (/^(how|hoe|can|where|waar|why|waarom)\b/i.test(key) && key.split(/\s+/).length > 4) {
    return null
  }
  return key
    .split(/\s+/)
    .map((word, index) => {
      if (word === word.toUpperCase() && word.length > 1) return word
      if (index > 0 && /^(and|or|of|the|a|an|to|in|on)$/i.test(word)) return word.toLowerCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}
