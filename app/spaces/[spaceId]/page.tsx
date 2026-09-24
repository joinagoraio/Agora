import { Suspense } from "react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspacesBySpace } from "@/lib/actions/workspace"
import { listSpacePublicationIds } from "@/lib/actions/publish"
import { getSpaceItems } from "@/lib/actions/space-item"
import { SpacePageClient } from "@/components/space-page-client"
import { WorkspaceChatWrapper } from "@/components/workspace-chat-wrapper"
import { canManageProgrammeAccess } from "@/lib/programme/membership"
import { listSpaceAgents } from "@/lib/actions/agent"

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

  if (!space.tenant_id) {
    console.error("[SpacePage] Space missing tenant_id:", spaceId)
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
  const workspaceIds = (workspaces || []).map((workspace) => workspace.id)
  const { data: programmeMemberships } =
    workspaceIds.length > 0
      ? await supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", user.id)
          .in("workspace_id", workspaceIds)
      : { data: [] as Array<{ workspace_id: string; role: string }> }
  const programmeRoleById = new Map(
    (programmeMemberships ?? []).map((row) => [row.workspace_id, row.role]),
  )
  const workspacesWithPublication = (workspaces || []).map((workspace) => ({
    ...workspace,
    publicationId: publicationIds?.[workspace.id] ?? null,
    canManageAccess: canManageProgrammeAccess({
      workspaceRole: programmeRoleById.get(workspace.id) ?? null,
      isCreator: workspace.created_by === user.id,
      spaceRole: membership.role,
    }),
  }))

  const { data: documents } = await getSpaceItems(spaceId, { item_type: "document" })

  const scopeMetadata = (space.metadata as Record<string, any> | null) ?? {}
  const scopeDetails = (scopeMetadata.scope as Record<string, any> | null) ?? {}
  // Members can do everything except access Settings
  const canManage = membership.role === "owner" || membership.role === "admin" || membership.role === "member"
  // Only owner and admin can access Settings
  const canAccessSettings = membership.role === "owner" || membership.role === "admin"
  const { data: spaceAgents } = canAccessSettings
    ? await listSpaceAgents(spaceId)
    : { data: [] as Awaited<ReturnType<typeof listSpaceAgents>>["data"] }

  return (
    <Suspense fallback={null}>
      <WorkspaceChatWrapper
        spaceId={spaceId}
        workspaceName={space.name}
        canManage={canManage}
      >
        <SpacePageClient
          spaceId={spaceId}
          tenantId={space.tenant_id}
          spaceName={space.name}
          userRole={membership.role}
          initialSpaceType={space.space_type}
          initialVisibility={space.visibility}
          initialJurisdiction={space.jurisdiction}
          initialWritingLanguage={space.writing_language === "nl" ? "nl" : "en"}
          demoPack={Boolean((space.metadata as { demo?: boolean } | null)?.demo)}
          initialScope={{
            summary: space.description,
            description: (scopeDetails.description as string | undefined) ?? "",
            timeframe: (scopeDetails.timeframe as string | undefined) ?? "",
          }}
          initialDocuments={documents ?? []}
          initialWorkspaces={workspacesWithPublication}
          initialAgents={spaceAgents ?? []}
          canManage={canManage}
          canAccessSettings={canAccessSettings}
          wizardState={(space.metadata as Record<string, any> | null)?.setupWizard ?? null}
          spaceJob={membership.job ?? "none"}
        />
      </WorkspaceChatWrapper>
    </Suspense>
  )
}
