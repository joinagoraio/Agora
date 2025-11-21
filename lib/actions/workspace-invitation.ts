"use server"

import { randomBytes } from "node:crypto"

import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"
import { sendWorkspaceInvitationEmail } from "@/lib/services/email"
import { revalidatePath } from "next/cache"

type WorkspaceRole = "admin" | "member" | "viewer"

async function getWorkspaceDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
) {
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, space_id, created_by")
    .eq("id", workspaceId)
    .single()

  return workspace
}

export async function inviteUserToWorkspace(
  workspaceId: string,
  email: string,
  role: WorkspaceRole = "member",
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const workspace = await getWorkspaceDetails(supabase, workspaceId)
  if (!workspace) {
    return { error: "Workspace not found" }
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspaceId,
      email,
      role,
      token,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteLink = `${appUrl}/workspace-invite/${token}`
  const spaceName = null

  // Get inviter's name from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single()
  
  const inviterName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null

  const emailResult = await sendWorkspaceInvitationEmail({
    to: email,
    inviteLink,
    workspaceName: workspace.name,
    spaceName,
    invitedByName: inviterName,
    invitedByEmail: user.email,
  })

  if (emailResult?.error) {
    console.error("Workspace invitation email failed to send", emailResult.error)
  }

  return { data, inviteLink }
}

export async function resendWorkspaceInvitation(invitationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from("workspace_invitations")
    .select("*, workspaces(name)")
    .eq("id", invitationId)
    .single()

  if (fetchError || !invitation) {
    return { error: "Invitation not found" }
  }

  if (invitation.status !== "pending") {
    return { error: "Only pending invitations can be resent" }
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { error: updateError } = await supabase
    .from("workspace_invitations")
    .update({
      token,
      expires_at: expiresAt.toISOString(),
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId)

  if (updateError) {
    return { error: updateError.message }
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteLink = `${appUrl}/workspace-invite/${token}`

  const spaceName = null
  const workspaceName = invitation.workspaces?.name ?? "your workspace"

  // Get inviter's name from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single()
  
  const inviterName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null

  const emailResult = await sendWorkspaceInvitationEmail({
    to: invitation.email,
    inviteLink,
    workspaceName,
    spaceName,
    invitedByName: inviterName,
    invitedByEmail: user.email,
  })

  if (emailResult?.error) {
    console.error("Workspace invitation email failed to resend", emailResult.error)
  }

  return { inviteLink }
}

export async function revokeWorkspaceInvitation(invitationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from("workspace_invitations")
    .select("status")
    .eq("id", invitationId)
    .single()

  if (fetchError || !invitation) {
    return { error: "Invitation not found" }
  }

  if (invitation.status !== "pending") {
    return { error: "Only pending invitations can be revoked" }
  }

  const { error } = await supabase
    .from("workspace_invitations")
    .update({ status: "declined" })
    .eq("id", invitationId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function acceptWorkspaceInvitation(token: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be logged in to accept invitations" }
  }

  const { data: invitation, error: inviteError } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single()

  if (inviteError || !invitation) {
    return { error: "Invalid or expired invitation" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase.from("workspace_invitations").update({ status: "expired" }).eq("id", invitation.id)
    return { error: "Invitation has expired" }
  }

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

  if (profile?.email !== invitation.email) {
    return {
      error: "This invitation was sent to a different email address. Please sign in with the invited email.",
    }
  }

  const { error: memberError } = await supabase
    .from("workspace_members")
    .upsert(
      {
        workspace_id: invitation.workspace_id,
        user_id: user.id,
        role: invitation.role,
      },
      { onConflict: "workspace_id,user_id" },
    )

  if (memberError) {
    console.error("[acceptWorkspaceInvitation] Error adding member:", memberError)
    return { error: memberError.message }
  }

  // Update invitation status to accepted
  const { error: updateError } = await supabase
    .from("workspace_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id)

  if (updateError) {
    console.error("[acceptWorkspaceInvitation] Error updating invitation status:", updateError)
    // Don't fail here - user is already added to workspace
  }

  // Revalidate workspace settings page to show new member
  revalidatePath(`/workspaces/${invitation.workspace_id}/settings`)
  revalidatePath(`/workspaces/${invitation.workspace_id}`)
  revalidatePath("/dashboard")

  return { success: true, workspaceId: invitation.workspace_id }
}

