"use server"

import { resolveConversationScope } from "@/lib/chat/conversation-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { userHasWorkspaceAccess } from "@/lib/utils/workspace-access"
import { revalidatePath } from "next/cache"

export type ConversationContextType = "workspace" | "document_view" | "document_edit"

interface CreateConversationOptions {
  title?: string
  contextType?: ConversationContextType
  contextId?: string | null
  spaceId?: string
}

interface ConversationQueryOptions {
  contextType?: ConversationContextType
  contextId?: string | null
  spaceId?: string
  allInScope?: boolean
}

export async function createConversation(
  workspaceId: string | null,
  options: CreateConversationOptions = {},
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { title, contextType = "workspace", contextId = null, spaceId } = options
  const scope = resolveConversationScope(workspaceId, spaceId)
  if (!scope) {
    return { error: "Missing scope" }
  }

  if (scope.workspaceId) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("space_id")
      .eq("id", scope.workspaceId)
      .maybeSingle()
    if (!workspace?.space_id) {
      return { error: "Programme not found" }
    }
    const allowed = await userHasWorkspaceAccess(supabase, scope.workspaceId, workspace.space_id, user.id)
    if (!allowed) {
      return { error: "Unauthorized" }
    }
  } else if (scope.spaceId) {
    const { data: spaceMember } = await supabase
      .from("space_members")
      .select("id")
      .eq("space_id", scope.spaceId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!spaceMember) {
      return { error: "Unauthorized" }
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("conversations")
    .insert({
      workspace_id: scope.workspaceId,
      space_id: scope.spaceId,
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

  const admin = createAdminClient()
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, user_id")
    .eq("id", conversationId)
    .maybeSingle()
  if (!conversation || conversation.user_id !== user.id) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await admin
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
  workspaceId: string | null,
  options: ConversationQueryOptions = {},
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { contextType = "workspace", contextId, spaceId, allInScope } = options
  const scope = resolveConversationScope(workspaceId, spaceId)
  if (!scope) {
    return { data: [], error: "Missing scope" }
  }

  if (scope.workspaceId) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("space_id")
      .eq("id", scope.workspaceId)
      .maybeSingle()
    if (!workspace?.space_id) {
      return { data: [], error: "Programme not found" }
    }
    const allowed = await userHasWorkspaceAccess(supabase, scope.workspaceId, workspace.space_id, user.id)
    if (!allowed) {
      return { data: [], error: "Unauthorized" }
    }
  } else if (scope.spaceId) {
    const { data: spaceMember } = await supabase
      .from("space_members")
      .select("id")
      .eq("space_id", scope.spaceId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!spaceMember) {
      return { data: [], error: "Unauthorized" }
    }
  }

  const admin = createAdminClient()
  let query = admin.from("conversations").select("*").eq("user_id", user.id)

  if (scope.spaceId) {
    query = query.eq("space_id", scope.spaceId)
  } else if (scope.workspaceId) {
    query = query.eq("workspace_id", scope.workspaceId)
  }

  if (!allInScope) {
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
