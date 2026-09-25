import { redirect } from "next/navigation"
import { Layers2, FolderKanban } from "lucide-react"

import { CreateSpaceDialog } from "@/components/create-space-dialog"
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog"
import { DashboardBoard } from "@/components/dashboard-board"
import { DashboardMetrics } from "@/components/dashboard-metrics"
import { ProgrammeInviteInbox } from "@/components/programme-invite-inbox"
import { UserMenu } from "@/components/user-menu"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { getUserSpaces } from "@/lib/actions/space"
import { isHiddenDemoSpace } from "@/lib/demo/hidden"
import { listDashboardPins } from "@/lib/actions/dashboard-pins"
import { createClient } from "@/lib/supabase/server"
import { WelcomeUserDialog } from "@/components/welcome-user-dialog"
import { ProfileSetupDialog } from "@/components/profile-setup-dialog"
import { getServerTranslator } from "@/lib/i18n/server"
import { isEnvironmentalProgrammeWorkspace, workspaceHomeHref } from "@/lib/programme/domain"
import { getOwnProfile } from "@/lib/actions/profile"
import { getPrimaryTenantForUser } from "@/lib/actions/tenant"
import { listMyPendingProgrammeInvites } from "@/lib/actions/workspace-invitation"
import { isPlaceholderProfileName } from "@/lib/profile/display-name"
import { DashboardGreeting } from "@/components/dashboard-greeting"
import { canManageWorkspaces, type Role } from "@/lib/rbac/permissions"
import { isTenantAdminRole } from "@/lib/tenant/domain"

