"use server"

import { createClient } from "@/lib/supabase/server"
import { getArchivedDocumentCount, getWorkspaceDocuments } from "@/lib/actions/document"
import { getSourcesByWorkspace } from "@/lib/actions/source"
import { getInheritedItems } from "@/lib/actions/workspace-space-link"
import { getWorkspaceItems } from "@/lib/actions/workspace-item"
import { getWorkspaceNotes } from "@/lib/actions/workspace-notes"

function documentOrigin(doc: { metadata?: unknown }): string | null {
  const metadata = doc.metadata
  if (!metadata || typeof metadata !== "object") return null
  const originValue = (metadata as Record<string, unknown>).origin
  return typeof originValue === "string" ? originValue : null
}

function isPlaceholderSummary(text?: string | null) {
  if (!text) return false
  return text.trimStart().toLowerCase().startsWith("see original file:")
}

export async function getWorkspaceKnowledgeBundle(workspaceId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" as const }
  }

  const [
    documentsResult,
    archivedCountResult,
    sourcesResult,
    inheritedItemsResult,
    localItemsResult,
    notesResult,
    parentSpaceLinksResult,
    commentsResult,
  ] = await Promise.all([
    getWorkspaceDocuments(workspaceId),
    getArchivedDocumentCount(workspaceId),
    getSourcesByWorkspace(workspaceId),
    getInheritedItems(workspaceId),
    getWorkspaceItems(workspaceId, { inheritance: "local" }),
    getWorkspaceNotes(workspaceId),
    supabase
      .from("workspace_space_links")
      .select("spaces(id, name, space_type)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_comments")
      .select("id, workspace_id, workspace_item_id, content, created_at, created_by, author:profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ])

  const documentsList = documentsResult.data || []
  const parentSpaces =
    parentSpaceLinksResult.data
      ?.map((link: { spaces?: unknown }) => link.spaces)
      .filter(
        (space): space is { id: string; name: string; space_type?: string | null } =>
          Boolean(space && typeof space === "object" && "id" in space && "name" in space),
      ) ?? []
  const parentSpaceById = new Map(parentSpaces.map((space) => [space.id, space]))

  const inheritedDocuments = documentsList.filter((doc) => documentOrigin(doc) === "space_scope")
  const uploadedDocuments = documentsList.filter((doc) => {
    const origin = documentOrigin(doc)
    return origin !== "workspace_generated" && origin !== "space_scope"
  })

  const inheritedDocumentsNormalized = inheritedDocuments.map((doc: Record<string, unknown>) => {
    const metadata = (doc.metadata ?? {}) as Record<string, unknown>
    const originSpaceId = typeof metadata.sourceSpaceId === "string" ? metadata.sourceSpaceId : undefined
    const originSpace = originSpaceId ? parentSpaceById.get(originSpaceId) : undefined
    const summaryFromMetadata = typeof metadata.summary === "string" ? metadata.summary : undefined
    const summaryFromContent = typeof doc.content === "string" ? doc.content.slice(0, 280) : undefined
    const summary =
      !isPlaceholderSummary(summaryFromMetadata) && summaryFromMetadata
        ? summaryFromMetadata
        : !isPlaceholderSummary(summaryFromContent)
          ? summaryFromContent
          : undefined
    const metadataTypeRaw = typeof metadata.type === "string" ? metadata.type : undefined
    const metadataSourceUrl =
      typeof metadata.sourceUrl === "string"
        ? metadata.sourceUrl
        : typeof metadata.source_url === "string"
          ? metadata.source_url
          : undefined
    const fallbackExternalUrl = typeof doc.url === "string" && !String(doc.url).startsWith("/") ? String(doc.url) : undefined
    const sourcePageUrl = metadataSourceUrl || fallbackExternalUrl
    const isExternalHtmlDoc = (metadataTypeRaw?.toLowerCase() ?? "").includes("html") && !!sourcePageUrl
    const sourceFileUrl =
      typeof metadata.sourceFileUrl === "string" && metadata.sourceFileUrl.length > 0
        ? metadata.sourceFileUrl
        : typeof doc.url === "string"
          ? doc.url
          : undefined
    const viewerUrl =
      isExternalHtmlDoc && sourcePageUrl ? sourcePageUrl : `/workspaces/${workspaceId}/documents/${doc.id}`

    return {
      id: String(doc.id),
      item_type: "document",
      classification: (doc.classification as string | null) ?? "public",
      created_at: String(doc.created_at ?? ""),
      source_url: sourcePageUrl,
      payload: {
        title: (doc.title as string | undefined) || (metadata.sourceFileUrl as string | undefined) || "Inherited document",
        summary,
        file_url: isExternalHtmlDoc ? undefined : sourceFileUrl,
        source_url: sourcePageUrl,
        mime_type: metadataTypeRaw,
      },
      spaces: originSpace
        ? {
            id: originSpace.id,
            name: originSpace.name,
            space_type: originSpace.space_type ?? null,
          }
        : null,
      source_doc: {
        id: String(doc.id),
        title: (doc.title as string | undefined) || "Document",
        url: viewerUrl,
      },
    }
  })

  const inheritedItems = inheritedItemsResult.data ?? []
  const inheritedNonDocumentItems = inheritedItems.filter((item: { item_type?: string }) => item.item_type !== "document")
  const combinedInheritedItems = [...inheritedDocumentsNormalized, ...inheritedNonDocumentItems].sort(
    (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
  )

  const commentsByItem =
    (commentsResult.data || []).reduce<Record<string, unknown[]>>((acc, comment: Record<string, unknown>) => {
      const itemId = String(comment.workspace_item_id ?? "")
      if (!itemId) return acc
      const list = acc[itemId] ?? []
      list.push(comment)
      acc[itemId] = list
      return acc
    }, {}) ?? {}

  return {
    data: {
      uploadedDocuments,
      archivedCount: archivedCountResult.count || 0,
      sources: sourcesResult.data || [],
      combinedInheritedItems,
      localWorkspaceItems: localItemsResult.data ?? [],
      notes: notesResult.data || [],
      commentsByItem,
      parentSpaces,
    },
  }
}
