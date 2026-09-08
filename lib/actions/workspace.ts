"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

import { syncAllScopeDocumentsToWorkspace } from "@/lib/services/scope-documents"
import { withCache, workspaceCacheKey } from "@/lib/cache/api-cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { getServerTranslator } from "@/lib/i18n/server"
import { canManageProgrammeAccess } from "@/lib/programme/membership"
import { emptyProgrammeBindings } from "@/lib/programme/domain"

export async function createWorkspace(
  spaceId: string,
  name: string,
  description?: string,
  kind: "research" | "environmental_programme" = "research",
  options?: { templateId?: string | null },
) {
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  // Verify user has permission to create workspaces in this space
  try {
    await requireAuthAndPermission("workspace:create", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const templateId = options?.templateId?.trim() || null
  const metadata: Record<string, unknown> = { kind }
  if (templateId) {
    const { data: template, error: templateError } = await supabase
      .from("programme_templates")
      .select("id, space_id")
      .eq("id", templateId)
      .maybeSingle()
    if (templateError || !template || template.space_id !== spaceId) {
      return { error: t("space.workspaces.dialog.templateInvalid") }
    }
    metadata.programmeBindings = { ...emptyProgrammeBindings(), templateId }
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      space_id: spaceId,
      name,
      description,
      created_by: user.id,
      kind,
      metadata,
    })
    .select()
    .single()

  if (error) {
    // Handle unique constraint violations with user-friendly messages
    if (error.code === "23505" || error.message.includes("unique") || error.message.includes("duplicate")) {
      return { 
        error: t("space.workspaces.dialog.duplicate", undefined, { name })
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
  summary?: string | null,
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
    summary?: string | null
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
  if (summary !== undefined) {
    updateData.summary = summary
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
  if (data.space_id) revalidatePath(`/spaces/${data.space_id}`)
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

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, space_id")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    return { error: "Workspace not found" }
  }

  if (workspace.space_id) {
    const { data: space } = await supabase.from("spaces").select("metadata").eq("id", workspace.space_id).maybeSingle()
    if (space) {
      const { parseRetentionPolicy, assertDestructiveAllowed } = await import("@/lib/programme/reliability")
      const hold = assertDestructiveAllowed(parseRetentionPolicy(space.metadata as Record<string, unknown>))
      if (!hold.ok) {
        return { error: hold.reason }
      }
    }
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/dashboard")
  if (workspace.space_id) revalidatePath(`/spaces/${workspace.space_id}`)
  return { success: true }
}

export async function getWorkspaceAccessSettings(workspaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, space_id, created_by")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    return { error: "Programme not found" }
  }

  const { data: workspaceMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: spaceMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", workspace.space_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (
    !canManageProgrammeAccess({
      workspaceRole: workspaceMembership?.role ?? null,
      isCreator: workspace.created_by === user.id,
      spaceRole: spaceMembership?.role ?? null,
    })
  ) {
    return { error: "Unauthorized" }
  }

  const { data: workspaceMembers } = await supabase
    .from("workspace_members")
    .select("*, profiles(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  const { data: spaceMembers } = await supabase
    .from("space_members")
    .select("user_id, role, profiles(*)")
    .eq("space_id", workspace.space_id)
    .order("created_at", { ascending: false })

  const { data: invitations } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  const pendingInvitations = (invitations ?? []).filter((invite) => invite.status === "pending")
  const memberIds = new Set((workspaceMembers ?? []).map((row) => row.user_id))
  const authorityEmails = new Set<string>()
  for (const row of spaceMembers ?? []) {
    const email = String((row.profiles as { email?: string } | null)?.email || "").toLowerCase()
    if (email) authorityEmails.add(email)
  }
  const pendingEmails = new Set(pendingInvitations.map((invite) => String(invite.email || "").toLowerCase()))

  const authorityCandidates = (spaceMembers ?? [])
    .filter((row) => {
      if (memberIds.has(row.user_id)) return false
      const email = String((row.profiles as { email?: string } | null)?.email || "").toLowerCase()
      if (email && pendingEmails.has(email)) return false
      return true
    })
    .map((row) => {
      const profile = row.profiles as { full_name?: string | null; email?: string | null } | null
      return {
        userId: row.user_id as string,
        name: profile?.full_name || profile?.email || "",
        email: profile?.email || "",
      }
    })
    .filter((row) => row.email)

  const members = (workspaceMembers ?? []).map((row) => ({
    ...row,
    source: "workspace",
    workspace_role: row.role,
    workspace_job: row.job,
  }))

  return {
    data: {
      workspace,
      members,
      invitations: pendingInvitations.map((invite) => ({
        ...invite,
        channel: authorityEmails.has(String(invite.email || "").toLowerCase()) ? "in_app" : "email",
      })),
      authorityCandidates,
      currentUserId: user.id,
    },
  }
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

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberUserId: string,
  newRole: "admin" | "member" | "viewer"
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Check if current user has permission
  try {
    await requireAuthAndPermission("workspace:share", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  // Update the member's role
  const { error } = await supabase
    .from("workspace_members")
    .update({ role: newRole })
    .eq("workspace_id", workspaceId)
    .eq("user_id", memberUserId)

  if (error) {
    console.error("[updateWorkspaceMemberRole] Error:", error)
    return { error: "Failed to update member role" }
  }

  revalidatePath(`/workspaces/${workspaceId}/settings`)
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

  // Get user's language preference
  const { data: profile } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .single()
  
  const userLanguage = profile?.language === "nl" ? "Dutch" : "English"

  if (!text || text.trim().length === 0) {
    return { error: "Text is empty" }
  }

  try {
    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const { applyPromptLanguage, getPlatformPrompt } = await import("@/lib/llm/prompts")
    const system = applyPromptLanguage(await getPlatformPrompt("enhance_workspace"), userLanguage)
    const result = await completePlatformTask("enhance", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      maxTokens: 500,
      temperature: 0.7,
    })
    const enhanced = result.text.trim()
    if (enhanced) return { enhanced }
    return { error: "Failed to generate enhanced text" }
  } catch (error) {
    console.error("[enhanceContextText] Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to enhance text" }
  }
}

/**
 * AI enhancement for workspace summary and description fields
 * Similar to enhanceScopeText for spaces, but for workspaces
 */
export async function enhanceWorkspaceText(
  text: string,
  options?: {
    field?: "summary" | "description"
    workspaceName?: string
    summary?: string
  },
): Promise<{ enhanced?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Get user's language preference
  const { data: profile } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .single()
  
  const userLanguage = profile?.language === "nl" ? "Dutch" : "English"

  if (!text || text.trim().length === 0) {
    return { error: "Text is empty" }
  }

  const field = options?.field ?? "description"
  const isSummary = field === "summary"

  try {
    const contextParts: string[] = []
    if (isSummary && options?.workspaceName) {
      contextParts.push(`Workspace name: ${options.workspaceName}`)
    }
    if (!isSummary && options?.summary) {
      contextParts.push(`Summary: ${options.summary}`)
    }
    const contextText = contextParts.length > 0 ? `\n\nContext:\n${contextParts.join("\n")}` : ""
    const userPrompt = isSummary
      ? `Write a concise summary for this workspace:${contextText}\n\nCurrent text:\n${text}`
      : `Write a comprehensive but concise description for this workspace:${contextText}\n\nCurrent text:\n${text}`

    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const { applyPromptLanguage, getPlatformPrompt } = await import("@/lib/llm/prompts")
    const system = applyPromptLanguage(
      await getPlatformPrompt(isSummary ? "enhance_summary" : "enhance_description"),
      userLanguage,
    )
    const result = await completePlatformTask("enhance", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      maxTokens: isSummary ? 120 : 500,
      temperature: 0.7,
    })
    const enhanced = result.text.trim()
    if (enhanced) return { enhanced }
    return { error: "Failed to generate enhanced text" }
  } catch (error) {
    console.error("[enhanceWorkspaceText] Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to enhance text" }
  }
}
