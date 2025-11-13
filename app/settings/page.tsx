import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { UserMenu } from "@/components/user-menu"
import { OrganizationSettings } from "@/components/organization-settings"

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get user's primary space (tenant)
  const { data: members } = await supabase
    .from("space_members")
    .select("space_id, role, spaces(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)

  const space = members?.[0]?.spaces

  if (!space) {
    redirect("/dashboard")
  }

  // Check if user has permission to manage settings
  const member = members?.[0]
  if (!member || !["owner", "admin", "tenant_admin", "org_manager"].includes(member.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Organization Settings</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <OrganizationSettings space={space} />
        </div>
      </main>
    </div>
  )
}
