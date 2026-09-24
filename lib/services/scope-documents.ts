"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { splitTextIntoPages } from "@/lib/documents/text-pages"
import { rebuildDocumentSectionsWithClient } from "@/lib/documents/rebuild-sections"

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
  visibility?: "public" | "internal" | "confidential" | null
  source_url?: string | null
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

function isMissingDocumentsUrlColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST204" && (error.message ?? "").includes("'url' column")
}

type InheritedDocumentRow = Record<string, unknown>

async function insertInheritedDocument(
  adminClient: ReturnType<typeof createAdminClient>,
  row: InheritedDocumentRow,
  fileUrl: string | null,
) {
  const first = await adminClient.from("documents").insert({ ...row, url: fileUrl }).select("id, metadata").single()
  if (!isMissingDocumentsUrlColumn(first.error)) {
    return first
  }
  return adminClient.from("documents").insert({ ...row, external_url: fileUrl }).select("id, metadata").single()
}

async function updateInheritedDocument(
  adminClient: ReturnType<typeof createAdminClient>,
  documentId: string,
  row: InheritedDocumentRow,
  fileUrl: string | null,
) {
  const first = await adminClient.from("documents").update({ ...row, url: fileUrl }).eq("id", documentId)
  if (!isMissingDocumentsUrlColumn(first.error)) {
    return first
  }
  return adminClient.from("documents").update({ ...row, external_url: fileUrl }).eq("id", documentId)
}

async function upsertWorkspaceDocumentForScope(
  spaceId: string,
  workspaceId: string,
  spaceItem: SpaceDocumentItem,
  adminClient = createAdminClient(),
): Promise<boolean> {
  console.log(`[ScopeDocuments] upsertWorkspaceDocumentForScope called:`, {
    spaceId,
    workspaceId,
    spaceItemId: spaceItem.id,
  })

  const payload = spaceItem.payload || {}
  const title = (payload.title || payload.file_name || "Scope document").trim()
  const sanitizedFullText = sanitizeScopeContent(payload.full_text || "")
  const sanitizedSummary = sanitizeScopeContent(payload.summary || "")
  let content = sanitizedFullText || sanitizedSummary

  if (content.length === 0) {
    if (payload.file_url) {
      content = `See original file: ${payload.file_url}`
    } else {
      content = title
    }
  }
  const hasLimitedContent = sanitizedFullText.length === 0

  console.log(`[ScopeDocuments] Document content prepared:`, {
    title,
    contentLength: content.length,
    hasLimitedContent,
  })

  async function upsertDocumentPageContent(documentId: string) {
    if (!content || content.length === 0) return

    const pages = splitTextIntoPages(content)
    if (pages.length === 0) return

    const { error: deleteError } = await adminClient.from("document_pages").delete().eq("document_id", documentId)
    if (deleteError) {
      console.error("[ScopeDocuments] Failed to clear document pages:", deleteError)
      return false
    }

    for (let start = 0; start < pages.length; start += 100) {
      const { error: insertPageError } = await adminClient.from("document_pages").insert(
        pages.slice(start, start + 100).map((page) => ({
          text_content: page.text,
          text_items: [],
          character_offsets: {},
          page_number: page.pageNumber,
          document_id: documentId,
        })),
      )
      if (insertPageError) {
        console.error("[ScopeDocuments] Failed to insert document pages:", insertPageError)
        return false
      }
    }

    const sections = await rebuildDocumentSectionsWithClient(adminClient, documentId, workspaceId)
    if (sections.error) console.error("[ScopeDocuments] Failed to rebuild sections:", sections.error)
  }

  // Check if we already created a document for this workspace from this scope item
  console.log(`[ScopeDocuments] Checking for existing document...`)
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
    sourceUrl: spaceItem.source_url || payload.file_url || null,
    type: payload.mime_type || null,
    origin: "space_scope",
    hasLimitedContent,
  }

  if (lookupError) {
    console.error("[ScopeDocuments] Failed to lookup existing document:", lookupError)
  }

  if (existingDoc) {
    console.log(`[ScopeDocuments] Found existing document, updating:`, { documentId: existingDoc.id })
    const mergedMetadata = {
      ...(existingDoc.metadata || {}),
      ...metadataExtras,
    }

    const { error: updateError } = await updateInheritedDocument(
      adminClient,
      existingDoc.id,
      {
        title,
        content,
        classification,
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
      },
      payload.file_url || null,
    )

    if (updateError) {
        console.error("[ScopeDocuments] Failed to update existing document:", updateError)
        return false
      }

      console.log(`[ScopeDocuments] Successfully updated existing document`)
      await upsertDocumentPageContent(existingDoc.id)
      revalidatePath(`/workspaces/${workspaceId}`)
      return true
  }

  console.log(`[ScopeDocuments] No existing document found, creating new one`)

  console.log(`[ScopeDocuments] Fetching workspace record...`)
  const { data: workspaceRecord, error: workspaceError } = await adminClient
    .from("workspaces")
    .select("id, space_id, created_by")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspaceRecord) {
    console.error("[ScopeDocuments] Failed to fetch workspace for scope document:", {
      workspaceId,
      error: workspaceError,
    })
    return false
  }

  console.log(`[ScopeDocuments] Workspace record found, ensuring source...`)
  let sourceId: string
  try {
    sourceId = await ensureWorkspaceGeneratedSourceAdmin(workspaceId, adminClient, workspaceRecord.created_by)
    console.log(`[ScopeDocuments] Source ensured:`, { sourceId })
  } catch (sourceError) {
    console.error("[ScopeDocuments] Failed to ensure workspace source for scope document:", {
      workspaceId,
      error: sourceError,
    })
    return false
  }

  const now = new Date().toISOString()
  const metadata = {
    createdBy: workspaceRecord.created_by,
    lastEditedBy: workspaceRecord.created_by,
    lastEditedAt: now,
    ...metadataExtras,
  }

  console.log(`[ScopeDocuments] Creating new document...`, {
    sourceId,
    workspaceId,
    tenantId: workspaceRecord.space_id,
    title,
    classification,
  })

  const { data: newDoc, error: createError } = await insertInheritedDocument(
    adminClient,
    {
      source_id: sourceId,
      workspace_id: workspaceId,
      tenant_id: workspaceRecord.space_id || null,
      external_id: randomUUID(),
      title,
      content,
      status: "active",
      classification: classification || "internal",
      metadata,
    },
    payload.file_url || null,
  )

  if (createError || !newDoc) {
    console.error("[ScopeDocuments] Failed to create workspace document from scope:", {
      error: createError,
      errorMessage: createError?.message,
      errorDetails: createError?.details,
      errorHint: createError?.hint,
      errorCode: createError?.code,
    })
    return false
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
  return true
}

