"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  removeScopeDocumentFromAllWorkspaces,
  syncScopeDocumentToAllWorkspaces,
  type SpaceDocumentItem,
} from "@/lib/services/scope-documents"
import { resolveSpaceItemClassification, shouldSyncSpaceDocument } from "@/lib/utils/space-items"

export async function updateSpaceType(
  spaceId: string,
  spaceType: "national" | "regional" | "municipal" | "party" | "other",
  jurisdiction?: Record<string, any>,
  visibility?: "public" | "internal" | "confidential",
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const updateData: any = {
    space_type: spaceType,
  }

  if (jurisdiction !== undefined) {
    updateData.jurisdiction = jurisdiction
  }

  if (visibility !== undefined) {
    updateData.visibility = visibility
  }

  const { data, error } = await supabase
    .from("spaces")
    .update(updateData)
    .eq("id", spaceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function publishSpaceItem(
  spaceId: string,
  itemData: {
    item_type: "policy" | "document" | "answer" | "note"
    classification?: "public" | "internal" | "confidential"
    payload: Record<string, any>
    source_url?: string
    source_doc_id?: string
    source_page?: number
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const resolvedClassification = resolveSpaceItemClassification(itemData.item_type, itemData.classification)

  const { data, error } = await supabase
    .from("space_items")
    .insert({
      space_id: spaceId,
      ...itemData,
      classification: resolvedClassification,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  const warnings: string[] = []

  if (data && shouldSyncSpaceDocument(itemData.item_type, resolvedClassification)) {
    try {
      await syncScopeDocumentToAllWorkspaces(spaceId, data as SpaceDocumentItem)
    } catch (syncError) {
      console.error("[SpaceItems] Failed to sync document to linked workspaces:", syncError)
      warnings.push(
        "Document uploaded, but we could not sync it to linked workspaces. Try re-linking the space or contact support if it keeps failing.",
      )
    }
  }

  revalidatePath(`/spaces/${spaceId}/items`)
  if (warnings.length > 0) {
    return { data, warnings }
  }
  return { data }
}

export async function unpublishSpaceItem(itemId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Get space_id first to check permissions
  const { data: item } = await supabase
    .from("space_items")
    .select("space_id, item_type, classification")
    .eq("id", itemId)
    .single()

  if (!item) {
    return { error: "Item not found" }
  }

  const { error } = await supabase.from("space_items").delete().eq("id", itemId)

  if (error) {
    return { error: error.message }
  }

  if (item.item_type === "document") {
    await removeScopeDocumentFromAllWorkspaces(item.space_id, itemId)
  }

  revalidatePath(`/spaces/${item.space_id}/items`)
  return { success: true }
}

export async function getSpaceItems(
  spaceId: string,
  filters?: {
    item_type?: "policy" | "document" | "answer" | "note"
    classification?: "public" | "internal" | "confidential"
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  let query = supabase
    .from("space_items")
    .select("*, created_by:profiles(id, email, full_name), source_doc:documents(id, title, url)")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  if (filters?.item_type) {
    query = query.eq("item_type", filters.item_type)
  }

  if (filters?.classification) {
    query = query.eq("classification", filters.classification)
  }

  const { data, error } = await query

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data || [] }
}

export async function getPublicSpaceItems(spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  // Get space visibility
  const { data: space } = await supabase.from("spaces").select("visibility").eq("id", spaceId).single()

  if (!space || space.visibility !== "public") {
    return { data: [] }
  }

  const { data, error } = await supabase
    .from("space_items")
    .select("*, created_by:profiles(id, email, full_name), source_doc:documents(id, title, url)")
    .eq("space_id", spaceId)
    .eq("classification", "public")
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: data || [] }
}

export async function updateSpaceItem(
  itemId: string,
  updates: {
    classification?: "public" | "internal" | "confidential"
    payload?: Record<string, any>
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: existingItem } = await supabase
    .from("space_items")
    .select("space_id, item_type, classification")
    .eq("id", itemId)
    .single()

  if (!existingItem) {
    return { error: "Item not found" }
  }

  const { data, error } = await supabase
    .from("space_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  const warnings: string[] = []

  if (existingItem.item_type === "document") {
    const spaceDocument: SpaceDocumentItem = {
      id: data.id,
      space_id: data.space_id,
      classification: data.classification,
      payload: data.payload,
    }

    if ((spaceDocument.classification ?? "internal") === "public") {
      try {
        await syncScopeDocumentToAllWorkspaces(existingItem.space_id, spaceDocument)
      } catch (syncError) {
        console.error("[SpaceItems] Failed to sync updated document to linked workspaces:", syncError)
        warnings.push(
          "Updated document, but syncing to linked workspaces failed. Try re-linking the space or contact support if the issue persists.",
        )
      }
    } else {
      await removeScopeDocumentFromAllWorkspaces(existingItem.space_id, itemId)
    }
  }

  revalidatePath(`/spaces/${data.space_id}/items`)
  if (warnings.length > 0) {
    return { data, warnings }
  }
  return { data }
}
