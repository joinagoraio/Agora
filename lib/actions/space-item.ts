"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { canPublishSpaceItems, type Role } from "@/lib/rbac/permissions"
import {
  removeScopeDocumentFromAllWorkspaces,
  syncScopeDocumentToAllWorkspaces,
  type SpaceDocumentItem,
} from "@/lib/services/scope-documents"
import { resolveSpaceItemClassification, shouldSyncSpaceDocument } from "@/lib/utils/space-items"

async function requireSpaceItemPublisher(spaceId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" as const }
  }

  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership?.role || !canPublishSpaceItems(membership.role as Role)) {
    return { error: "You don't have permission to change documents in this authority" as const }
  }

  return { user, adminClient }
}

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
  const access = await requireSpaceItemPublisher(spaceId)
  if ("error" in access) {
    return { error: access.error }
  }

  const { user, adminClient } = access
  const resolvedClassification = resolveSpaceItemClassification(itemData.item_type, itemData.classification)

  const { data, error } = await adminClient
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

  if (data && shouldSyncSpaceDocument(itemData.item_type, resolvedClassification, data.visibility)) {
    try {
      await syncScopeDocumentToAllWorkspaces(spaceId, data as SpaceDocumentItem)
    } catch (syncError) {
      console.error("[SpaceItems] Failed to sync document to linked workspaces:", syncError)
      warnings.push("sync_failed")
    }
  }

  revalidatePath(`/spaces/${spaceId}`)
  if (warnings.length > 0) {
    return { data, warnings }
  }
  return { data }
}

export async function unpublishSpaceItem(itemId: string) {
  const adminClient = createAdminClient()
  const { data: item } = await adminClient
    .from("space_items")
    .select("space_id, item_type, classification")
    .eq("id", itemId)
    .single()

  if (!item) {
    return { error: "Item not found" }
  }

  const access = await requireSpaceItemPublisher(item.space_id)
  if ("error" in access) {
    return { error: "You don't have permission to delete items in this authority" }
  }

  const { error } = await access.adminClient.from("space_items").delete().eq("id", itemId)

  if (error) {
    console.error("[unpublishSpaceItem] Delete error:", error)
    return { error: error.message || "Failed to delete item" }
  }

  if (item.item_type === "document") {
    await removeScopeDocumentFromAllWorkspaces(item.space_id, itemId)
  }

  revalidatePath(`/spaces/${item.space_id}`)
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

  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) {
    return { data: [], error: "Unauthorized" }
  }

  let query = adminClient
    .from("space_items")
    .select("*")
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
    console.error("[getSpaceItems]", error)
    return { data: [], error: error.message }
  }

  return { data: data || [] }
}

export async function getSpaceItem(spaceId: string, itemId: string) {
  const { data, error } = await getSpaceItems(spaceId)
  if (error) {
    return { data: null, error }
  }
  const item = (data ?? []).find((row) => row.id === itemId) ?? null
  if (!item) {
    return { data: null, error: "Not found" as const }
  }
  return { data: item }
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
    .select("*, created_by:profiles(id, email, full_name), source_doc:documents(id, title)")
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
  const adminClient = createAdminClient()
  const { data: existingItem } = await adminClient
    .from("space_items")
    .select("space_id, item_type, classification")
    .eq("id", itemId)
    .single()

  if (!existingItem) {
    return { error: "Item not found" }
  }

  const access = await requireSpaceItemPublisher(existingItem.space_id)
  if ("error" in access) {
    return { error: access.error }
  }

  const { data, error } = await access.adminClient
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
      visibility: data.visibility,
      payload: data.payload,
    }

    if ((spaceDocument.classification ?? "internal") === "public") {
      try {
        await syncScopeDocumentToAllWorkspaces(existingItem.space_id, spaceDocument)
      } catch (syncError) {
        console.error("[SpaceItems] Failed to sync updated document to linked workspaces:", syncError)
        warnings.push("sync_failed")
      }
    } else {
      await removeScopeDocumentFromAllWorkspaces(existingItem.space_id, itemId)
    }
  }

  revalidatePath(`/spaces/${data.space_id}`)
  if (warnings.length > 0) {
    return { data, warnings }
  }
  return { data }
}
