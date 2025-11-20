import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const TEXT_CONTENT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/html",
  "application/json",
])

// Helper function to determine content type from file extension or metadata
function getContentType(filename: string, metadataType?: string): string {
  if (metadataType) {
    return metadataType
  }

  const ext = filename.split(".").pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    html: "text/html",
    htm: "text/html",
    txt: "text/plain",
    md: "text/markdown",
    rtf: "application/rtf",
  }

  return contentTypes[ext || ""] || "application/octet-stream"
}

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await context.params

  try {
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
      .select("id, workspace_id, url, metadata")
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

    // If URL is a Supabase Storage URL, fetch with authenticated client
    const url = document.url
    if (!url) {
      return NextResponse.json({ error: "Document URL not available" }, { status: 404 })
    }

    try {
      // Determine content type
      const filename = document.metadata?.filename || url.split("/").pop() || "document"
    const contentType = getContentType(filename, document.metadata?.type)
    if (TEXT_CONTENT_TYPES.has(contentType.toLowerCase())) {
      // Text-based content should be handled by text endpoint
      return NextResponse.redirect(new URL(`/api/documents/${documentId}/text-content`, request.url))
    }

      // Check if it's a Supabase Storage URL
      const isSupabaseStorage = url.includes("supabase.co/storage") || url.includes("supabase.in/storage")
      
      if (isSupabaseStorage) {
        // Extract file path from Supabase Storage URL
        // Format: https://[project].supabase.co/storage/v1/object/public/documents/[path]
        const urlMatch = url.match(/\/storage\/v1\/object\/public\/documents\/(.+)$/)
        if (urlMatch) {
          const filePath = urlMatch[1]
          // Use authenticated client to download
          const { data, error } = await supabase.storage
            .from("documents")
            .download(filePath)
          
          if (error || !data) {
            console.error("Storage download error:", error)
            return NextResponse.json({ error: "Failed to fetch document from storage" }, { status: 500 })
          }
          
          // Convert blob to buffer
          const arrayBuffer = await data.arrayBuffer()
          
          return new NextResponse(arrayBuffer, {
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": `inline; filename="${filename}"`,
              "Cache-Control": "public, max-age=3600",
            },
          })
        }
      }
      
      // For external URLs, fetch directly
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      })

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch document: ${response.statusText}` },
          { status: response.status }
        )
      }

      const arrayBuffer = await response.arrayBuffer()

      // Use response content-type if available, otherwise use detected type
      const responseContentType = response.headers.get("content-type") || contentType

      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": responseContentType,
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
        },
      })
    } catch (error) {
      console.error("Document proxy error:", error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to fetch document" },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Document route error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
