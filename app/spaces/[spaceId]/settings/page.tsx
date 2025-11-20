import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SpaceSettings } from "@/components/space-settings"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function SpaceSettingsPage({
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
  const { data: members } = await supabase
    .from("space_members")
    .select("*, profiles(*)")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  // Get invitations
  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })

  const pendingInvitations = (invitations ?? []).filter(
    (invite) => !Object.prototype.hasOwnProperty.call(invite, "status") || invite.status === "pending",
  )

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href={`/spaces/${spaceId}`}>
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs font-normal">Back to {space.name}</span>
              </Link>
            </Button>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{space.name} Settings</h1>
          </div>
          <SpaceSettings space={space} members={members || []} invitations={pendingInvitations} />
        </div>
      </main>
    </div>
  )
}