export async function syncScopeDocumentToAllWorkspaces(
  spaceId: string,
  spaceItem: SpaceDocumentItem,
  adminClient = createAdminClient(),
  upsertFn: typeof upsertWorkspaceDocumentForScope = upsertWorkspaceDocumentForScope,
) {

  const classification = spaceItem.classification ?? "internal"
  const visibility = spaceItem.visibility ?? "internal"

  console.log("[ScopeDocuments] Sync request:", {
    spaceId,
    spaceItemId: spaceItem.id,
    classification,
    visibility,
  })

  if (classification !== "public" && visibility !== "public") {
    console.log("[ScopeDocuments] Document is not public, removing from workspaces if exists")
    await removeScopeDocumentFromAllWorkspaces(spaceId, spaceItem.id)
    return
  }

  const [{ data: workspaces, error: workspacesError }, { data: linkedWorkspaces, error: linksError }] = await Promise.all([
    adminClient.from("workspaces").select("id").eq("space_id", spaceId),
    adminClient.from("workspace_space_links").select("workspace_id").eq("space_id", spaceId),
  ])

  if (workspacesError) {
    console.error("[ScopeDocuments] Error fetching workspaces:", workspacesError)
    throw new Error(`[ScopeDocuments] Failed to fetch workspaces for scope sync: ${workspacesError.message}`)
  }

  if (linksError) {
    console.error("[ScopeDocuments] Error fetching linked workspaces:", linksError)
    throw new Error(`[ScopeDocuments] Failed to fetch linked workspaces for scope sync: ${linksError.message}`)
  }

  const workspaceIds = new Set<string>()
  type WorkspaceRow = { id: string }
  type WorkspaceLinkRow = { workspace_id: string }

  ;(workspaces ?? []).forEach((workspace: WorkspaceRow) => workspaceIds.add(workspace.id))
  ;(linkedWorkspaces ?? []).forEach((link: WorkspaceLinkRow) => workspaceIds.add(link.workspace_id))

  console.log("[ScopeDocuments] Found workspaces to sync:", {
    spaceId,
    spaceItemId: spaceItem.id,
    directWorkspaces: workspaces?.length ?? 0,
    linkedWorkspaces: linkedWorkspaces?.length ?? 0,
    totalUniqueWorkspaces: workspaceIds.size,
    workspaceIds: Array.from(workspaceIds),
  })

  if (workspaceIds.size === 0) {
    console.log("[ScopeDocuments] No workspaces found to sync to - this is expected for new spaces")
    return
  }

  const failedWorkspaceIds: string[] = []
  const failureDetails: { workspaceId: string; reason: string }[] = []
  
  for (const workspaceId of workspaceIds) {
    console.log(`[ScopeDocuments] Syncing to workspace ${workspaceId}...`)
    try {
      const synced = await upsertFn(spaceId, workspaceId, spaceItem, adminClient)
      if (!synced) {
        failedWorkspaceIds.push(workspaceId)
        failureDetails.push({ workspaceId, reason: "upsert returned false" })
        console.error(`[ScopeDocuments] Failed to sync to workspace ${workspaceId}: upsert returned false`)
      } else {
        console.log(`[ScopeDocuments] Successfully synced to workspace ${workspaceId}`)
      }
    } catch (upsertError) {
      failedWorkspaceIds.push(workspaceId)
      const errorMsg = upsertError instanceof Error ? upsertError.message : String(upsertError)
      failureDetails.push({ workspaceId, reason: errorMsg })
      console.error(`[ScopeDocuments] Exception while syncing to workspace ${workspaceId}:`, upsertError)
    }
  }

  if (failedWorkspaceIds.length > 0) {
    console.error("[ScopeDocuments] Sync failures:", failureDetails)
    throw new Error(
      `[ScopeDocuments] Failed to sync scope document to ${failedWorkspaceIds.length} workspace(s): ${failedWorkspaceIds.join(", ")}. Details: ${JSON.stringify(failureDetails)}`,
    )
  }

  console.log("[ScopeDocuments] Successfully synced to all workspaces")
}

