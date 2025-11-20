"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomBytes } from "node:crypto"
import { env } from "@/lib/env"

export async function createSharedLink(conversationId: string, expiresInDays?: number) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Verify user owns the conversation
  const { data: conversation } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .single()

  if (!conversation || conversation.user_id !== user.id) {
    return { error: "Unauthorized" }
  }

  // Generate unique token
  const token = randomBytes(32).toString("hex")
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null

  const { data, error } = await supabase
    .from("shared_links")
    .insert({
      conversation_id: conversationId,
      token,
      created_by: user.id,
      expires_at: expiresAt?.toISOString(),
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const shareUrl = `${appUrl}/shared/${token}`

  return { data, shareUrl }
}

export async function getSharedConversation(token: string) {
  const adminClient = createAdminClient()

  // Get shared link using service role to avoid exposing broad RLS policies
  const { data: sharedLink, error: linkError } = await adminClient
    .from("shared_links")
    .select("*, conversations(*, workspaces(name))")
    .eq("token", token)
    .single()

  if (linkError || !sharedLink) {
    return { data: null, error: "Shared link not found" }
  }

  // Check if expired
  if (sharedLink.expires_at && new Date(sharedLink.expires_at) < new Date()) {
    return { data: null, error: "This shared link has expired" }
  }

  return { data: sharedLink }
}

export async function getSharedMessages(conversationId: string) {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function deleteSharedLink(linkId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("shared_links").delete().eq("id", linkId).eq("created_by", user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function getConversationSharedLinks(conversationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("shared_links")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}
