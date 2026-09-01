import Link from "next/link"
import { redirect } from "next/navigation"
import { Layers2, FolderKanban } from "lucide-react"

import { CreateSpaceDialog } from "@/components/create-space-dialog"
import { UserMenu } from "@/components/user-menu"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getUserSpaces } from "@/lib/actions/space"
import { createClient } from "@/lib/supabase/server"
import { WelcomeUserDialog } from "@/components/welcome-user-dialog"
import { ProfileSetupDialog } from "@/components/profile-setup-dialog"
import { getServerTranslator } from "@/lib/i18n/server"
import { isEnvironmentalProgrammeWorkspace, workspaceHomeHref } from "@/lib/programme/domain"
import { getOwnProfile } from "@/lib/actions/profile"
import { isPlaceholderProfileName } from "@/lib/profile/display-name"
import { DashboardGreeting } from "@/components/dashboard-greeting"

export default async function DashboardPage() {
  const { t } = await getServerTranslator()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: spaces } = await getUserSpaces()
  
  // Get user's space memberships to filter out workspaces where user is also a space member
  const { data: spaceMemberships } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", user.id)
  
  const userSpaceIds = new Set(spaceMemberships?.map(sm => sm.space_id) ?? [])

  const { data: spaceProgrammes } =
    userSpaceIds.size > 0
      ? await supabase
          .from("workspaces")
          .select("id, name, description, space_id, kind, metadata")
          .in("space_id", [...userSpaceIds])
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
    if (workspace && typeof workspace === "object" && "id" in workspace && isEnvironmentalProgrammeWorkspace(workspace)) {
      programmeById.set(String((workspace as { id: string }).id), workspace as { id: string; name: string; description?: string | null; space_id: string; kind?: string | null; metadata?: unknown })
    }
  }
  const myProgrammes = [...programmeById.values()]
  
  const hasSpaces = Boolean(spaces && spaces.length > 0)
  const hasProgrammes = myProgrammes.length > 0
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

  const welcomeCopy =
    hasProgrammes || hasSpaces ? t("dashboard.welcome.prompt") : t("dashboard.welcome.empty")

  return (
    <div className="flex min-h-screen flex-col">
      {!showProfileSetup && (
        <WelcomeUserDialog userId={user.id} userName={displayName} hasSpaces={hasSpaces} hasWorkspaces={hasProgrammes} />
      )}
      <ProfileSetupDialog
        open={showProfileSetup}
        initialName={setupName}
        email={user.email ?? null}
        avatarUrl={ownProfile?.avatarUrl ?? null}
      />
      <header className="bg-card">
        <div className="flex h-16 items-center justify-end px-4">
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto py-8 px-8">
          <div className="mb-10 max-w-2xl">
            <DashboardGreeting name={displayName} />
            <p className="mt-2 text-muted-foreground">{welcomeCopy}</p>
          </div>

          <div className="mb-12">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold">{t("dashboard.workspaces.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("dashboard.workspaces.subtitle")}</p>
            </div>
            {hasProgrammes ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {myProgrammes.map((workspace) => (
                  <Link key={workspace.id} href={workspaceHomeHref(workspace)}>
                    <Card className="transition-all hover:shadow-md">
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <FolderKanban className="h-5 w-5 text-primary" />
                          <CardTitle className="mt-0">{workspace.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {workspace.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{workspace.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">{t("dashboard.workspaces.emptyTitle")}</h3>
                  <p className="max-w-md text-center text-sm text-muted-foreground">
                    {t("dashboard.workspaces.emptyDescription")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-1.5">
              <h2 className="text-2xl font-semibold">{t("dashboard.spaces.title")}</h2>
              <CreateSpaceDialog variant="icon" />
            </div>
            <p className="text-sm text-muted-foreground">{t("dashboard.spaces.subtitle")}</p>
          </div>

          {spaces && spaces.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((space: any) => (
                <Link key={space.id} href={`/spaces/${space.id}`}>
                  <Card className="transition-all hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Layers2 className="h-5 w-5 text-primary" />
                          <div>
                            <CardTitle className="mt-0">{space.name}</CardTitle>
                          </div>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          {translateRole(space.role)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {space.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {space.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers2 className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">{t("dashboard.spaces.emptyTitle")}</h3>
                <p className="text-center text-sm text-muted-foreground">
                  {t("dashboard.spaces.emptyDescription")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