export async function syncAllScopeDocumentsToWorkspace(
  spaceId: string,
  workspaceId: string,
  adminClient = createAdminClient(),
  upsertFn: typeof upsertWorkspaceDocumentForScope = upsertWorkspaceDocumentForScope,
): Promise<{ syncedCount: number }> {
  const { data: scopeItems, error } = await adminClient
    .from("space_items")
    .select("id, classification, visibility, source_url, payload")
    .eq("space_id", spaceId)
    .eq("item_type", "document")

  if (error) {
    throw new Error(`[ScopeDocuments] Failed to fetch scope documents for workspace: ${error.message}`)
  }

  if (!scopeItems || scopeItems.length === 0) {
    return { syncedCount: 0 }
  }

  let syncedCount = 0
  const failedItemIds: string[] = []
  for (const item of scopeItems) {
    const classification = item.classification ?? "internal"
    const visibility = item.visibility ?? "internal"
    if (classification !== "public" && visibility !== "public") {
      continue
    }
    const synced = await upsertFn(spaceId, workspaceId, item as SpaceDocumentItem, adminClient)
    if (!synced) {
      failedItemIds.push(item.id)
    } else {
      syncedCount += 1
    }
  }

  if (failedItemIds.length > 0) {
    throw new Error(
      `[ScopeDocuments] Failed to sync ${failedItemIds.length} scope document(s) for workspace ${workspaceId}: ${failedItemIds.join(", ")}`,
    )
  }

  return { syncedCount }
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

  type DocumentLookupRow = { id: string; workspace_id?: string | null }
  const documentIds = documents.map((doc: DocumentLookupRow) => doc.id)
  const workspaceIds = Array.from(new Set(documents.map((doc: DocumentLookupRow) => doc.workspace_id).filter(Boolean))) as string[]

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
    type InheritedDocumentRow = { id: string }
    const docIds = documents.map((doc: InheritedDocumentRow) => doc.id)
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
    type SpaceItemIdRow = { id: string }
    const spaceItemIds = spaceItems.map((item: SpaceItemIdRow) => item.id)
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
