"use server"

import { randomBytes } from "node:crypto"

import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"
import { workspaceJobFromInvite } from "@/lib/guidance/jobs"
import { canManageProgrammeAccess, resolveProgrammeInvite } from "@/lib/programme/membership"
import { sendWorkspaceInvitationEmail } from "@/lib/services/email"
import { revalidatePath } from "next/cache"

type WorkspaceRole = "admin" | "member" | "viewer"

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

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
  job?: string | null,
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

  const [{ data: workspaceMembership }, { data: spaceMembership }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("space_members")
      .select("role")
      .eq("space_id", workspace.space_id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (
    !canManageProgrammeAccess({
      workspaceRole: workspaceMembership?.role ?? null,
      isCreator: workspace.created_by === user.id,
      spaceRole: spaceMembership?.role ?? null,
    })
  ) {
    return { error: "Unauthorized" }
  }

  const normalizedEmail = normalizeEmail(email)

  const { data: existingMemberRows } = await supabase
    .from("workspace_members")
    .select("user_id, profiles(email)")
    .eq("workspace_id", workspaceId)

  const alreadyOnProgramme = (existingMemberRows ?? []).some((row) => {
    const profile = row.profiles as { email?: string } | { email?: string }[] | null
    const memberEmail = Array.isArray(profile) ? profile[0]?.email : profile?.email
    return normalizeEmail(memberEmail || "") === normalizedEmail
  })

  const { data: pendingInvite } = await supabase
    .from("workspace_invitations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .ilike("email", normalizedEmail)
    .maybeSingle()

  const { data: inviteeProfile } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", normalizedEmail)
    .maybeSingle()

  const { data: authorityMembership } = inviteeProfile
    ? await supabase
        .from("space_members")
        .select("user_id")
        .eq("space_id", workspace.space_id)
        .eq("user_id", inviteeProfile.id)
        .maybeSingle()
    : { data: null }

  const invite = resolveProgrammeInvite({
    alreadyOnProgramme,
    alreadyPending: Boolean(pendingInvite),
    inviteeIsAuthorityMember: Boolean(authorityMembership),
  })
  if ("error" in invite) {
    return {
      error:
        invite.error === "already_member"
          ? "That person is already on this programme."
          : "That person already has a pending invitation.",
    }
  }

  const inApp = invite.channel === "in_app"

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      role,
      job: workspaceJobFromInvite(job),
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

  if (!inApp) {
    const emailResult = await sendWorkspaceInvitationEmail({
      to: normalizedEmail,
      inviteLink,
      workspaceName: workspace.name,
      spaceName,
      invitedByName: inviterName,
      invitedByEmail: user.email,
    })

    if (emailResult?.error) {
      console.error("Workspace invitation email failed to send", emailResult.error)
    }
  }

  revalidatePath(`/workspaces/${workspaceId}/settings`)
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  revalidatePath("/dashboard")
  return { data, inviteLink, channel: inApp ? "in_app" : "email" }
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
  const workspaceId = invitation.workspace_id as string
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("space_id")
    .eq("id", workspaceId)
    .maybeSingle()

  const { data: inviteeProfile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizeEmail(invitation.email || ""))
    .maybeSingle()

  const { data: authorityMembership } =
    inviteeProfile && workspace?.space_id
      ? await supabase
          .from("space_members")
          .select("user_id")
          .eq("space_id", workspace.space_id)
          .eq("user_id", inviteeProfile.id)
          .maybeSingle()
      : { data: null }

  if (authorityMembership) {
    revalidatePath(`/workspaces/${workspaceId}/settings`)
    revalidatePath(`/workspaces/${workspaceId}/programme`)
    return { inviteLink, channel: "in_app" as const }
  }

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

  return { inviteLink, channel: "email" as const }
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

  if (normalizeEmail(profile?.email || "") !== normalizeEmail(invitation.email || "")) {
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
        job: workspaceJobFromInvite(invitation.job),
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

export async function listMyPendingProgrammeInvites() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [] as Array<{
      id: string
      programmeName: string
      authorityName: string | null
      invitedByName: string | null
    }>, error: "Unauthorized" }
  }

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle()
  const email = normalizeEmail(profile?.email || user.email || "")
  if (!email) return { data: [] }

  const { data: invitations, error } = await supabase
    .from("workspace_invitations")
    .select("id, email, status, expires_at, invited_by, workspaces(name, space_id)")
    .eq("status", "pending")
    .ilike("email", email)

  if (error) {
    return { data: [], error: error.message }
  }

  const now = Date.now()
  const mine = (invitations ?? []).filter((row) => {
    if (row.expires_at && new Date(row.expires_at).getTime() < now) return false
    return true
  })

  const spaceIds = [
    ...new Set(
      mine
        .map((row) => {
          const workspace = row.workspaces as { name?: string; space_id?: string } | { name?: string; space_id?: string }[] | null
          const workspaceRow = Array.isArray(workspace) ? workspace[0] : workspace
          return workspaceRow?.space_id
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const inviterIds = [...new Set(mine.map((row) => row.invited_by).filter((id): id is string => Boolean(id)))]

  const [{ data: spaces }, { data: inviters }] = await Promise.all([
    spaceIds.length > 0
      ? supabase.from("spaces").select("id, name").in("id", spaceIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    inviterIds.length > 0
      ? supabase.from("profiles").select("id, full_name, email").in("id", inviterIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name?: string | null; email?: string | null }> }),
  ])

  const spaceNameById = new Map((spaces ?? []).map((row) => [row.id, row.name]))
  const inviterById = new Map((inviters ?? []).map((row) => [row.id, row.full_name || row.email || null]))

  return {
    data: mine.map((row) => {
      const workspace = row.workspaces as { name?: string; space_id?: string } | { name?: string; space_id?: string }[] | null
      const workspaceRow = Array.isArray(workspace) ? workspace[0] : workspace
      return {
        id: row.id as string,
        programmeName: workspaceRow?.name || "Programme",
        authorityName: (workspaceRow?.space_id && spaceNameById.get(workspaceRow.space_id)) || null,
        invitedByName: (row.invited_by && inviterById.get(row.invited_by)) || null,
      }
    }),
  }
}

export async function respondToProgrammeInvitation(invitationId: string, action: "accept" | "decline") {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle()
  const email = normalizeEmail(profile?.email || user.email || "")

  const { data: invitation, error: inviteError } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("status", "pending")
    .single()

  if (inviteError || !invitation) {
    return { error: "Invitation not found" }
  }

  if (normalizeEmail(invitation.email || "") !== email) {
    return { error: "This invitation was sent to a different account." }
  }

  if (action === "decline") {
    const { error } = await supabase
      .from("workspace_invitations")
      .update({ status: "declined" })
      .eq("id", invitationId)
    if (error) return { error: error.message }
    revalidatePath("/dashboard")
    return { success: true, accepted: false }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase.from("workspace_invitations").update({ status: "expired" }).eq("id", invitation.id)
    return { error: "Invitation has expired" }
  }

  const { error: memberError } = await supabase.from("workspace_members").upsert(
    {
      workspace_id: invitation.workspace_id,
      user_id: user.id,
      role: invitation.role,
      job: workspaceJobFromInvite(invitation.job),
    },
    { onConflict: "workspace_id,user_id" },
  )
  if (memberError) return { error: memberError.message }

  await supabase
    .from("workspace_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id)

  revalidatePath(`/workspaces/${invitation.workspace_id}/settings`)
  revalidatePath(`/workspaces/${invitation.workspace_id}`)
  revalidatePath(`/workspaces/${invitation.workspace_id}/programme`)
  revalidatePath("/dashboard")
  return { success: true, accepted: true, workspaceId: invitation.workspace_id }
}


