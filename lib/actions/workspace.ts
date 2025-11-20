"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import OpenAI from "openai"
import { env } from "@/lib/env"

import { syncAllScopeDocumentsToWorkspace } from "@/lib/services/scope-documents"
import { withCache, workspaceCacheKey } from "@/lib/cache/api-cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"

export async function createWorkspace(spaceId: string, name: string, description?: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      space_id: spaceId,
      name,
      description,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    // Handle unique constraint violations with user-friendly messages
    if (error.code === "23505" || error.message.includes("unique") || error.message.includes("duplicate")) {
      return { 
        error: `A workspace with the name "${name}" already exists in this space. Please choose a different name.` 
      }
    }
    
    return { error: error.message }
  }

  const { error: membershipError } = await supabase
    .from("workspace_members")
    .upsert(
      {
        workspace_id: data.id,
        user_id: user.id,
        role: "admin",
      },
      { onConflict: "workspace_id,user_id" },
    )

  if (membershipError) {
    console.error("[Workspace] Failed to seed workspace membership", membershipError)
  }

  let scopeSyncWarning: string | undefined
  try {
    await syncAllScopeDocumentsToWorkspace(spaceId, data.id)
  } catch (syncError) {
    console.error("[Workspace] Failed to sync scope documents:", syncError)
    const message =
      syncError instanceof Error ? syncError.message : "An unknown error occurred while syncing scope documents."
    scopeSyncWarning = `Workspace created, but inherited documents could not be synced automatically: ${message}`
  }

  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/workspaces/${data.id}`)
  return scopeSyncWarning ? { data, warning: scopeSyncWarning } : { data }
}

export async function updateWorkspace(
  workspaceId: string,
  name: string,
  description?: string | null,
  context?: string | null,
  location?: string | null,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const updateData: {
    name: string
    description?: string | null
    context?: string | null
    location?: string | null
  } = { name }

  if (description !== undefined) {
    updateData.description = description
  }
  if (context !== undefined) {
    updateData.context = context
  }
  if (location !== undefined) {
    updateData.location = location
  }

  const { data, error } = await supabase
    .from("workspaces")
    .update(updateData)
    .eq("id", workspaceId)
    .select()
    .single()

  if (error) {
    // Handle unique constraint violations with user-friendly messages
    if (error.code === "23505" || error.message.includes("unique") || error.message.includes("duplicate")) {
      return { 
        error: `A workspace with the name "${name}" already exists in this space. Please choose a different name.` 
      }
    }
    
    return { error: error.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { data }
}

export async function deleteWorkspace(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard")
  return { success: true }
}

export async function removeWorkspaceMember(workspaceId: string, memberUserId: string) {
  const supabase = await createClient()

  try {
    await requireAuthAndPermission("workspace:share", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { data: member, error: memberFetchError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)
    .maybeSingle()

  if (memberFetchError) {
    return { error: memberFetchError.message }
  }

  if (!member) {
    return { error: "Member not found" }
  }

  if (member.role === "admin") {
    const { data: admins } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("role", "admin")

    if ((admins?.length ?? 0) <= 1) {
      return { error: "Workspaces must have at least one admin. Promote another member before removing this admin." }
    }
  }

  const { error: deleteError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)

  if (deleteError) {
    return { error: deleteError.message }
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  return { success: true }
}

export async function getWorkspacesBySpace(spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data }
}

export async function getWorkspaceContextDetails(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: null, error: "Unauthorized" }
  }

  try {
    const cacheKey = workspaceCacheKey("context-details", workspaceId)
    const data = await withCache(
      cacheKey,
      async () => {
        const { data, error } = await supabase
          .from("workspaces")
          .select("context, location")
          .eq("id", workspaceId)
          .maybeSingle()

        if (error) {
          throw new Error(error.message)
        }

        return data ?? null
      },
      { ttl: 300, tags: [`workspace:${workspaceId}`] },
    )

    if (!data) {
      return { data: null, error: "Workspace not found" }
    }

    return { data }
  } catch (cacheError) {
    const message = cacheError instanceof Error ? cacheError.message : "Failed to load workspace context"
    return { data: null, error: message }
  }
}

export async function enhanceContextText(text: string): Promise<{ enhanced?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  if (!env.OPENAI_API_KEY) {
    return { error: "OpenAI API key not configured" }
  }

  if (!text || text.trim().length === 0) {
    return { error: "Text is empty" }
  }

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that enhances workspace context descriptions. Your job is to improve the clarity, completeness, and usefulness of workspace context descriptions that will help AI search and understand documents better.

Rules:
- Keep the enhanced text concise but comprehensive
- Maintain the original meaning and intent
- Add relevant details that would help with document search and understanding
- Use clear, professional language
- Focus on domain, document types, and key information
- Do not add information that wasn't implied in the original text
- Return only the enhanced text, no explanations or meta-commentary`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    })

    const enhanced = response.choices[0]?.message?.content?.trim()
    if (enhanced && enhanced.length > 0) {
      return { enhanced }
    }

    return { error: "Failed to generate enhanced text" }
  } catch (error) {
    console.error("[enhanceContextText] Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to enhance text" }
  }
}
