export type CitationLike = {
  documentId: string
  sectionId?: string
  pageNumber?: number
  quote?: string
}

export type CitationDocument = {
  id: string
  title: string
  documentRole?: string | null
}

export type CitationSection = {
  id: string
  documentId: string
  title: string
  pageNumber?: number
}

function readableSourceTitle(title: string): string {
  const file = title.match(/^(.*)\.(md|markdown|pdf|docx?|txt)$/i)
  if (!file) return title
  return file[1].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || title
}

export function formatCitationLabel(
  citation: CitationLike,
  documents: CitationDocument[] = [],
  sections: CitationSection[] = [],
): string {
  const document = documents.find((item) => item.id === citation.documentId)
  const section = citation.sectionId
    ? sections.find((item) => item.id === citation.sectionId)
    : undefined
  const title = document?.title?.trim() ? readableSourceTitle(document.title.trim()) : citation.documentId
  const sectionTitle = section?.title?.trim()
  const page = citation.pageNumber || section?.pageNumber
  const parts = [title]
  if (sectionTitle) parts.push(`§ ${sectionTitle}`)
  if (page) parts.push(`p.${page}`)
  return parts.join(", ")
}

export function inventedCitationIds(documentIds: string[], allowedIds: Iterable<string>): string[] {
  const allowed = new Set(allowedIds)
  return [...new Set(documentIds.filter((id) => id && !allowed.has(id)))]
}

export function citedDocumentIdsFromUnknown(value: unknown): string[] {
  const ids = new Set<string>()
  collectCitedDocumentIds(value, ids)
  return [...ids]
}

function collectCitedDocumentIds(value: unknown, ids: Set<string>) {
  if (!value) return
  if (Array.isArray(value)) {
    for (const item of value) collectCitedDocumentIds(item, ids)
    return
  }
  if (typeof value !== "object") return
  const record = value as Record<string, unknown>
  const documentId = record.documentId
  if (typeof documentId === "string" && documentId.trim()) ids.add(documentId.trim())
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") collectCitedDocumentIds(nested, ids)
  }
}
