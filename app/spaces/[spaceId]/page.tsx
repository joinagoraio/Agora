import Link from "next/link"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspacesBySpace } from "@/lib/actions/workspace"
import { getSpaceItems } from "@/lib/actions/space-item"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { SpacePageClient } from "@/components/space-page-client"
import { ArrowLeft } from "lucide-react"
import { getServerTranslator } from "@/lib/i18n/server"

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
  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .single()

  // If user is not a space member, they should not access this space
  // (even if they're a member of a workspace within this space)
  if (!membership) {
    console.error("[SpacePage] User is not a space member, redirecting to dashboard. SpaceId:", spaceId, "User:", user.id)
    redirect("/dashboard")
  }

  // Get workspaces
  const { data: workspaces } = await getWorkspacesBySpace(spaceId)

  const { t } = await getServerTranslator()

  const { data: documents } = await getSpaceItems(spaceId, { item_type: "document" })

  const scopeMetadata = (space.metadata as Record<string, any> | null) ?? {}
  const scopeDetails = (scopeMetadata.scope as Record<string, any> | null) ?? {}
  const userRole = membership.role
  // Members can do everything except access Settings
  const canManage = membership.role === "owner" || membership.role === "admin" || membership.role === "member"
  // Only owner and admin can access Settings
  const canAccessSettings = membership.role === "owner" || membership.role === "admin"

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="flex h-16 items-center justify-between px-4">
          <Button variant="ghost" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-3 w-3" />
              <span className="text-xs font-normal">{t("space.page.backToDashboard")}</span>
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            {membership?.role && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
                {t(`space.common.roles.${membership.role.toLowerCase()}`, membership.role)}
              </span>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 bg-white">
        <SpacePageClient
          spaceId={spaceId}
          spaceName={space.name}
          initialSpaceType={space.space_type}
          initialVisibility={space.visibility}
          initialJurisdiction={space.jurisdiction}
          initialScope={{
            summary: space.description,
            description: (scopeDetails.description as string | undefined) ?? "",
            timeframe: (scopeDetails.timeframe as string | undefined) ?? "",
          }}
          initialDocuments={documents ?? []}
          initialWorkspaces={workspaces ?? []}
          canManage={canManage}
          canAccessSettings={canAccessSettings}
          wizardState={(space.metadata as Record<string, any> | null)?.setupWizard ?? null}
        />
      </main>
    </div>
  )
}
