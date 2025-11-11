import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SpaceSettings } from "@/components/space-settings"
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/spaces/${spaceId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">Settings</h1>
              <p className="text-xs text-muted-foreground">{space.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-muted/20">
        <div className="container max-w-4xl py-8 px-4">
          <SpaceSettings space={space} members={members || []} invitations={invitations || []} />
        </div>
      </main>
    </div>
  )
}
