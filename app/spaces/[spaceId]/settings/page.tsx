import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SpaceSettings } from "@/components/space-settings"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getServerTranslator } from "@/lib/i18n/server"

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SpaceSettingsPage({
  params,
}: {
  params: Promise<{ spaceId: string }>
}) {
  const { spaceId } = await params
  const supabase = await createClient()
  const { t } = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get space details
  const { data: space } = await supabase.from("spaces").select("*").eq("id", spaceId).single()

  if (!space) {
    redirect("/dashboard")
  }

  // Check if user is admin/owner
  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .single()

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    redirect(`/spaces/${spaceId}`)
  }

  // Get members
  const { data: members, error: membersError } = await supabase
    .from("space_members")
    .select("*, profiles(*)")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  if (membersError) {
    console.error('[SpaceSettings] Error fetching members:', membersError)
  } else {
    console.log('[SpaceSettings] Fetched members:', members?.length, 'members')
  }

  // Get pending invitations only (those not yet accepted)
  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("space_id", spaceId)
    .is("accepted_at", null)  // Only get invitations that haven't been accepted
    .order("created_at", { ascending: false })

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="sticky top-0 z-40 shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="flex h-16 items-center justify-between px-4">
          <Button variant="ghost" asChild>
            <Link href={`/spaces/${spaceId}`}>
              <ArrowLeft className="mr-2 h-3 w-3" />
              <span className="text-xs font-normal">
                {t("space.settings.back", undefined, { name: space.name })}
              </span>
            </Link>
          </Button>
          <UserMenu />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden bg-white">
        <div className="container mx-auto flex h-full min-h-0 flex-col px-8 pt-8 pb-6">
          <h2 className="mb-6 shrink-0 text-2xl font-semibold text-foreground">
            {t("space.settings.pageTitle", undefined, { name: space.name })}
          </h2>
          <SpaceSettings
            space={space}
            members={members || []}
            invitations={invitations || []}
            currentUserId={user.id}
          />
        </div>
      </main>
    </div>
  )
}
