"use server"

import { createClient } from "@/lib/supabase/server"
import { findTextSpan } from "@/lib/utils/pdf-extraction"

export interface DocumentMatch {
  document: any
  pageNumber?: number
  textSpan?: { start: number; end: number }
  preview?: string
}

export async function searchDocuments(workspaceId: string, query: string, limit = 5) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  // Get workspace to check for location
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("location, context")
    .eq("id", workspaceId)
    .single()

  // If workspace has a location and it's not already in the query, add it
  let searchQuery = query
  if (workspace?.location && !query.toLowerCase().includes(workspace.location.toLowerCase())) {
    searchQuery = `${query} ${workspace.location}`
  }

  // Search documents table first
  const { data: documents, error } = await supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`)
    .limit(limit)

  if (error) {
    return { data: [], error: error.message }
  }

  // For each document, try to find specific page matches
  const matches: DocumentMatch[] = []

  for (const doc of documents || []) {
    // Search document_pages for more precise matches
    const { data: pages } = await supabase
      .from("document_pages")
      .select("*")
      .eq("document_id", doc.id)
      .ilike("text_content", `%${searchQuery}%`)
      .limit(1)

    if (pages && pages.length > 0) {
      const page = pages[0]
      const textSpan = findTextSpan(page.text_content || "", searchQuery)

      // Get preview text around the match
      let preview = ""
      if (textSpan) {
        const start = Math.max(0, textSpan.start - 50)
        const end = Math.min((page.text_content || "").length, textSpan.end + 50)
        preview = (page.text_content || "").substring(start, end)
      }

      matches.push({
        document: doc,
        pageNumber: page.page_number,
        textSpan: textSpan || undefined,
        preview,
      })
    } else {
      // No page match, use document-level match
      matches.push({
        document: doc,
      })
    }
  }

  return { data: matches }
}

export async function getRelevantContext(
  workspaceId: string,
  query: string,
): Promise<{ context: string; sources: any[] }> {
  const supabase = await createClient()

  // Get workspace context and location
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("context, location")
    .eq("id", workspaceId)
    .single()

  const { data: matches } = await searchDocuments(workspaceId, query, 3)

  // Build context string with workspace context if available
  let contextParts: string[] = []

  if (workspace?.context) {
    contextParts.push(`Workspace Context: ${workspace.context}`)
  }

  if (workspace?.location) {
    contextParts.push(`Location: ${workspace.location}`)
  }

  if (!matches || matches.length === 0) {
    const baseContext = contextParts.length > 0 
      ? contextParts.join("\n\n") + "\n\nNo relevant documents found in the workspace."
      : "No relevant documents found in the workspace."
    return {
      context: baseContext,
      sources: [],
    }
  }

  // Combine document content for context
  const documentContext = matches
    .map((match) => {
      const doc = match.document
      const pageInfo = match.pageNumber 
        ? ` (Page ${match.pageNumber})` 
        : ""
      const preview = match.preview 
        ? `\nRelevant excerpt: ${match.preview}` 
        : ""
      return `Document: ${doc.title}${pageInfo}\n${doc.content?.substring(0, 1000) || ""}${preview}\n---`
    })
    .join("\n\n")

  if (contextParts.length > 0) {
    contextParts.push(documentContext)
  } else {
    contextParts = [documentContext]
  }

  const context = contextParts.join("\n\n")

  // Build sources with page and highlight information
  const sources = matches.map((match) => {
    const doc = match.document
    const source: any = {
      id: doc.id,
      title: doc.title,
      url: doc.url || doc.external_url,
    }

    // Add page and text span information if available
    if (match.pageNumber) {
      source.pageNumber = match.pageNumber
    }

    if (match.textSpan) {
      source.textSpan = match.textSpan
    }

    if (match.preview) {
      source.preview = match.preview
    }

    return source
  })

  return { context, sources }
}
