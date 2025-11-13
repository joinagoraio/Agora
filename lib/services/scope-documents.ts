"use server"

import { revalidatePath } from "next/cache"

import { createWorkspaceDocument } from "@/lib/actions/document"
import { createAdminClient } from "@/lib/supabase/admin"

type SpaceDocumentPayload = {
  title?: string | null
  summary?: string | null
  full_text?: string | null
  file_url?: string | null
  file_name?: string | null
}

type SpaceDocumentItem = {
  id: string
  space_id?: string
  classification?: "public" | "internal" | "confidential" | null
  payload: SpaceDocumentPayload
}

function sanitizeScopeContent(text: string): string {
  if (!text) return ""
  let sanitized = text.replace(/\u0000/g, "")
  sanitized = sanitized.replace(/\r\n/g, "\n")
  sanitized = sanitized.replace(/\r/g, "\n")
  sanitized = sanitized.replace(/\\u(?![\da-fA-F]{4})/g, "u")
  sanitized = sanitized.replace(/\\(?![nrtbf\\'"xu0-7])/g, "")
  return sanitized.trim()
}

async function upsertWorkspaceDocumentForScope(
  spaceId: string,
  workspaceId: string,
  spaceItem: SpaceDocumentItem,
  adminClient = createAdminClient(),
) {
  const payload = spaceItem.payload || {}
  const title = (payload.title || payload.file_name || "Scope document").trim()
  const contentSource = payload.full_text || payload.summary || ""
  const content = sanitizeScopeContent(contentSource)

  if (content.length === 0) {
    console.warn("[ScopeDocuments] Skipping scope document without content", { spaceItemId: spaceItem.id })
    return
  }

  // Check if we already created a document for this workspace from this scope item
  const { data: existingDoc, error: lookupError } = await adminClient
    .from("documents")
    .select("id, metadata")
    .eq("workspace_id", workspaceId)
    .contains("metadata", { sourceSpaceItemId: spaceItem.id })
    .maybeSingle()

  const classification = spaceItem.classification ?? "internal"
  const metadataExtras = {
    sourceSpaceItemId: spaceItem.id,
    sourceSpaceId: spaceId,
    sourceFileUrl: payload.file_url || null,
    origin: "space_scope",
  }

  if (lookupError) {
    console.error("[ScopeDocuments] Failed to lookup existing document:", lookupError)
  }

  if (existingDoc) {
    const mergedMetadata = {
      ...(existingDoc.metadata || {}),
      ...metadataExtras,
    }

    const { error: updateError } = await adminClient
      .from("documents")
      .update({
        title,
        content,
        classification,
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingDoc.id)

    if (updateError) {
      console.error("[ScopeDocuments] Failed to update existing document:", updateError)
    } else {
      revalidatePath(`/workspaces/${workspaceId}`)
    }

    return
  }

  const { data: newDoc, error: createError } = await createWorkspaceDocument(workspaceId, {
    title,
    content,
    classification,
  })

  if (createError || !newDoc) {
    console.error("[ScopeDocuments] Failed to create workspace document from scope:", createError)
    return
  }

  const mergedMetadata = {
    ...(newDoc.metadata || {}),
    ...metadataExtras,
  }

  const { error: metadataError } = await adminClient
    .from("documents")
    .update({ metadata: mergedMetadata })
    .eq("id", newDoc.id)

  if (metadataError) {
    console.error("[ScopeDocuments] Failed to update metadata on new document:", metadataError)
  }
}

export async function syncScopeDocumentToAllWorkspaces(spaceId: string, spaceItem: SpaceDocumentItem) {
  const adminClient = createAdminClient()

  const { data: workspaces, error } = await adminClient
    .from("workspaces")
    .select("id")
    .eq("space_id", spaceId)

  if (error) {
    console.error("[ScopeDocuments] Failed to fetch workspaces for scope sync:", error)
    return
  }

  if (!workspaces || workspaces.length === 0) {
    return
  }

  for (const workspace of workspaces) {
    await upsertWorkspaceDocumentForScope(spaceId, workspace.id, spaceItem, adminClient)
  }
}

export async function syncAllScopeDocumentsToWorkspace(spaceId: string, workspaceId: string) {
  const adminClient = createAdminClient()

  const { data: scopeItems, error } = await adminClient
    .from("space_items")
    .select("id, classification, payload")
    .eq("space_id", spaceId)
    .eq("item_type", "document")

  if (error) {
    console.error("[ScopeDocuments] Failed to fetch scope documents for workspace:", error)
    return
  }

  if (!scopeItems || scopeItems.length === 0) {
    return
  }

  for (const item of scopeItems) {
    await upsertWorkspaceDocumentForScope(spaceId, workspaceId, item as SpaceDocumentItem, adminClient)
  }
}
