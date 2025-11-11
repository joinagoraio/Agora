"use server"

import { createClient } from "@/lib/supabase/server"

export async function searchDocuments(workspaceId: string, query: string, limit = 5) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  // Simple text search for now
  // In production, this would use vector similarity search with embeddings
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
    .limit(limit)

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function getRelevantContext(
  workspaceId: string,
  query: string,
): Promise<{ context: string; sources: any[] }> {
  const { data: documents } = await searchDocuments(workspaceId, query, 3)

  if (!documents || documents.length === 0) {
    return {
      context: "No relevant documents found in the workspace.",
      sources: [],
    }
  }

  // Combine document content for context
  const context = documents
    .map((doc) => `Document: ${doc.title}\n${doc.content?.substring(0, 1000) || ""}\n---`)
    .join("\n\n")

  const sources = documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    url: doc.external_url,
  }))

  return { context, sources }
}
