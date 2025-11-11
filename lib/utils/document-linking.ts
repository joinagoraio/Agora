/**
 * Utility functions for building document viewer URLs with highlights
 */

export interface DocumentLinkParams {
  documentId: string
  pageNumber?: number
  textSpan?: { start: number; end: number }
  highlightId?: string
}

/**
 * Build a document viewer URL with highlight parameters
 */
export function buildDocumentUrl(
  workspaceId: string,
  params: DocumentLinkParams,
): string {
  const { documentId, pageNumber, textSpan, highlightId } = params
  const baseUrl = `/workspaces/${workspaceId}/documents/${documentId}`

  const searchParams = new URLSearchParams()

  if (pageNumber) {
    searchParams.set("page", pageNumber.toString())
  }

  if (textSpan) {
    searchParams.set("textSpan", `${textSpan.start}-${textSpan.end}`)
  }

  if (highlightId) {
    searchParams.set("highlight", highlightId)
  }

  const queryString = searchParams.toString()
  return queryString ? `${baseUrl}?${queryString}` : baseUrl
}

/**
 * Parse document URL parameters
 */
export function parseDocumentUrl(url: string): DocumentLinkParams | null {
  try {
    const urlObj = new URL(url, window.location.origin)
    const pathParts = urlObj.pathname.split("/")
    const documentIdIndex = pathParts.indexOf("documents")

    if (documentIdIndex === -1 || documentIdIndex >= pathParts.length - 1) {
      return null
    }

    const documentId = pathParts[documentIdIndex + 1]
    const params: DocumentLinkParams = { documentId }

    const page = urlObj.searchParams.get("page")
    if (page) {
      params.pageNumber = parseInt(page, 10)
    }

    const textSpan = urlObj.searchParams.get("textSpan")
    if (textSpan) {
      const [start, end] = textSpan.split("-").map(Number)
      if (!isNaN(start) && !isNaN(end)) {
        params.textSpan = { start, end }
      }
    }

    const highlight = urlObj.searchParams.get("highlight")
    if (highlight) {
      params.highlightId = highlight
    }

    return params
  } catch {
    return null
  }
}

/**
 * Build document URL from source object (from chat API)
 */
export function buildDocumentUrlFromSource(
  workspaceId: string,
  source: {
    id: string
    pageNumber?: number
    textSpan?: { start: number; end: number }
  },
): string {
  return buildDocumentUrl(workspaceId, {
    documentId: source.id,
    pageNumber: source.pageNumber,
    textSpan: source.textSpan,
    highlightId: source.pageNumber && source.textSpan 
      ? `highlight-${source.id}-${source.pageNumber}` 
      : undefined,
  })
}

