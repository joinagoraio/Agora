"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { env } from "@/lib/env"
import { requireAuth, requireAuthAndPermission } from "@/lib/middleware/authorization"
import { isPendingInvitation } from "@/lib/programme/membership"
import { getServerTranslator } from "@/lib/i18n/server"
import { defaultSpaceJobForRole, wouldLeaveLastAdministrator } from "@/lib/guidance/jobs"
import { ensureTenantForUser } from "@/lib/actions/tenant"

type SpaceAccessRole = "owner" | "admin" | "member" | "viewer"

function isSpaceAccessRole(value: string): value is SpaceAccessRole {
  return value === "owner" || value === "admin" || value === "member" || value === "viewer"
}

export async function createSpace(
  name: string,
  options?: {
    spaceType?: "national" | "regional" | "municipal" | "party" | "other"
    jurisdiction?: Record<string, any>
    visibility?: "public" | "internal" | "confidential"
    slug?: string
  },
) {
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // SECURITY: Limit number of spaces per user to prevent abuse
  // This can be configured via MAX_SPACES_PER_USER env variable (default: 10)
  const maxSpacesPerUser = parseInt(env.MAX_SPACES_PER_USER || "10", 10)

  const adminClient = createAdminClient()

  // Use admin client to bypass RLS for counting user's own spaces
  const { count: existingSpaceCount, error: countError } = await adminClient
    .from("space_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role", "owner")

  if (countError) {
    console.error("[v0] Error checking space count:", countError.message)
    return { error: "Failed to verify space creation eligibility" }
  }

  if ((existingSpaceCount ?? 0) >= maxSpacesPerUser) {
    return {
      error: `You have reached the maximum limit of ${maxSpacesPerUser} spaces. Please contact support if you need to create additional spaces.`,
    }
  }

  // Ensure profile exists before creating space (owner_id references profiles.id)
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, language")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) {
    // Create profile if it doesn't exist (e.g., user created before trigger existed)
    // Use upsert to handle race condition where trigger creates profile simultaneously
    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || "",
        full_name: user.user_metadata?.full_name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
      },
      {
        onConflict: "id",
      },
    )

    if (profileError) {
      console.error("[v0] Error creating profile:", profileError.message)
      return { error: "Failed to create user profile" }
    }
  }

  // Generate slug if not provided
  const slug =
    options?.slug ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Organisation"
  const { tenantId } = await ensureTenantForUser(user.id, displayName)

  const spaceData: any = {
    name,
    slug,
    owner_id: user.id,
    tenant_id: tenantId,
    space_type: options?.spaceType || "municipal",
    visibility: options?.visibility || "internal",
    jurisdiction: options?.jurisdiction || {},
    writing_language: profile?.language === "nl" ? "nl" : "en",
  }

  const { data: newSpace, error: spaceError } = await adminClient
    .from("spaces")
    .insert(spaceData)
    .select()
    .single()

  if (spaceError) {
    console.error("[v0] Error creating space:", spaceError.message)
    
    // Handle duplicate slug error with user-friendly message
    if (spaceError.code === "23505" || spaceError.message.includes("spaces_slug_unique")) {
      return {
        error: t("space.dashboard.createSpace.duplicate", undefined, { name }),
      }
    }
    
    return { error: spaceError.message }
  }

  const { error: memberError } = await adminClient.from("space_members").upsert(
    {
      space_id: newSpace.id,
      user_id: user.id,
      role: "owner",
      job: "administrator",
    },
    { onConflict: "space_id,user_id", ignoreDuplicates: true },
  )

  if (memberError) {
    console.error("[v0] Error creating space member:", memberError.message)
    // Rollback: delete the space if member creation fails
    await adminClient.from("spaces").delete().eq("id", newSpace.id)
    return { error: "Failed to create space membership" }
  }

  revalidatePath("/dashboard")
  return { data: newSpace }
}

