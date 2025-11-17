"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

type SpaceDocumentPayload = {
  title?: string | null
  summary?: string | null
  full_text?: string | null
  file_url?: string | null
  file_name?: string | null
  mime_type?: string | null
}

export type SpaceDocumentItem = {
  id: string
  space_id?: string
  classification?: "public" | "internal" | "confidential" | null
  payload: SpaceDocumentPayload
}

async function ensureWorkspaceGeneratedSourceAdmin(
  workspaceId: string,
  adminClient = createAdminClient(),
  createdBy?: string | null,
) {
  const { data: existingSource, error: fetchError } = await adminClient
    .from("sources")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("type", "workspace_generated")
    .maybeSingle()

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  if (existingSource) {
    return existingSource.id
  }

  const { data: newSource, error: insertError } = await adminClient
    .from("sources")
    .insert({
      workspace_id: workspaceId,
      name: "Workspace Documents",
      type: "workspace_generated",
      config: {},
      created_by: createdBy ?? null,
      status: "active",
    })
    .select("id")
    .single()

  if (insertError || !newSource) {
    throw new Error(insertError?.message || "Failed to create workspace document source")
  }

  return newSource.id
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

  async function upsertDocumentPageContent(documentId: string) {
    if (!content || content.length === 0) return

    const textContent = content.substring(0, 200000)
    const pagePayload = {
      text_content: textContent,
      text_items: [],
      character_offsets: {},
      page_number: 1,
      document_id: documentId,
    }

    const { data: existingPage, error: pageFetchError } = await adminClient
      .from("document_pages")
      .select("id")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (pageFetchError) {
      console.error("[ScopeDocuments] Failed to check existing document page:", pageFetchError)
      return
    }

    if (existingPage) {
      const { error: updatePageError } = await adminClient
        .from("document_pages")
        .update({
          text_content: textContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPage.id)

      if (updatePageError) {
        console.error("[ScopeDocuments] Failed to update document page content:", updatePageError)
      }
    } else {
      const { error: insertPageError } = await adminClient.from("document_pages").insert(pagePayload)
      if (insertPageError) {
        console.error("[ScopeDocuments] Failed to insert document page content:", insertPageError)
      }
    }
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
    type: payload.mime_type || null,
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
        url: payload.file_url || null,
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingDoc.id)

    if (updateError) {
      console.error("[ScopeDocuments] Failed to update existing document:", updateError)
    } else {
      await upsertDocumentPageContent(existingDoc.id)
      revalidatePath(`/workspaces/${workspaceId}`)
    }

    return
  }

  const { data: workspaceRecord, error: workspaceError } = await adminClient
    .from("workspaces")
    .select("id, space_id, created_by")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspaceRecord) {
    console.error("[ScopeDocuments] Failed to fetch workspace for scope document:", workspaceError)
    return
  }

  let sourceId: string
  try {
    sourceId = await ensureWorkspaceGeneratedSourceAdmin(workspaceId, adminClient, workspaceRecord.created_by)
  } catch (sourceError) {
    console.error("[ScopeDocuments] Failed to ensure workspace source for scope document:", sourceError)
    return
  }

  const now = new Date().toISOString()
  const metadata = {
    createdBy: workspaceRecord.created_by,
    lastEditedBy: workspaceRecord.created_by,
    lastEditedAt: now,
    ...metadataExtras,
  }

  const { data: newDoc, error: createError } = await adminClient
    .from("documents")
    .insert({
      source_id: sourceId,
      workspace_id: workspaceId,
      tenant_id: workspaceRecord.space_id || null,
      external_id: randomUUID(),
      title,
      content,
      url: payload.file_url || null,
      status: "active",
      classification: classification || "internal",
      metadata,
    })
    .select("id, metadata")
    .single()

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

  await upsertDocumentPageContent(newDoc.id)

  console.log("[ScopeDocuments] Created workspace document from scope", {
    documentId: newDoc.id,
    workspaceId,
    spaceId,
    spaceItemId: spaceItem.id,
  })

  revalidatePath(`/workspaces/${workspaceId}`)
}

