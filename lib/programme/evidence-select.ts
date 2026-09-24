import type { SupabaseClient } from "@supabase/supabase-js"

import { extractSectionsFromPages } from "@/lib/documents/section-extraction"
import { splitTextIntoPages, type TextPage } from "@/lib/documents/text-pages"

/** A readable piece of a source: one section (or part of one), with the page it starts on. */
export type EvidenceSpan = {
  documentId: string
  documentTitle: string
  sectionId: string | null
  title: string
  pageNumber: number
  text: string
}

export type EvidenceDocument = {
  id: string
  title: string
  outline: Array<{ title: string; pageNumber: number }>
  pageCount: number
}

export type EvidenceSelection = {
  text: string
  spans: EvidenceSpan[]
  documents: EvidenceDocument[]
  /** Pieces read and pieces available, for provenance. */
  used: number
  total: number
}

type SectionRow = { id: string; title: string; page_number: number; start_offset: number }

const MAX_SPAN_CHARS = 2400
const STOPWORDS = new Set(
  (
    "de het een en van in op te dat die voor met is zijn niet aan er om als ook bij door naar uit over dan tot of maar wordt worden kan deze dit wij we ons onze hun hen " +
    "the a an and of in on to that for with is are be as at by from or not this these we our their it its can will"
  ).split(" "),
)

export function tokenizeEvidence(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

/** Cut pages into spans that run from one section heading to the next. */
export function buildEvidenceSpans(input: {
  documentId: string
  documentTitle: string
  pages: TextPage[]
  sections: SectionRow[]
}): EvidenceSpan[] {
  const pages = [...input.pages].sort((a, b) => a.pageNumber - b.pageNumber)
  const starts = [...input.sections]
    .filter((section) => pages.some((page) => page.pageNumber === section.page_number))
    .sort((a, b) => a.page_number - b.page_number || a.start_offset - b.start_offset)

  const raw: EvidenceSpan[] = []
  if (starts.length === 0) {
    for (const page of pages) {
      raw.push({
        documentId: input.documentId,
        documentTitle: input.documentTitle,
        sectionId: null,
        title: `p. ${page.pageNumber}`,
        pageNumber: page.pageNumber,
        text: page.text,
      })
    }
  } else {
    const firstPage = pages[0]
    const firstStart = starts[0]!
    if (firstPage && (firstPage.pageNumber < firstStart.page_number || firstStart.start_offset > 0)) {
      const lead = pages
        .filter((page) => page.pageNumber < firstStart.page_number)
        .map((page) => page.text)
        .concat(
          pages
            .filter((page) => page.pageNumber === firstStart.page_number)
            .map((page) => page.text.slice(0, firstStart.start_offset)),
        )
        .join("\n")
        .trim()
      if (lead) {
        raw.push({
          documentId: input.documentId,
          documentTitle: input.documentTitle,
          sectionId: null,
          title: `p. ${firstPage.pageNumber}`,
          pageNumber: firstPage.pageNumber,
          text: lead,
        })
      }
    }
    starts.forEach((section, index) => {
      const next = starts[index + 1]
      const parts: string[] = []
      for (const page of pages) {
        if (page.pageNumber < section.page_number) continue
        if (next && page.pageNumber > next.page_number) break
        const from = page.pageNumber === section.page_number ? section.start_offset : 0
        const to = next && page.pageNumber === next.page_number ? next.start_offset : page.text.length
        if (to > from) parts.push(page.text.slice(from, to))
      }
      const text = parts.join("\n").trim()
      if (!text) return
      raw.push({
        documentId: input.documentId,
        documentTitle: input.documentTitle,
        sectionId: section.id,
        title: section.title,
        pageNumber: section.page_number,
        text,
      })
    })
  }

  const spans: EvidenceSpan[] = []
  for (const span of raw) {
    if (span.text.length <= MAX_SPAN_CHARS) {
      spans.push(span)
      continue
    }
    for (let offset = 0; offset < span.text.length; offset += MAX_SPAN_CHARS) {
      spans.push({ ...span, text: span.text.slice(offset, offset + MAX_SPAN_CHARS) })
    }
  }
  return spans
}

/** Rank spans against the task with BM25; section titles count double. */
export function scoreEvidenceSpans(spans: EvidenceSpan[], query: string): number[] {
  const terms = [...new Set(tokenizeEvidence(query))]
  if (terms.length === 0) return spans.map(() => 0)
  const docs = spans.map((span) => [...tokenizeEvidence(span.title), ...tokenizeEvidence(span.title), ...tokenizeEvidence(span.text)])
  const avg = docs.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(docs.length, 1)
  const df = new Map<string, number>()
  for (const tokens of docs) for (const term of new Set(tokens)) df.set(term, (df.get(term) || 0) + 1)
  const k1 = 1.4
  const b = 0.75
  return docs.map((tokens) => {
    const tf = new Map<string, number>()
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1)
    let score = 0
    for (const term of terms) {
      const frequency = tf.get(term)
      if (!frequency) continue
      const idf = Math.log(1 + (docs.length - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5))
      score += (idf * frequency * (k1 + 1)) / (frequency + k1 * (1 - b + (b * tokens.length) / Math.max(avg, 1)))
    }
    return score
  })
}

