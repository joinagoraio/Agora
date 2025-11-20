import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

async function userHasWorkspaceAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  spaceId: string,
  userId: string,
) {
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle()

  if (workspaceMember) {
    return true
  }

  const { data: spaceMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle()

  return Boolean(spaceMembership && ["owner", "admin"].includes(spaceMembership.role))
}

async function fetchDocumentTextFromSource(
  document: { url: string | null; metadata: Record<string, any> | null; title: string | null },
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const url = document.url
  if (!url) {
    return null
  }

  const metadataType = typeof document.metadata?.type === "string" ? document.metadata.type.toLowerCase() : ""
  const looksLikeText =
    metadataType.includes("text") ||
    metadataType.includes("markdown") ||
    document.title?.toLowerCase().endsWith(".md") ||
    document.title?.toLowerCase().endsWith(".txt")

  if (!looksLikeText) {
    return null
  }

  try {
    const isSupabaseStorage = url.includes("supabase.co/storage") || url.includes("supabase.in/storage")
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
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, workspace_id, metadata, title, url")
      .eq("id", documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Verify user has access to the workspace
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id, space_id")
      .eq("id", document.workspace_id)
      .single()

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    }

    const canAccess = await userHasWorkspaceAccess(supabase, workspace.id, workspace.space_id, user.id)
    if (!canAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Check if document is text/markdown or originated from workspace text sources
    const metadata = ((document.metadata as Record<string, any>) || {}) as Record<string, any>
    const documentType = (metadata.type as string) || ""
    const documentOrigin = typeof metadata.origin === "string" ? metadata.origin.toLowerCase() : ""
    const isTextDocument =
      documentType.includes("text") ||
      documentType.includes("markdown") ||
      document.title?.toLowerCase().endsWith(".md") ||
      document.title?.toLowerCase().endsWith(".txt") ||
      document.title?.toLowerCase().endsWith(".docx") ||
      document.title?.toLowerCase().endsWith(".doc")

    const isWorkspaceGeneratedText =
      documentOrigin === "workspace_generated" || documentOrigin === "space_scope"

    if (!isTextDocument && !isWorkspaceGeneratedText) {
      return NextResponse.json({ error: "This endpoint is only for text/markdown documents" }, { status: 400 })
    }

    // Fetch document pages
    const { data: pages, error: pagesError } = await supabase
      .from("document_pages")
      .select("text_content, page_number")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })

    if (pagesError) {
      console.error("[text-content] Error fetching pages:", pagesError)
      return NextResponse.json({ error: "Failed to fetch document pages" }, { status: 500 })
    }

    if (!pages || pages.length === 0) {
      const fallbackContent = await fetchDocumentTextFromSource(document, supabase)
      if (fallbackContent && fallbackContent.trim().length > 0) {
        return new NextResponse(fallbackContent, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        })
      }
      return NextResponse.json({ error: "No content found in document pages" }, { status: 404 })
    }

    // Combine all pages into a single text content
    const textContent = pages
      .map((p: DocumentPage) => p.text_content || "")
      .filter(Boolean)
      .join("\n\n")

    if (!textContent || textContent.trim().length === 0) {
      const fallbackContent = await fetchDocumentTextFromSource(document, supabase)
      if (fallbackContent && fallbackContent.trim().length > 0) {
        return new NextResponse(fallbackContent, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        })
      }
      return NextResponse.json({ error: "Document has no text content" }, { status: 404 })
    }

    // Return as plain text
    return new NextResponse(textContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("[text-content] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

