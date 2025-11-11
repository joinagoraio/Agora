import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getDocumentPages } from "@/lib/actions/document"
import { PDFViewer } from "@/components/pdf-viewer"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Download, ExternalLink } from "lucide-react"
import Link from "next/link"
import { getHighlightCoordinates, findTextSpan } from "@/lib/utils/pdf-extraction"

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

  // Fetch document pages
  const { data: pages } = await getDocumentPages(documentId)

  // Parse highlight parameters from URL
  const initialPage = pageParam ? parseInt(pageParam) : 1
  const highlights: any[] = []

  if (highlightParam && textSpanParam && pages && pages.length > 0) {
    try {
      const highlightPage = pageParam ? parseInt(pageParam) : 1
      const pageData = pages.find((p: any) => p.page_number === highlightPage)

      if (pageData && textSpanParam) {
        const [start, end] = textSpanParam.split("-").map(Number)
        const textSpan = { start, end }

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
    } catch (error) {
      console.error("Error parsing highlight:", error)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href={`/workspaces/${workspaceId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Workspace
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">{document.title}</h1>
              {pages && pages.length > 0 && (
                <p className="text-sm text-muted-foreground">{pages.length} pages</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {document.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={document.url} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden">
        {document.url ? (
          <PDFViewer
            url={document.url}
            documentId={documentId}
            highlights={highlights}
            initialPage={initialPage}
            className="h-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Document URL not available</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

