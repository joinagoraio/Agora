import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * API endpoint to fetch text content from document_pages for text/markdown documents
 * This ensures the viewer uses the same content source as RAG/search for consistency
 */
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
      .select("id, workspace_id, metadata, title")
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

    // Check if user is a member of the space
    const { data: membership } = await supabase
      .from("space_members")
      .select("id")
      .eq("space_id", workspace.space_id)
      .eq("user_id", user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Check if document is text/markdown
    const documentType = (document.metadata as Record<string, any>)?.type || ""
    const isTextDocument =
      documentType.includes("text") ||
      documentType.includes("markdown") ||
      document.title?.toLowerCase().endsWith(".md") ||
      document.title?.toLowerCase().endsWith(".txt")

    if (!isTextDocument) {
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
      return NextResponse.json({ error: "No content found in document pages" }, { status: 404 })
    }

    // Combine all pages into a single text content
    const textContent = pages
      .map((p) => p.text_content || "")
      .filter(Boolean)
      .join("\n\n")

    if (!textContent || textContent.trim().length === 0) {
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

