"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type ConversationContextType = "workspace" | "document_view" | "document_edit"

interface CreateConversationOptions {
  title?: string
  contextType?: ConversationContextType
  contextId?: string | null
}

interface ConversationQueryOptions {
  contextType?: ConversationContextType
  contextId?: string | null
}

export async function createConversation(
  workspaceId: string,
  options: CreateConversationOptions = {},
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { title, contextType = "workspace", contextId = null } = options

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      title: title || "New Conversation",
      context_type: contextType,
      context_id: contextType === "workspace" ? null : contextId,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getConversation(conversationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("*, workspaces(*)")
    .eq("id", conversationId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data }
}

export async function getConversationMessages(conversationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function addMessage(
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string,
  sources?: any[],
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      sources: sources || [],
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  return { data }
}

export async function getUserConversations(
  workspaceId: string,
  options: ConversationQueryOptions = {},
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { contextType = "workspace", contextId } = options

  let query = supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)

  if (contextType === "workspace") {
    query = query.eq("context_type", "workspace").is("context_id", null)
  } else {
    query = query.eq("context_type", contextType)
    if (contextId) {
      query = query.eq("context_id", contextId)
    } else {
      query = query.is("context_id", null)
    }
  }

  const { data, error } = await query.order("updated_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function deleteConversation(conversationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("conversations").delete().eq("id", conversationId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function archiveConversation(conversationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // For now, archive is the same as delete. Can be updated later to set a status field
  const { error } = await supabase.from("conversations").delete().eq("id", conversationId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function updateConversationTitle(conversationId: string, title: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const cleanedTitle = title.replace(/\s+/g, " ").trim()
  if (!cleanedTitle) {
    return { error: "Title cannot be empty" }
  }

  const { error } = await supabase
    .from("conversations")
    .update({
      title: cleanedTitle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}
