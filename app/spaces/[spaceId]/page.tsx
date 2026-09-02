import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspacesBySpace } from "@/lib/actions/workspace"
import { listSpacePublicationIds } from "@/lib/actions/publish"
import { getSpaceItems } from "@/lib/actions/space-item"
import { SpacePageClient } from "@/components/space-page-client"
import { isSpaceHelpAiDisabled, resolveHelpAiEnabled } from "@/lib/guidance/help-flag"

export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get space details
  const { data: space, error: spaceError } = await supabase.from("spaces").select("*").eq("id", spaceId).single()

  if (spaceError) {
    console.error("[SpacePage] Error fetching space:", spaceError.message, spaceError)
  }

  if (!space) {
    console.error("[SpacePage] Space not found, redirecting to dashboard. SpaceId:", spaceId, "User:", user.id)
    redirect("/dashboard")
  }

  // Get user's role in this space
  const { data: membership, error: membershipError } = await supabase
    .from("space_members")
    .select("role, job")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (membershipError) {
    console.error("[SpacePage] Error fetching membership:", membershipError.message, membershipError)
  }

  // If user is not a space member, they should not access this space
  // (even if they're a member of a workspace within this space)
  if (!membership) {
    console.error("[SpacePage] User is not a space member, redirecting to dashboard. SpaceId:", spaceId, "User:", user.id)
    redirect("/dashboard")
  }

  // Get workspaces
  const { data: workspaces } = await getWorkspacesBySpace(spaceId)
  const { data: publicationIds } = await listSpacePublicationIds(spaceId)
  const workspacesWithPublication = (workspaces || []).map((workspace) => ({
    ...workspace,
    publicationId: publicationIds?.[workspace.id] ?? null,
  }))

  const { data: documents } = await getSpaceItems(spaceId, { item_type: "document" })
  const { data: profile } = await supabase
    .from("profiles")
    .select("guidance_mode, expert_prompt_dismissed_at")
    .eq("id", user.id)
    .maybeSingle()

  const scopeMetadata = (space.metadata as Record<string, any> | null) ?? {}
  const scopeDetails = (scopeMetadata.scope as Record<string, any> | null) ?? {}
  // Members can do everything except access Settings
  const canManage = membership.role === "owner" || membership.role === "admin" || membership.role === "member"
  // Only owner and admin can access Settings
  const canAccessSettings = membership.role === "owner" || membership.role === "admin"

  return (
    <SpacePageClient
      spaceId={spaceId}
      spaceName={space.name}
      userRole={membership.role}
      initialSpaceType={space.space_type}
      initialVisibility={space.visibility}
      initialJurisdiction={space.jurisdiction}
      initialScope={{
        summary: space.description,
        description: (scopeDetails.description as string | undefined) ?? "",
        timeframe: (scopeDetails.timeframe as string | undefined) ?? "",
      }}
      initialDocuments={documents ?? []}
      initialWorkspaces={workspacesWithPublication}
      canManage={canManage}
      canAccessSettings={canAccessSettings}
      wizardState={(space.metadata as Record<string, any> | null)?.setupWizard ?? null}
      spaceJob={membership.job ?? "none"}
      guidanceMode={profile?.guidance_mode === "expert" ? "expert" : "guided"}
      helpAiEnabled={resolveHelpAiEnabled({
        spaceHelpAiDisabled: isSpaceHelpAiDisabled(space.metadata),
      })}
    />
  )
}