export async function updateSpace(
  spaceId: string,
  updates: {
    name?: string
    space_type?: "national" | "regional" | "municipal" | "party" | "other"
    jurisdiction?: Record<string, any>
    visibility?: "public" | "internal" | "confidential"
    logo_url?: string
    metadata?: Record<string, any>
    writing_language?: "en" | "nl"
  },
) {
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  if (
    updates.writing_language !== undefined &&
    updates.writing_language !== "en" &&
    updates.writing_language !== "nl"
  ) {
    return { error: "Writing language must be English or Dutch." }
  }

  const { data, error } = await supabase.from("spaces").update(updates).eq("id", spaceId).select().single()

  if (error) {
    // Handle duplicate slug error with user-friendly message
    if (error.code === "23505" || error.message.includes("spaces_slug_unique")) {
      const spaceName = updates.name || "this space"
      return {
        error: t("space.dashboard.createSpace.duplicate", undefined, { name: spaceName }),
      }
    }
    
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function updateSpaceScope(
  spaceId: string,
  scope: {
    summary?: string | null
    description?: string | null
    timeframe?: string | null
  },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: existingSpace, error: fetchError } = await supabase
    .from("spaces")
    .select("description, metadata")
    .eq("id", spaceId)
    .maybeSingle()

  if (fetchError) {
    return { error: fetchError.message }
  }

  if (!existingSpace) {
    return { error: "Space not found" }
  }

  const currentMetadata = (existingSpace?.metadata as Record<string, any> | null) ?? {}
  const currentScope = (currentMetadata.scope as Record<string, any> | null) ?? {}

  const nextMetadata = {
    ...currentMetadata,
    scope: {
      ...currentScope,
      ...(scope.description !== undefined ? { description: scope.description || null } : {}),
      ...(scope.timeframe !== undefined ? { timeframe: scope.timeframe || null } : {}),
    },
  }

  const updatesPayload: Record<string, any> = {
    metadata: nextMetadata,
  }

  if (scope.summary !== undefined) {
    updatesPayload.description = scope.summary && scope.summary.trim().length > 0 ? scope.summary : null
  }

  const { data, error } = await supabase.from("spaces").update(updatesPayload).eq("id", spaceId).select().single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function enhanceScopeText(
  text: string,
  options?: {
    field?: "summary" | "description"
    spaceName?: string
    missionStatement?: string
    spaceId?: string
  },
): Promise<{ enhanced?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const userLanguage = await writingLanguageForSpace(options?.spaceId)

  if (!text || text.trim().length === 0) {
    return { error: "Text is empty" }
  }

  const field = options?.field ?? "description"
  const isMissionStatement = field === "summary"

  try {
    const contextParts: string[] = []
    if (isMissionStatement && options?.spaceName) {
      contextParts.push(`Space name: ${options.spaceName}`)
    }
    if (!isMissionStatement && options?.missionStatement) {
      contextParts.push(`Mission statement: ${options.missionStatement}`)
    }
    const contextText = contextParts.length > 0 ? `\n\nContext:\n${contextParts.join("\n")}` : ""
    const userPrompt = isMissionStatement
      ? `Write a concise mission statement for this initiative:${contextText}\n\nCurrent text:\n${text}`
      : `Write a comprehensive but concise description for this initiative:${contextText}\n\nCurrent text:\n${text}`

    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const { applyPromptLanguage, getPlatformPrompt } = await import("@/lib/llm/prompts")
    const system = applyPromptLanguage(
      await getPlatformPrompt(isMissionStatement ? "enhance_summary" : "enhance_description"),
      userLanguage,
    )
    const result = await completePlatformTask("enhance", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      maxTokens: isMissionStatement ? 120 : 500,
      temperature: 0.7,
    })
    const enhanced = result.text.trim()
    if (enhanced) return { enhanced }
    return { error: "Failed to generate enhanced text" }
  } catch (error) {
    console.error("[enhanceScopeText] Error:", error)
    return { error: error instanceof Error ? error.message : "Failed to enhance text" }
  }
}

type SpaceSetupWizardState = {
  current_step?: number
  completed?: boolean
  completed_at?: string | null
  dismissed?: boolean
}

export async function updateSpaceSetupState(
  spaceId: string,
  updates: Partial<SpaceSetupWizardState>,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: existingSpace, error: fetchError } = await supabase
    .from("spaces")
    .select("metadata")
    .eq("id", spaceId)
    .maybeSingle()

  if (fetchError) {
    return { error: fetchError.message }
  }

  if (!existingSpace) {
    return { error: "Space not found" }
  }

  const currentMetadata = (existingSpace?.metadata as Record<string, any> | null) ?? {}
  const currentWizard = (currentMetadata.setupWizard as Record<string, any> | null) ?? {}

  const nextWizard: SpaceSetupWizardState = {
    ...currentWizard,
    ...updates,
  }

  if (updates.completed) {
    nextWizard.completed_at = new Date().toISOString()
  } else if (updates.completed === false && currentWizard.completed_at) {
    nextWizard.completed_at = null
  }

  const nextMetadata = {
    ...currentMetadata,
    setupWizard: nextWizard,
  }

  const { data, error } = await supabase
    .from("spaces")
    .update({ metadata: nextMetadata })
    .eq("id", spaceId)
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data }
}

export async function updateSpaceMemberRole(
  spaceId: string,
  memberUserId: string,
  newRole: SpaceAccessRole
) {
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  if (!isSpaceAccessRole(newRole)) {
    return { error: "Invalid role" }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: currentMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .single()

  if (!currentMembership || !["owner", "admin"].includes(currentMembership.role)) {
    return { error: "You don't have permission to change member roles" }
  }

  const { data: targetMembership } = await supabase
    .from("space_members")
    .select("role, job")
    .eq("space_id", spaceId)
    .eq("user_id", memberUserId)
    .single()

  if (!targetMembership) {
    return { error: "Member not found" }
  }

  if (targetMembership.role === "owner" && newRole !== "owner") {
    const { data: owners } = await supabase
      .from("space_members")
      .select("id")
      .eq("space_id", spaceId)
      .eq("role", "owner")

    if ((owners?.length ?? 0) <= 1) {
      return { error: t("space.settings.members.lastOwner") }
    }
  }

  const nextJob = defaultSpaceJobForRole(newRole)
  if (targetMembership.job === "administrator" && nextJob === "none") {
    const { count } = await supabase
      .from("space_members")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId)
      .eq("job", "administrator")
    if (
      wouldLeaveLastAdministrator({
        currentJob: targetMembership.job,
        nextJob,
        administratorCount: count ?? 0,
      })
    ) {
      return { error: t("guidance.jobs.lastAdministrator") }
    }
  }

  const { error } = await supabase
    .from("space_members")
    .update({ role: newRole, job: nextJob })
    .eq("space_id", spaceId)
    .eq("user_id", memberUserId)

  if (error) {
    console.error("[updateSpaceMemberRole] Error:", error)
    return { error: "Failed to update member role" }
  }

  revalidatePath(`/spaces/${spaceId}`)
  revalidatePath(`/spaces/${spaceId}/settings`)
  return { success: true }
}

