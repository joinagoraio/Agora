"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

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

  const { data, error } = await supabase
    .from("space_items")
    .insert({
      space_id: spaceId,
      ...itemData,
      classification: itemData.classification || "internal",
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}/items`)
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
  const { data: item } = await supabase.from("space_items").select("space_id").eq("id", itemId).single()

  if (!item) {
    return { error: "Item not found" }
  }

  const { error } = await supabase.from("space_items").delete().eq("id", itemId)

  if (error) {
    return { error: error.message }
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

  const { data, error } = await supabase
    .from("space_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${data.space_id}/items`)
  return { data }
}
