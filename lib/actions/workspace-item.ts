"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function getWorkspaceItems(
  workspaceId: string,
  filters?: {
    inheritance?: "reference" | "local"
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
    .from("workspace_items")
    .select(
      "*, created_by:profiles(id, email, full_name), source_space_item:space_items(id, item_type, classification, payload, source_url, source_doc_id, source_page)",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (filters?.inheritance) {
    query = query.eq("inheritance", filters.inheritance)
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

export async function createWorkspaceItem(
  workspaceId: string,
  itemData: {
    inheritance?: "reference" | "local"
    classification?: "public" | "internal" | "confidential"
    payload: Record<string, any>
    source_space_item_id?: string
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
    .from("workspace_items")
    .insert({
      workspace_id: workspaceId,
      inheritance: itemData.inheritance || "local",
      classification: itemData.classification || "internal",
      payload: itemData.payload,
      source_space_item_id: itemData.source_space_item_id || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data }
}

export async function saveEvidenceToWorkspace(
  workspaceId: string,
  evidenceData: {
    question: string
    answer: string
    citations: Array<{
      title: string
      url?: string
      docId?: string
      page?: number
      layer: "national" | "regional" | "municipal" | "local"
    }>
    confidence: "low" | "medium" | "high"
    conversationId?: string
    conversationTitle?: string
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Create workspace_item with evidence payload
  const payload: Record<string, any> = {
    type: "evidence",
    question: evidenceData.question,
    answer: evidenceData.answer,
    citations: evidenceData.citations,
    confidence: evidenceData.confidence,
    saved_at: new Date().toISOString(),
  }

  // Add conversation information if provided
  if (evidenceData.conversationId) {
    payload.saved_from_chat = true
    payload.conversation_id = evidenceData.conversationId
    if (evidenceData.conversationTitle) {
      payload.conversation_title = evidenceData.conversationTitle
    }
  }

  const { data, error } = await supabase
    .from("workspace_items")
    .insert({
      workspace_id: workspaceId,
      inheritance: "local",
      classification: "internal", // Evidence is internal by default
      payload,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data }
}

export async function updateWorkspaceItem(
  itemId: string,
  updates: {
    classification?: "public" | "internal" | "confidential"
    payload?: Record<string, any>
    include_in_ai_context?: boolean
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Only allow updating local items
  const { data: item } = await supabase.from("workspace_items").select("inheritance, workspace_id").eq("id", itemId).single()

  if (!item) {
    return { error: "Item not found" }
  }

  if (item.inheritance !== "local") {
    return { error: "Cannot update inherited reference items" }
  }

  const { data, error } = await supabase
    .from("workspace_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${item.workspace_id}`)
  return { data }
}

export async function deleteWorkspaceItem(itemId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Only allow deleting local items
  const { data: item } = await supabase.from("workspace_items").select("inheritance, workspace_id").eq("id", itemId).single()

  if (!item) {
    return { error: "Item not found" }
  }

  if (item.inheritance !== "reference") {
    return { error: "Cannot delete inherited reference items" }
  }

  const { error } = await supabase.from("workspace_items").delete().eq("id", itemId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${item.workspace_id}`)
  return { success: true }
}
