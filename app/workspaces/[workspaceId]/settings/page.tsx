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
  // Space owner, admin, AND members can access workspace Settings
  const isSpaceAdminOrMember = spaceMembership && ["owner", "admin", "member"].includes(spaceMembership.role)

  if (!isWorkspaceAdmin && !isSpaceAdminOrMember) {
    redirect(`/workspaces/${workspaceId}`)
  }

  // Fetch direct workspace members
  const { data: workspaceMembers, error: workspaceMembersError } = await supabase
    .from("workspace_members")
    .select("*, profiles(*)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (workspaceMembersError) {
    console.error("[WorkspaceSettings] Error fetching workspace members:", workspaceMembersError)
  }

  // Fetch space members (who have automatic access to all workspaces)
  const { data: spaceMembers, error: spaceMembersError } = await supabase
    .from("space_members")
    .select("*, profiles(*)")
    .eq("space_id", workspace.space_id)
    .order("created_at", { ascending: false })

  if (spaceMembersError) {
    console.error("[WorkspaceSettings] Error fetching space members:", spaceMembersError)
  }

  // Debug: Check if profiles are being fetched
  console.log("[WorkspaceSettings] Workspace members with profiles:", JSON.stringify(workspaceMembers, null, 2))

  // Merge and deduplicate: space members get priority (their space role is what matters)
  const memberMap = new Map()
  
  // Add all space members (including viewers for transparency)
  for (const spaceMember of spaceMembers ?? []) {
    memberMap.set(spaceMember.user_id, {
      ...spaceMember,
      source: "space" as const,
      workspace_role: null, // They have access via space
    })
  }
  
  // Add or update with workspace members
  for (const workspaceMember of workspaceMembers ?? []) {
    const existing = memberMap.get(workspaceMember.user_id)
    if (existing) {
      // User is both space member and workspace member - show workspace role too
      existing.workspace_role = workspaceMember.role
    } else {
      // Direct workspace member only
      memberMap.set(workspaceMember.user_id, {
        ...workspaceMember,
        source: "workspace" as const,
        workspace_role: workspaceMember.role,
      })
    }
  }
  
  const members = Array.from(memberMap.values())

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
          <WorkspaceSettings
            workspace={workspace}
            space={space}
            members={members || []}
            invitations={pendingInvitations}
            currentUserId={user.id}
          />
        </div>
      </main>
    </div>
  )
}
