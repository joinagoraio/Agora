import { SupabaseClient } from "@supabase/supabase-js"
import { parseStructuredCitations } from "@/lib/utils/citation-parser"

export interface ResolvedCitation {
  id: string
  quote: string
  documentId: string
  documentTitle?: string | null
  pageNumber: number
  textSpan: { start: number; end: number }
}

type DocumentPage = {
  page_number: number
  text_content: string | null
}

type DocumentData = {
  id: string
  title: string | null
  workspace_id: string
  pages: DocumentPage[]
}

type SourceDocument = {
  id?: string | null
  title?: string | null
}

export async function resolveCitations(options: {
  content: string
  workspaceId: string
  supabase: SupabaseClient
  documents?: SourceDocument[]
}): Promise<ResolvedCitation[]> {
  const { content, workspaceId, supabase, documents = [] } = options
  if (!content || typeof content !== "string") {
    return []
  }

  const parsedCitations = parseStructuredCitations(content)
  if (parsedCitations.length === 0) {
    return []
  }

  const documentCache = new Map<string, DocumentData | null>()
  const identifierToDocumentId = new Map<string, string | null>()

  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()
  const normalizeTitle = (value: string) => normalizeWhitespace(value).toLowerCase()
  const stripQuotes = (value: string) => value.replace(/^"+|"+$/g, "")
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  const titleIndex = new Map<string, string>()
  for (const doc of documents) {
    if (doc?.id && doc.title) {
      titleIndex.set(normalizeTitle(doc.title), doc.id)
    }
  }

  const escapeLike = (value: string) => value.replace(/[%_]/g, (match) => `\\${match}`)

  const loadDocumentData = async (documentId: string): Promise<DocumentData | null> => {
    if (documentCache.has(documentId)) {
      return documentCache.get(documentId) || null
    }

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id, title, workspace_id")
      .eq("id", documentId)
      .maybeSingle()

    if (documentError || !document || document.workspace_id !== workspaceId) {
      documentCache.set(documentId, null)
      return null
    }

    const { data: pages, error: pagesError } = await supabase
      .from("document_pages")
      .select("page_number, text_content")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })

    if (pagesError) {
      documentCache.set(documentId, null)
      return null
    }

    const docData: DocumentData = {
      id: documentId,
      title: document.title || null,
      workspace_id: document.workspace_id,
      pages: pages || [],
    }

    documentCache.set(documentId, docData)
    return docData
  }

  const findDocumentData = async (identifier: string): Promise<DocumentData | null> => {
    const normalizedIdentifier = normalizeWhitespace(stripQuotes(identifier))
    if (!normalizedIdentifier) {
      return null
    }

    if (identifierToDocumentId.has(normalizedIdentifier)) {
      const cachedId = identifierToDocumentId.get(normalizedIdentifier)
      if (!cachedId) {
        return null
      }
      return loadDocumentData(cachedId)
    }

    let resolvedDocumentId: string | null = null
    if (uuidPattern.test(normalizedIdentifier)) {
      resolvedDocumentId = normalizedIdentifier
    } else {
      const normalizedTitleKey = normalizeTitle(normalizedIdentifier)
      resolvedDocumentId = titleIndex.get(normalizedTitleKey) || null
    }

    let documentData: DocumentData | null = null

    if (resolvedDocumentId) {
      documentData = await loadDocumentData(resolvedDocumentId)
    }

    if (!documentData) {
      const normalizedTitleKey = normalizeTitle(normalizedIdentifier)
      const { data: candidateDocuments, error: candidateError } = await supabase
        .from("documents")
        .select("id, title, workspace_id")
        .eq("workspace_id", workspaceId)
        .ilike("title", `%${escapeLike(normalizedIdentifier)}%`)
        .limit(5)

      if (!candidateError && candidateDocuments && candidateDocuments.length > 0) {
        const exactMatch = candidateDocuments.find(
          (doc) => normalizeTitle(doc.title || "") === normalizedTitleKey,
        )
        const selectedDocument = exactMatch || candidateDocuments[0]
        if (selectedDocument) {
          documentData = await loadDocumentData(selectedDocument.id)
        }
      }
    }

    identifierToDocumentId.set(normalizedIdentifier, documentData ? documentData.id : null)
    return documentData
  }

  const resolved: ResolvedCitation[] = []

  for (const parsed of parsedCitations) {
    const structured = parsed.structured
    if (!structured?.quote || !structured.documentId) {
      continue
    }

    const trimmedQuote = structured.quote.trim()
    if (trimmedQuote.length < 5) {
      continue
    }

    const documentData = await findDocumentData(structured.documentId)
    if (!documentData) {
      continue
    }

    const match = await findCitationMatch({
      pages: documentData.pages,
      quote: trimmedQuote,
      textSpan: structured.textSpan,
      pageNumber: structured.pageNumber,
    })

    if (!match) {
      continue
    }

    resolved.push({
      id: `cit-${resolved.length + 1}`,
      quote: trimmedQuote,
      documentId: documentData.id,
      documentTitle: documentData.title,
      pageNumber: match.pageNumber,
      textSpan: match.textSpan,
    })
  }

  return resolved
}

