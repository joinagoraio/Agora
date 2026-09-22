import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { isSupabaseStorageUrl } from "@/lib/utils/storage-url"
import { plainTextFromStoredContent } from "@/lib/documents/stored-text"

async function fetchDocumentTextFromSource(
  document: { external_url: string | null; metadata: Record<string, any> | null; title: string | null },
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const url = document.external_url
  if (!url) {
    return null
  }

  // Check file extension first (most reliable)
  const hasTextExtension =
    document.title?.toLowerCase().endsWith(".md") ||
    document.title?.toLowerCase().endsWith(".txt") ||
    document.title?.toLowerCase().endsWith(".markdown")
  
  // Check metadata type
  const metadataType = typeof document.metadata?.type === "string" ? document.metadata.type.toLowerCase() : ""
  const hasTextType = metadataType.includes("text") || metadataType.includes("markdown")
  
  // Check origin
  const origin = typeof document.metadata?.origin === "string" ? document.metadata.origin.toLowerCase() : ""
  const isWorkspaceText = origin === "workspace_generated" || origin === "space_scope"
  
  const looksLikeText = hasTextExtension || hasTextType || isWorkspaceText

  if (!looksLikeText) {
    return null
  }

  try {
    const isSupabaseStorage = isSupabaseStorageUrl(url)
    if (isSupabaseStorage) {
      const urlMatch = url.match(/\/storage\/v1\/object\/public\/documents\/(.+)$/)
      if (urlMatch) {
        const filePath = urlMatch[1]
        const { data, error } = await supabase.storage.from("documents").download(filePath)
        if (error || !data) {
          console.error("[text-content] Storage download error:", error)
          return null
        }
        return await data.text()
      }
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/plain, text/markdown, */*",
      },
    })

    if (!response.ok) {
      console.error("[text-content] Fallback fetch failed:", response.status, response.statusText)
      return null
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || ""
    if (
      !contentType.includes("text") &&
      !contentType.includes("markdown") &&
      !document.title?.toLowerCase().endsWith(".md") &&
      !document.title?.toLowerCase().endsWith(".txt")
    ) {
      console.warn("[text-content] Fallback fetch returned non-text content type:", contentType)
      return null
    }

    return await response.text()
  } catch (error) {
    console.error("[text-content] Error fetching fallback document content:", error)
    return null
  }
}

/**
 * API endpoint to fetch text content from document_pages for text/markdown documents
 * This ensures the viewer uses the same content source as RAG/search for consistency
 */
type DocumentPage = {
  text_content: string | null
  page_number: number | null
}

function textResponse(body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  })
}

async function storedDocumentText(
  document: { external_url: string | null; metadata: Record<string, any> | null; title: string | null; content?: string | null },
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const fromFile = await fetchDocumentTextFromSource(document, supabase)
  if (fromFile && fromFile.trim().length > 0) return fromFile
  const fromRow = plainTextFromStoredContent(document.content)
  return fromRow.length > 0 ? fromRow : null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await context.params

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch document to verify access
    // The documents table has RLS policies that only allow access to users
    // who have access to the workspace, so if this query succeeds, the user has access
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, workspace_id, metadata, title, external_url, content")
      .eq("id", documentId)
      .single()

    if (docError || !document) {
      console.error("[text-content] Document lookup failed:", docError)
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Check if document is text/markdown or originated from workspace text sources
    // Word documents are explicitly excluded - they should use the PDF/Word viewer with Mammoth conversion
    const metadata = ((document.metadata as Record<string, any>) || {}) as Record<string, any>
    const documentType = (metadata.type as string) || ""
    const documentOrigin = typeof metadata.origin === "string" ? metadata.origin.toLowerCase() : ""
    
    // Check file extension first (most reliable for text files)
    const hasTextExtension = 
      document.title?.toLowerCase().endsWith(".md") ||
      document.title?.toLowerCase().endsWith(".txt") ||
      document.title?.toLowerCase().endsWith(".markdown")
    
    // Check metadata type
    const hasTextType = documentType.includes("text") || documentType.includes("markdown")
    
    // Check if it's workspace/space generated
    const isWorkspaceGeneratedText =
      documentOrigin === "workspace_generated" || documentOrigin === "space_scope"
    
    // Exclude Word documents
    const isWordDocument = 
      documentType.includes("word") ||
      documentType.includes("msword") ||
      document.title?.toLowerCase().endsWith(".doc") ||
      document.title?.toLowerCase().endsWith(".docx")

    const isTextDocument = (hasTextExtension || hasTextType || isWorkspaceGeneratedText) && !isWordDocument

    if (!isTextDocument) {
      return NextResponse.json({ error: "This endpoint is only for text/markdown documents" }, { status: 400 })
    }

    // Fetch document pages using admin client (bypasses RLS)
    // The access check was already performed above, so we can safely use admin client
    const adminClient = createAdminClient()
    const { data: pages, error: pagesError } = await adminClient
      .from("document_pages")
      .select("text_content, page_number")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })

    if (pagesError) {
      console.error("[text-content] Error fetching pages:", pagesError)
      return NextResponse.json({ error: "Failed to fetch document pages" }, { status: 500 })
    }

    if (!pages || pages.length === 0) {
      const fallbackContent = await storedDocumentText(document, supabase)
      if (fallbackContent) return textResponse(fallbackContent)
      return NextResponse.json({ error: "No content found in document pages" }, { status: 404 })
    }

    // Combine all pages into a single text content
    const textContent = pages
      .map((p: DocumentPage) => p.text_content || "")
      .filter(Boolean)
      .join("\n\n")

    if (!textContent || textContent.trim().length === 0) {
      const fallbackContent = await storedDocumentText(document, supabase)
      if (fallbackContent) return textResponse(fallbackContent)
      return NextResponse.json({ error: "Document has no text content" }, { status: 404 })
    }

    return textResponse(textContent)
  } catch (error) {
    console.error("[text-content] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