export async function getSpaceAccessSettings(spaceId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  try {
    await requireAuthAndPermission("space:invite", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("id", spaceId)
    .single()

  if (spaceError || !space) {
    return { error: "Authority not found" }
  }

  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: members, error: membersError } = await supabase
    .from("space_members")
    .select("*, profiles(*)")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  if (membersError) {
    return { error: membersError.message }
  }

  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  return {
    data: {
      space,
      members: members || [],
      invitations: (invitations || []).filter((invite) => isPendingInvitation(invite)),
      currentUserId: user.id,
      currentRole: membership?.role ?? null,
    },
  }
}

export async function removeSpaceMember(spaceId: string, memberUserId: string) {
  const supabase = await createClient()

  try {
    await requireAuthAndPermission("space:invite", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { data: targetMember, error: memberFetchError } = await supabase
    .from("space_members")
    .select("role, job")
    .eq("space_id", spaceId)
    .eq("user_id", memberUserId)
    .maybeSingle()

  if (memberFetchError) {
    return { error: memberFetchError.message }
  }

  if (!targetMember) {
    return { error: "Member not found" }
  }

  if (targetMember.job === "administrator") {
    const { count } = await supabase
      .from("space_members")
      .select("id", { count: "exact", head: true })
      .eq("space_id", spaceId)
      .eq("job", "administrator")
    if (
      wouldLeaveLastAdministrator({
        currentJob: targetMember.job,
        nextJob: "none",
        administratorCount: count ?? 0,
      })
    ) {
      return { error: "This organisation needs at least one administrator." }
    }
  }

  if (targetMember.role === "owner") {
    const { data: owners } = await supabase
      .from("space_members")
      .select("id")
      .eq("space_id", spaceId)
      .eq("role", "owner")

    if ((owners?.length ?? 0) <= 1) {
      const { t } = await getServerTranslator()
      return { error: t("space.settings.members.lastOwner") }
    }
  }

  const { error: deleteError } = await supabase
    .from("space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", memberUserId)

  if (deleteError) {
    return { error: deleteError.message }
  }

  const { data: workspaceRows } = await supabase
    .from("workspaces")
    .select("id")
    .eq("space_id", spaceId)

  if (workspaceRows && workspaceRows.length > 0) {
    const workspaceIds = workspaceRows.map((workspace) => workspace.id)
    const { error: workspaceRemovalError } = await supabase
      .from("workspace_members")
      .delete()
      .eq("user_id", memberUserId)
      .in("workspace_id", workspaceIds)

    if (workspaceRemovalError) {
      console.error("[Space] Failed to remove workspace memberships when removing space member", workspaceRemovalError)
    }

    workspaceIds.forEach((workspaceId) => revalidatePath(`/workspaces/${workspaceId}`))
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function deleteSpace(spaceId: string) {
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (membership?.role !== "owner") {
    return { error: t("space.settings.danger.onlyOwner") }
  }

  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("metadata")
    .eq("id", spaceId)
    .single()

  if (spaceError || !space) {
    return { error: "Space not found or you don't have access to it" }
  }

  const { parseRetentionPolicy, assertDestructiveAllowed } = await import("@/lib/programme/reliability")
  const hold = assertDestructiveAllowed(parseRetentionPolicy(space.metadata as Record<string, unknown>))
  if (!hold.ok) {
    return { error: hold.reason }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from("spaces").delete().eq("id", spaceId)

  if (error) {
    console.error("[deleteSpace] Error deleting space:", error)
    return { error: error.message || "Failed to delete space. Please try again." }
  }

  revalidatePath("/dashboard")
  return { success: true }
}

export async function getUserSpaces() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Unauthorized" }
  }

  const adminClient = createAdminClient()

  // Query space_members first to get only user's spaces, then join to spaces table
  const { data: memberships, error } = await adminClient
    .from("space_members")
    .select(`
      role,
      space:spaces(*)
    `)
    .eq("user_id", user.id)

  if (error) {
    console.error("[v0] Error fetching spaces:", error.message)
    return { data: [], error: error.message }
  }

  if (!memberships || memberships.length === 0) {
    return { data: [] }
  }

  // Map memberships to spaces with user's role
  const result = memberships
    .filter((m) => m.space) // Filter out any null spaces
    .map((m) => ({
      ...m.space,
      role: m.role,
    }))

  return { data: result }
}