export async function syncScopeDocumentToAllWorkspaces(spaceId: string, spaceItem: SpaceDocumentItem) {
  const adminClient = createAdminClient()

  const classification = spaceItem.classification ?? "internal"

  if (classification !== "public") {
    await removeScopeDocumentFromAllWorkspaces(spaceId, spaceItem.id)
    return
  }

  const [{ data: workspaces, error: workspacesError }, { data: linkedWorkspaces, error: linksError }] = await Promise.all([
    adminClient.from("workspaces").select("id").eq("space_id", spaceId),
    adminClient.from("workspace_space_links").select("workspace_id").eq("space_id", spaceId),
  ])

  if (workspacesError) {
    console.error("[ScopeDocuments] Failed to fetch workspaces for scope sync:", workspacesError)
    return
  }

  if (linksError) {
    console.error("[ScopeDocuments] Failed to fetch linked workspaces for scope sync:", linksError)
    return
  }

  const workspaceIds = new Set<string>()
  workspaces?.forEach((workspace) => workspaceIds.add(workspace.id))
  linkedWorkspaces?.forEach((link) => workspaceIds.add(link.workspace_id))

  console.log("[ScopeDocuments] Syncing scope document to workspaces", {
    spaceId,
    spaceItemId: spaceItem.id,
    workspaceCount: workspaceIds.size,
  })

  if (workspaceIds.size === 0) {
    return
  }

  for (const workspaceId of workspaceIds) {
    await upsertWorkspaceDocumentForScope(spaceId, workspaceId, spaceItem, adminClient)
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
    if ((item.classification ?? "internal") !== "public") {
      continue
    }
    await upsertWorkspaceDocumentForScope(spaceId, workspaceId, item as SpaceDocumentItem, adminClient)
  }
}

export async function removeScopeDocumentFromAllWorkspaces(spaceId: string, spaceItemId: string) {
  const adminClient = createAdminClient()

  const { data: documents, error } = await adminClient
    .from("documents")
    .select("id, workspace_id")
    .contains("metadata", { sourceSpaceItemId: spaceItemId, sourceSpaceId: spaceId })

  if (error) {
    console.error("[ScopeDocuments] Failed to find workspace documents for removal:", error)
    return
  }

  if (!documents || documents.length === 0) {
    return
  }

  const documentIds = documents.map((doc) => doc.id)
  const workspaceIds = Array.from(new Set(documents.map((doc) => doc.workspace_id)))

  const { error: deleteError } = await adminClient
    .from("documents")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .in("id", documentIds)

  if (deleteError) {
    console.error("[ScopeDocuments] Failed to mark workspace documents as deleted:", deleteError)
  }

  for (const workspaceId of workspaceIds) {
    revalidatePath(`/workspaces/${workspaceId}`)
  }
}

export async function removeScopeDocumentsFromWorkspace(spaceId: string, workspaceId: string) {
  const adminClient = createAdminClient()

  const { data: documents, error: documentsError } = await adminClient
    .from("documents")
    .select("id")
    .eq("workspace_id", workspaceId)
    .contains("metadata", { sourceSpaceId: spaceId })

  if (documentsError) {
    console.error("[ScopeDocuments] Failed to find inherited documents for workspace removal:", documentsError)
  } else if (documents && documents.length > 0) {
    const docIds = documents.map((doc) => doc.id)
    const { error: deleteError } = await adminClient
      .from("documents")
      .update({ status: "deleted", updated_at: new Date().toISOString() })
      .in("id", docIds)

    if (deleteError) {
      console.error("[ScopeDocuments] Failed to delete inherited documents for workspace:", deleteError)
    }
  }

  const { data: spaceItems, error: spaceItemsError } = await adminClient
    .from("space_items")
    .select("id")
    .eq("space_id", spaceId)

  if (spaceItemsError) {
    console.error("[ScopeDocuments] Failed to fetch space items for workspace cleanup:", spaceItemsError)
  } else if (spaceItems && spaceItems.length > 0) {
    const spaceItemIds = spaceItems.map((item) => item.id)
    const { error: workspaceItemsError } = await adminClient
      .from("workspace_items")
      .delete()
      .eq("workspace_id", workspaceId)
      .in("source_space_item_id", spaceItemIds)

    if (workspaceItemsError) {
      console.error("[ScopeDocuments] Failed to remove inherited workspace items:", workspaceItemsError)
    }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
}