export default async function DashboardPage() {
  const { t } = await getServerTranslator()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: allSpaces } = await getUserSpaces()
  const spaceRows = (allSpaces ?? []) as unknown as Array<{ id: string; metadata?: unknown }>
  const hiddenSpaceIds = new Set(spaceRows.filter((space) => isHiddenDemoSpace(space.metadata)).map((space) => space.id))
  const authorities = spaceRows.filter((space) => !hiddenSpaceIds.has(space.id)) as unknown as Array<{
    id: string
    name: string
    description?: string | null
    role?: string | null
  }>
  
  // Get user's space memberships to filter out workspaces where user is also a space member
  const { data: spaceMemberships } = await supabase
    .from("space_members")
    .select("space_id, role")
    .eq("user_id", user.id)
  
  const userSpaceIds = new Set(spaceMemberships?.map(sm => sm.space_id) ?? [])
  const adminSpaceIds = [...new Set((spaceMemberships ?? [])
    .filter((row) => !hiddenSpaceIds.has(row.space_id))
    .filter((row) => row.role === "owner" || row.role === "admin")
    .map((row) => row.space_id))]

  const { data: spaceProgrammes } =
    adminSpaceIds.length > 0
      ? await supabase
          .from("workspaces")
          .select("id, name, description, space_id, kind, metadata")
          .in("space_id", adminSpaceIds)
          .eq("kind", "environmental_programme")
          .order("updated_at", { ascending: false })
      : { data: [] as Array<{ id: string; name: string; description?: string | null; space_id: string; kind?: string | null; metadata?: unknown }> }

  const programmeById = new Map((spaceProgrammes ?? []).map((row) => [row.id, row]))
  
  // Fetch workspaces where user is a direct member
  const { data: allWorkspaceMemberships, error: workspaceError } = await supabase
    .from("workspace_members")
    .select(`
      role,
      workspace:workspaces(
        id,
        name,
        description,
        space_id,
        kind,
        metadata
      )
    `)
    .eq("user_id", user.id)
  
  if (workspaceError) {
    console.error("[Dashboard] Error fetching workspace memberships:", workspaceError)
  }

  for (const membership of allWorkspaceMemberships ?? []) {
    const raw = (membership as { workspace?: unknown }).workspace
    const workspace = Array.isArray(raw) ? raw[0] : raw
    if (
      workspace &&
      typeof workspace === "object" &&
      "id" in workspace &&
      isEnvironmentalProgrammeWorkspace(workspace) &&
      !hiddenSpaceIds.has(String((workspace as { space_id?: string }).space_id))
    ) {
      programmeById.set(String((workspace as { id: string }).id), workspace as { id: string; name: string; description?: string | null; space_id: string; kind?: string | null; metadata?: unknown })
    }
  }
  const myProgrammes = [...programmeById.values()]

  const hasSpaces = authorities.length > 0
  const hasProgrammes = myProgrammes.length > 0
  const creatableAuthorities = authorities
    .filter((space) => Boolean(space.role && canManageWorkspaces(space.role as Role)))
    .map((space) => ({ id: space.id, name: space.name }))
  const { data: ownProfile } = await getOwnProfile()
  const displayName =
    ownProfile?.fullName ||
    (user.user_metadata as Record<string, any> | null | undefined)?.full_name ||
    (user.user_metadata as Record<string, any> | null | undefined)?.name ||
    user.email?.split("@")[0] ||
    null
  const showProfileSetup = ownProfile
    ? !ownProfile.setupDismissed
    : isPlaceholderProfileName(displayName, user.email)
  const setupName = isPlaceholderProfileName(ownProfile?.fullName ?? displayName, user.email)
    ? ""
    : ownProfile?.fullName || displayName || ""

  const translateRole = (role?: string | null) => {
    if (!role) {
      return ""
    }
    const normalized = role.toLowerCase()
    return t(`space.common.roles.${normalized}`, role)
  }

  const spaceIds = authorities.map((space) => space.id)
  const [{ data: pins }, agentCountResult, pendingInvitesResult, tenantMembership] = await Promise.all([
    listDashboardPins(),
    spaceIds.length > 0
      ? supabase.from("agents").select("id", { count: "exact", head: true }).in("space_id", spaceIds)
      : Promise.resolve({ count: 0 }),
    listMyPendingProgrammeInvites(),
    getPrimaryTenantForUser(),
  ])
  const agentCount = agentCountResult.count ?? 0
  const canManageModels = isTenantAdminRole(tenantMembership.data?.role)
  const showMetrics = hasSpaces || hasProgrammes || agentCount > 0 || canManageModels

  const welcomeCopy =
    hasProgrammes || hasSpaces ? t("dashboard.welcome.prompt") : t("dashboard.welcome.empty")

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {!showProfileSetup && (
        <WelcomeUserDialog userId={user.id} userName={displayName} hasSpaces={hasSpaces} hasWorkspaces={hasProgrammes} />
      )}
      <ProfileSetupDialog
        open={showProfileSetup}
        initialName={setupName}
        email={user.email ?? null}
        avatarUrl={ownProfile?.avatarUrl ?? null}
      />
      <header className="shrink-0 bg-card">
        <div className="flex h-16 items-center justify-end px-4">
          <UserMenu />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-8 pt-8 pb-6">
          <div className="mb-6 max-w-2xl shrink-0">
            <DashboardGreeting name={displayName} />
            <p className="mt-2 text-muted-foreground">{welcomeCopy}</p>
          </div>

          <ProgrammeInviteInbox invites={pendingInvitesResult.data ?? []} />

          {showMetrics ? (
            <>
              <DashboardMetrics
                authorities={authorities.length}
                programmes={myProgrammes.length}
                agents={agentCount}
                tenantId={tenantMembership.data?.tenantId}
                canManageModels={canManageModels}
                userId={user.id}
                holdNotice={showProfileSetup}
              />
              <Separator className="my-8 shrink-0 bg-border" />
            </>
          ) : null}

          <DashboardBoard
            initialPins={pins ?? []}
            programmeHeader={
              creatableAuthorities.length > 0 ? (
                <CreateWorkspaceDialog spaces={creatableAuthorities} />
              ) : null
            }
            authorityHeader={<CreateSpaceDialog />}
            programmes={myProgrammes.map((workspace) => ({
              id: workspace.id,
              href: workspaceHomeHref({
                id: workspace.id,
                kind: workspace.kind,
                metadata:
                  workspace.metadata && typeof workspace.metadata === "object"
                    ? (workspace.metadata as Record<string, unknown>)
                    : null,
              }),
              title: workspace.name,
              description: workspace.description,
              kind: "programme" as const,
            }))}
            authorities={authorities.map((space) => ({
              id: space.id,
              href: `/spaces/${space.id}`,
              title: space.name,
              description: space.description,
              badge: translateRole(space.role),
              kind: "authority" as const,
            }))}
            programmeEmpty={
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">{t("dashboard.workspaces.emptyTitle")}</h3>
                  <p className="max-w-md text-center text-sm text-muted-foreground">
                    {hasSpaces
                      ? t("dashboard.workspaces.emptyDescription")
                      : t("dashboard.workspaces.emptyNeedsAuthority")}
                  </p>
                </CardContent>
              </Card>
            }
            authorityEmpty={
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Layers2 className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">{t("dashboard.spaces.emptyTitle")}</h3>
                  <p className="text-center text-sm text-muted-foreground">
                    {t("dashboard.spaces.emptyDescription")}
                  </p>
                </CardContent>
              </Card>
            }
          />
        </div>
      </main>
    </div>
  )
}
