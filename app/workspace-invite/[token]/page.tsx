import { createClient } from "@/lib/supabase/server"
import WorkspaceInvitePageClient from "./workspace-invite-page-client"

export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get invitation details (RLS policy allows public viewing by token)
  const { data: invitation, error } = await supabase
    .from("workspace_invitations")
    .select(`
      id, 
      email, 
      role, 
      status,
      expires_at,
      workspace_id,
      workspaces (
        id,
        name
      )
    `)
    .eq("token", token)
    .single()

  // If invitation exists but workspace info is missing (due to RLS), fetch it separately
  if (invitation && !invitation.workspaces) {
    const { data: workspaceData } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", invitation.workspace_id)
      .single()

    if (workspaceData) {
      invitation.workspaces = [workspaceData]
    }
  }

  // Log for debugging
  if (error) {
    console.error("[Workspace Invite] Error fetching invitation:", error)
  } else {
    const workspaceName = Array.isArray(invitation?.workspaces)
      ? invitation?.workspaces[0]?.name
      : (invitation?.workspaces as any)?.name
    console.log("[Workspace Invite] Invitation found:", {
      id: invitation?.id,
      email: invitation?.email,
      workspaceName,
      hasWorkspace: !!invitation?.workspaces,
    })
  }

  return <WorkspaceInvitePageClient token={token} invitation={invitation} user={user} error={error} />
}