async function findCitationMatch(options: {
  pages: DocumentPage[]
  quote: string
  textSpan?: { start: number; end: number }
  pageNumber?: number
}): Promise<{ textSpan: { start: number; end: number }; pageNumber: number } | null> {
  const { pages, quote, textSpan, pageNumber } = options
  if (!Array.isArray(pages) || pages.length === 0) {
    return null
  }

  const targetQuote = quote.trim()
  if (!targetQuote) {
    return null
  }

  if (textSpan && typeof pageNumber === "number") {
    const provided = validateProvidedSpan(pages, targetQuote, textSpan, pageNumber)
    if (provided) {
      return provided
    }
  }

  for (const page of pages) {
    if (!page.text_content) {
      continue
    }
    const match = findQuoteOnPage(page.text_content, targetQuote)
    if (match) {
      return {
        textSpan: match,
        pageNumber: page.page_number || 1,
      }
    }
  }

  return null
}

function validateProvidedSpan(
  pages: DocumentPage[],
  quote: string,
  textSpan: { start: number; end: number },
  pageNumber: number,
): { textSpan: { start: number; end: number }; pageNumber: number } | null {
  const page = pages.find((p) => p.page_number === pageNumber)
  if (!page?.text_content) {
    return null
  }

  const { start, end } = textSpan
  if (typeof start !== "number" || typeof end !== "number" || end <= start) {
    return null
  }

  if (end > page.text_content.length) {
    return null
  }

  const snippet = page.text_content.slice(start, end)
  if (!snippet) {
    return null
  }

  const normalizedSnippet = snippet.trim()
  const normalizedQuote = quote.trim()

  if (
    (snippet === quote) ||
    (normalizedSnippet && normalizedQuote && normalizedSnippet === normalizedQuote)
  ) {
    return {
      textSpan: { start, end },
      pageNumber,
    }
  }

  return null
}

function findQuoteOnPage(pageText: string, quote: string): { start: number; end: number } | null {
  if (!pageText || !quote) {
    return null
  }

  const directIndex = pageText.indexOf(quote)
  if (directIndex !== -1) {
    return {
      start: directIndex,
      end: directIndex + quote.length,
    }
  }

  const { normalized: normalizedPage, map } = buildNormalizedTextMap(pageText)
  const normalizedQuote = buildNormalizedString(quote)

  if (!normalizedPage || !normalizedQuote) {
    return null
  }

  const normalizedIndex = normalizedPage.indexOf(normalizedQuote)
  if (normalizedIndex === -1) {
    return null
  }

  const normalizedEndIndex = normalizedIndex + normalizedQuote.length - 1
  if (
    normalizedIndex < 0 ||
    normalizedEndIndex >= map.length ||
    map[normalizedIndex] === undefined ||
    map[normalizedEndIndex] === undefined
  ) {
    return null
  }

  const start = map[normalizedIndex]
  const end = map[normalizedEndIndex] + 1
  return { start, end }
}

function buildNormalizedTextMap(text: string): { normalized: string; map: number[] } {
  const normalizedChars: string[] = []
  const map: number[] = []
  let lastWasSpace = false
  let justClosedLinkText = false

  for (let i = 0; i < text.length; i++) {
    let char = text[i]
    const prevChar = i === 0 ? "\n" : text[i - 1]
    const isLineStart = i === 0 || prevChar === "\n" || prevChar === "\r"

    if (isLineStart) {
      // Skip markdown heading/list/blockquote markers that won't appear in quoted text
      if (char === "#") {
        while (i < text.length && text[i] === "#") {
          i++
        }
        while (i < text.length && text[i] === " ") {
          i++
        }
        i -= 1
        continue
      }

      if ((char === "-" || char === "+" || char === "*") && text[i + 1] === " ") {
        i += 1
        continue
      }

      if (char === ">") {
        if (text[i + 1] === " ") {
          i += 1
        }
        continue
      }

      if (/[0-9]/.test(char)) {
        let j = i
        while (j < text.length && /[0-9]/.test(text[j])) {
          j++
        }
        if (text[j] === "." && text[j + 1] === " ") {
          i = j + 1
          continue
        }
      }
    }

    if (char === "[" || char === "]") {
      if (char === "]") {
        justClosedLinkText = true
      }
      continue
    }

    if (char === "(" && justClosedLinkText) {
      // Skip the link target portion of markdown links: [text](url)
      let closing = i + 1
      while (closing < text.length && text[closing] !== ")") {
        closing++
      }
      i = closing
      justClosedLinkText = false
      continue
    }

    if (!/\s/.test(char)) {
      justClosedLinkText = false
    }

    if (char === "<") {
      let closing = i + 1
      while (closing < text.length && text[closing] !== ">") {
        closing++
      }
      i = closing
      continue
    }

    if (char === "\u201c" || char === "\u201d") {
      char = '"'
    } else if (char === "\u2018" || char === "\u2019") {
      char = "'"
    }

    if (/\s/.test(char)) {
      if (normalizedChars.length === 0 || lastWasSpace) {
        continue
      }
      normalizedChars.push(" ")
      map.push(i)
      lastWasSpace = true
      continue
    }

    if (/[*_`~]/.test(char)) {
      continue
    }

    if (/[.,!?;:"']/.test(char)) {
      continue
    }

    if (/[()[\]{}<>#|]/.test(char)) {
      continue
    }

    const lower = char.toLowerCase()
    normalizedChars.push(lower)
    map.push(i)
    lastWasSpace = false
  }

  return {
    normalized: normalizedChars.join(""),
    map,
  }
}

function buildNormalizedString(text: string): string {
  return buildNormalizedTextMap(text).normalized
}

