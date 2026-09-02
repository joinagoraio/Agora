import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getDocumentPages } from "@/lib/actions/document"
import { DocumentViewerClient } from "@/components/document-viewer-client"
import { getHighlightCoordinates, findTextSpan } from "@/lib/utils/pdf-extraction"
import { env } from "@/lib/env"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { HighlightProvider } from "@/lib/contexts/highlight-context"

interface DocumentViewerPageProps {
  params: Promise<{
    workspaceId: string
    documentId: string
  }>
  searchParams: Promise<{
    page?: string
    highlight?: string
    textSpan?: string
  }>
}

export default async function DocumentViewerPage({ params, searchParams }: DocumentViewerPageProps) {
  const { workspaceId, documentId } = await params
  const { page: pageParam, highlight: highlightParam, textSpan: textSpanParam } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch document
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("workspace_id", workspaceId)
    .single()

  if (docError || !document) {
    redirect(`/workspaces/${workspaceId}`)
  }

  const metadataType =
    typeof document.metadata?.type === "string" ? document.metadata.type.toLowerCase() : ""
  const sourceUrlFromMetadata =
    typeof document.metadata?.sourceUrl === "string"
      ? (document.metadata.sourceUrl as string)
      : typeof document.metadata?.source_url === "string"
        ? (document.metadata.source_url as string)
        : typeof document.metadata?.sourcePageUrl === "string"
          ? (document.metadata.sourcePageUrl as string)
          : undefined
  const documentUrl = typeof document.url === "string" ? document.url : null
  const isInternalDocumentUrl = documentUrl?.startsWith("/") ?? false
  const shouldRedirectToExternalPage =
    metadataType.includes("html") && (sourceUrlFromMetadata || (!isInternalDocumentUrl && documentUrl))

  if (shouldRedirectToExternalPage) {
    redirect(sourceUrlFromMetadata || documentUrl!)
  }

  // Get workspace details for chat wrapper
  const { data: workspace } = await supabase.from("workspaces").select("name").eq("id", workspaceId).single()

  if (!workspace) {
    redirect(`/workspaces/${workspaceId}`)
  }

  // Fetch document pages
  const { data: pages } = await getDocumentPages(documentId)
  let hydratedPages = pages || []

  // Parse highlight parameters from URL
  const initialPage = pageParam ? parseInt(pageParam) : 1
  const highlights: any[] = []

  console.log("[DocumentViewerPage] URL params:", {
    pageParam,
    highlightParam,
    textSpanParam,
    documentId,
    documentTitle: document.title,
  })

  // Check if document is text/markdown (for simpler highlighting)
  // Word documents are handled separately with coordinate-based highlighting
  const documentType = document.metadata?.type || ""
  const documentOrigin = typeof document.metadata?.origin === "string" ? document.metadata.origin.toLowerCase() : ""
  
  // Check file extension first (most reliable)
  const hasTextExtension = 
    document.title?.toLowerCase().endsWith(".md") ||
    document.title?.toLowerCase().endsWith(".txt") ||
    document.title?.toLowerCase().endsWith(".markdown")
  
  // Check metadata
  const hasTextType = documentType.includes("text") || documentType.includes("markdown")
  const isWorkspaceText = documentOrigin === "workspace_generated" || documentOrigin === "space_scope"
  
  // Exclude Word documents
  const isWordDocument = 
    documentType.includes("word") ||
    documentType.includes("msword") ||
    document.title?.toLowerCase().endsWith(".doc") ||
    document.title?.toLowerCase().endsWith(".docx")

  const isPdfDocument =
    documentType.includes("pdf") ||
    document.title?.toLowerCase().endsWith(".pdf")
  
  const isTextDocument = (hasTextExtension || hasTextType || isWorkspaceText) && !isWordDocument
  
  console.log("[DocumentViewerPage] Document type check:", {
    documentType,
    isTextDocument,
    title: document.title,
  })

  const pagesMissingVectorData =
    !hydratedPages ||
    hydratedPages.length === 0 ||
    hydratedPages.every((page: any) => {
      if (!page) return true
      const textItems = page.text_items
      if (Array.isArray(textItems)) {
        return textItems.length === 0
      }
      if (typeof textItems === "string") {
        try {
          const parsed = JSON.parse(textItems)
          return !Array.isArray(parsed) || parsed.length === 0
        } catch {
          return true
        }
      }
      return !textItems
    })

  const resolvedDocumentUrl = (() => {
    if (!documentUrl) {
      return null
    }
    if (documentUrl.startsWith("http://") || documentUrl.startsWith("https://")) {
      return documentUrl
    }
    const baseUrl =
      env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    try {
      return new URL(documentUrl, baseUrl).toString()
    } catch {
      return null
    }
  })()

  if (isPdfDocument && pagesMissingVectorData && resolvedDocumentUrl) {
    try {
      const response = await fetch(resolvedDocumentUrl, { cache: "no-store" })
      if (response.ok) {
        const pdfBuffer = await response.arrayBuffer()
        const { extractPdfPages } = await import("@/lib/utils/pdf-extraction.server")
        const extractedPages = await extractPdfPages(pdfBuffer)
        if (extractedPages.length > 0) {
          hydratedPages = extractedPages.map((page) => ({
            document_id: documentId,
            page_number: page.pageNumber,
            text_content: page.textContent,
            text_items: page.textItems,
            character_offsets: page.characterOffsets,
          }))
          console.log("[DocumentViewerPage] Hydrated PDF pages dynamically", {
            documentId,
            pageCount: hydratedPages.length,
          })
        }
      } else {
        console.warn("[DocumentViewerPage] Failed to fetch PDF for hydration", {
          documentId,
          status: response.status,
        })
      }
    } catch (error) {
      console.error("[DocumentViewerPage] Error hydrating PDF pages:", error)
    }
  }

  if (highlightParam && textSpanParam) {
    try {
      const [start, end] = textSpanParam.split("-").map(Number)
      const textSpan = { start, end }
      const highlightPage = pageParam ? parseInt(pageParam) : 1

      console.log("[DocumentViewerPage] Parsing highlight:", {
        highlightParam,
        textSpanParam,
        textSpan,
        highlightPage,
        isTextDocument,
        pagesCount: hydratedPages?.length || 0,
      })

      if (isTextDocument) {
        // For text/markdown documents, create a simple highlight with just textSpan
        // No coordinates needed - the MultiFormatViewer will handle it
        const highlight = {
          id: highlightParam,
          pageNumber: highlightPage,
          textSpan,
          color: "rgba(255, 255, 0, 0.3)",
        }
        highlights.push(highlight)
        console.log("[DocumentViewerPage] Created text document highlight:", highlight)
      } else if (hydratedPages && hydratedPages.length > 0) {
        // For PDFs and other documents with pages, use coordinate-based highlighting
      const pageData = hydratedPages.find((p: any) => p.page_number === highlightPage)

        if (pageData) {
        // Get coordinates for the highlight
        const coordinates = getHighlightCoordinates(
          textSpan,
          pageData.text_items || [],
          pageData.character_offsets || {},
        )

        highlights.push({
          id: highlightParam,
          pageNumber: highlightPage,
          textSpan,
          coordinates,
          color: "rgba(255, 255, 0, 0.3)",
        })
        }
      }
    } catch (error) {
      console.error("Error parsing highlight:", error)
    }
  }

  console.log("[DocumentViewerPage] Final highlights array:", highlights)
  console.log("[DocumentViewerPage] Passing to DocumentViewerClient:", {
    highlightsCount: highlights.length,
    highlights,
  })

  return (
    <HighlightProvider>
      <WorkspaceChatWrapper workspaceId={workspaceId} workspaceName={workspace.name} defaultOpen>
        <DocumentViewerClient
          workspaceId={workspaceId}
          documentId={documentId}
          documentTitle={document.title}
          documentUrl={document.url}
          pageCount={hydratedPages?.length || null}
          highlights={highlights}
          initialPage={initialPage}
          documentMetadata={document.metadata}
          pages={hydratedPages || []}
          workspaceName={workspace.name}
        />
      </WorkspaceChatWrapper>
    </HighlightProvider>
  )
}