/** Take the best spans within a budget, with at least one piece of every document. */
export function selectEvidenceSpans(spans: EvidenceSpan[], query: string, budgetChars: number): EvidenceSpan[] {
  const scores = scoreEvidenceSpans(spans, query)
  const ranked = spans.map((span, index) => ({ span, score: scores[index] ?? 0, index })).sort((a, b) => b.score - a.score || a.index - b.index)
  const chosen = new Set<number>()
  let used = 0
  const take = (index: number) => {
    const span = spans[index]!
    if (chosen.has(index) || used + span.text.length > budgetChars) return
    chosen.add(index)
    used += span.text.length
  }
  const documentIds = [...new Set(spans.map((span) => span.documentId))]
  for (const documentId of documentIds) {
    const best = ranked.find((entry) => entry.span.documentId === documentId)
    if (best) take(best.index)
  }
  for (const entry of ranked) {
    if (entry.score <= 0 && chosen.size >= documentIds.length) break
    take(entry.index)
  }
  return [...chosen].sort((a, b) => a - b).map((index) => spans[index]!)
}

export function formatEvidenceSelection(documents: EvidenceDocument[], spans: EvidenceSpan[]): string {
  return documents
    .map((document) => {
      const outline = document.outline.length
        ? `Contents (${document.pageCount} pages): ${document.outline.map((entry) => `${entry.title} (p.${entry.pageNumber})`).join("; ")}`
        : `Pages: ${document.pageCount}`
      const pieces = spans
        .filter((span) => span.documentId === document.id)
        .map(
          (span) =>
            `#### ${span.title} (id=${span.documentId}${span.sectionId ? ` sectionId=${span.sectionId}` : ""} p.${span.pageNumber})\n${span.text}`,
        )
      return [`### ${document.title} (id=${document.id})`, outline.slice(0, 4000), ...pieces].join("\n")
    })
    .join("\n\n")
}

/** Fill a missing page number from the section or document piece the quote came from. */
export function withCitationPages<T extends { documentId: string; sectionId?: string; pageNumber?: number; quote?: string }>(
  citations: T[],
  spans: EvidenceSpan[],
): T[] {
  return citations.map((citation) => {
    if (citation.pageNumber) return citation
    const bySection = citation.sectionId ? spans.find((span) => span.sectionId === citation.sectionId) : undefined
    const quote = citation.quote?.trim().slice(0, 80)
    const byQuote = !bySection && quote
      ? spans.find((span) => span.documentId === citation.documentId && span.text.includes(quote))
      : undefined
    const page = (bySection || byQuote)?.pageNumber
    return page ? { ...citation, pageNumber: page } : citation
  })
}

/** Load pages and sections for documents and pick the evidence for one task. */
export async function selectEvidenceForTask(input: {
  supabase: SupabaseClient
  documents: Array<{ id: string; title: string | null; content: string | null }>
  query: string
  budgetChars?: number
}): Promise<EvidenceSelection> {
  const ids = input.documents.map((document) => document.id)
  if (ids.length === 0) return { text: "", spans: [], documents: [], used: 0, total: 0 }
  const [pagesResult, sectionsResult] = await Promise.all([
    input.supabase.from("document_pages").select("document_id, page_number, text_content").in("document_id", ids),
    input.supabase.from("document_sections").select("id, document_id, title, page_number, start_offset").in("document_id", ids),
  ])
  const pagesByDoc = new Map<string, TextPage[]>()
  for (const row of pagesResult.data || []) {
    const list = pagesByDoc.get(row.document_id) || []
    list.push({ pageNumber: row.page_number, text: row.text_content || "" })
    pagesByDoc.set(row.document_id, list)
  }
  const sectionsByDoc = new Map<string, SectionRow[]>()
  for (const row of sectionsResult.data || []) {
    const list = sectionsByDoc.get(row.document_id) || []
    list.push({ id: row.id, title: row.title, page_number: row.page_number, start_offset: row.start_offset })
    sectionsByDoc.set(row.document_id, list)
  }

  const allSpans: EvidenceSpan[] = []
  const documents: EvidenceDocument[] = []
  for (const document of input.documents) {
    const title = document.title || document.id
    let pages = (pagesByDoc.get(document.id) || []).filter((page) => page.text.trim())
    let sections = sectionsByDoc.get(document.id) || []
    const pageChars = pages.reduce((sum, page) => sum + page.text.length, 0)
    const content = (document.content || "").replace(/<[^>]+>/g, " ")
    if (pages.length === 0 || pageChars < content.length * 0.5) {
      pages = splitTextIntoPages(content)
      sections = extractSectionsFromPages(pages.map((page) => ({ pageNumber: page.pageNumber, textContent: page.text }))).map(
        (section) => ({ id: "", title: section.title, page_number: section.pageNumber, start_offset: section.startOffset }),
      )
    }
    allSpans.push(
      ...buildEvidenceSpans({ documentId: document.id, documentTitle: title, pages, sections }).map((span) =>
        span.sectionId ? span : { ...span, sectionId: null },
      ),
    )
    documents.push({
      id: document.id,
      title,
      pageCount: pages.length,
      outline: [...sections]
        .sort((a, b) => a.page_number - b.page_number || a.start_offset - b.start_offset)
        .map((section) => ({ title: section.title, pageNumber: section.page_number })),
    })
  }

  const spans = selectEvidenceSpans(allSpans, input.query, input.budgetChars ?? 45000)
  return {
    text: formatEvidenceSelection(documents, spans),
    spans,
    documents,
    used: spans.length,
    total: allSpans.length,
  }
}
