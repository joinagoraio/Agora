import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get workspace details
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single()

  if (workspaceError || !workspace) {
    if (workspaceError) {
      console.error("Error fetching workspace:", {
        message: workspaceError.message || String(workspaceError),
        code: workspaceError.code || "unknown",
        details: workspaceError.details || null,
        hint: workspaceError.hint || null,
        workspaceId,
        error: workspaceError,
      })
    } else {
      console.error("Workspace not found:", workspaceId)
    }
    redirect("/dashboard")
  }

  // Get parent space details
  const { data: space } = await supabase.from("spaces").select("*").eq("id", workspace.space_id).single()

  if (!space) {
    redirect("/dashboard")
  }

  const { data: workspaceMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle()

  const { data: spaceMembership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", workspace.space_id)
    .eq("user_id", user.id)
    .maybeSingle()

  const isWorkspaceAdmin = workspace.created_by === user.id || workspaceMembership?.role === "admin"
  const isSpaceAdmin = spaceMembership && ["owner", "admin"].includes(spaceMembership.role)

  if (!isWorkspaceAdmin && !isSpaceAdmin) {
    redirect(`/workspaces/${workspaceId}`)
  }

  const { data: members } = await supabase
    .from("workspace_members")
    .select("*, profiles(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  const { data: invitations } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  const pendingInvitations = (invitations ?? []).filter((invite) => invite.status === "pending")

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href={`/workspaces/${workspaceId}`}>
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs font-normal">Back to {workspace.name}</span>
              </Link>
            </Button>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{workspace.name} Settings</h1>
          </div>
          <WorkspaceSettings workspace={workspace} space={space} members={members || []} invitations={pendingInvitations} />
        </div>
      </main>
    </div>
  )
}
