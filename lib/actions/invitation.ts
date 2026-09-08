"use server"

import { randomBytes } from "node:crypto"

import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"
import { spaceJobFromInvite } from "@/lib/guidance/jobs"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { isPendingInvitation, resolveSpaceInvite } from "@/lib/programme/membership"
import { sendSpaceInvitationEmail } from "@/lib/services/email"
import { revalidatePath } from "next/cache"

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

async function requireSpaceInvitePermission(spaceId: string) {
  try {
    await requireAuthAndPermission("space:invite", { spaceId })
    return null
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
}

export async function inviteUserToSpace(
  spaceId: string,
  email: string,
  role: "owner" | "admin" | "member" | "viewer" = "member",
  job?: string | null,
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const permissionError = await requireSpaceInvitePermission(spaceId)
  if (permissionError) return permissionError

  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return { error: "Email is required" }
  }

  const { data: inviteeProfile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle()

  const { data: existingMembership } = inviteeProfile
    ? await supabase
        .from("space_members")
        .select("user_id")
        .eq("space_id", spaceId)
        .eq("user_id", inviteeProfile.id)
        .maybeSingle()
    : { data: null }

  const { data: existingInvites } = await supabase
    .from("invitations")
    .select("id, status")
    .eq("space_id", spaceId)
    .ilike("email", normalizedEmail)

  const invite = resolveSpaceInvite({
    alreadyMember: Boolean(existingMembership),
    alreadyPending: (existingInvites ?? []).some((row) => isPendingInvitation(row)),
  })
  if ("error" in invite) {
    return {
      error:
        invite.error === "already_member"
          ? "That person is already a member of this authority."
          : "That person already has a pending invitation.",
    }
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      space_id: spaceId,
      email: normalizedEmail,
      role,
      job: spaceJobFromInvite(role, job),
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
  const inviteLink = `${appUrl}/invite/${token}`
  const spaceName = await getSpaceName(supabase, spaceId)

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single()

  const inviterName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null

  const emailResult = await sendSpaceInvitationEmail({
    to: normalizedEmail,
    inviteLink,
    spaceName,
    invitedByName: inviterName,
    invitedByEmail: user.email,
  })

  if (emailResult?.error) {
    console.error("Space invitation email failed to send", emailResult.error)
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { data, inviteLink, emailSkipped: Boolean(emailResult && "skipped" in emailResult && emailResult.skipped) }
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "You must be logged in to accept invitations" }
  }

  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single()

  if (inviteError || !invitation || !isPendingInvitation(invitation)) {
    return { error: "Invalid or expired invitation" }
  }

  if (new Date(invitation.expires_at) < new Date()) {
    if ("status" in invitation) {
      await supabase.from("invitations").update({ status: "expired" }).eq("id", invitation.id)
    }
    return { error: "Invitation has expired" }
  }

  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

  if (normalizeEmail(profile?.email || "") !== normalizeEmail(invitation.email || "")) {
    return {
      error: "This invitation was sent to a different email address. Please sign in with the invited email.",
    }
  }

  const { data: existingMembership } = await supabase
    .from("space_members")
    .select("user_id")
    .eq("space_id", invitation.space_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existingMembership) {
    const { error: memberError } = await supabase.from("space_members").insert({
      space_id: invitation.space_id,
      user_id: user.id,
      role: invitation.role,
      job: spaceJobFromInvite(invitation.role, invitation.job),
    })

    if (memberError) {
      return { error: memberError.message }
    }
  }

  const updatePayload: Record<string, unknown> = {}
  if ("status" in invitation) {
    updatePayload.status = "accepted"
  }
  if ("accepted_at" in invitation) {
    updatePayload.accepted_at = new Date().toISOString()
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await supabase.from("invitations").update(updatePayload).eq("id", invitation.id)
    if (updateError) {
      console.error("[acceptInvitation] Error updating invitation:", updateError)
    }
  }

  revalidatePath(`/spaces/${invitation.space_id}`)
  return { success: true, spaceId: invitation.space_id }
}

export async function revokeInvitation(invitationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .single()

  if (fetchError || !invitation) {
    return { error: "Invitation not found" }
  }

  const permissionError = await requireSpaceInvitePermission(invitation.space_id)
  if (permissionError) return permissionError

  if (!isPendingInvitation(invitation)) {
    return { error: "Only pending invitations can be revoked" }
  }

  if ("status" in invitation) {
    const { error } = await supabase.from("invitations").update({ status: "declined" }).eq("id", invitationId)
    if (error) {
      return { error: error.message }
    }
  } else {
    const { error } = await supabase.from("invitations").delete().eq("id", invitationId)
    if (error) {
      return { error: error.message }
    }
  }

  revalidatePath(`/spaces/${invitation.space_id}`)
  return { success: true }
}

export async function resendInvitation(invitationId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  const { data: invitation, error: fetchError } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .single()

  if (fetchError || !invitation) {
    return { error: "Invitation not found" }
  }

  const permissionError = await requireSpaceInvitePermission(invitation.space_id)
  if (permissionError) return permissionError

  if (!isPendingInvitation(invitation)) {
    return { error: "Only pending invitations can be resent" }
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const updatePayload: Record<string, unknown> = {
    token,
    expires_at: expiresAt.toISOString(),
  }

  if ("status" in invitation) {
    updatePayload.status = "pending"
  }

  const { error } = await supabase.from("invitations").update(updatePayload).eq("id", invitationId)

  if (error) {
    return { error: error.message }
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteLink = `${appUrl}/invite/${token}`
  const spaceName = await getSpaceName(supabase, invitation.space_id)

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single()

  const inviterName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null

  const emailResult = await sendSpaceInvitationEmail({
    to: invitation.email,
    inviteLink,
    spaceName,
    invitedByName: inviterName,
    invitedByEmail: user.email,
  })

  if (emailResult?.error) {
    console.error("Space invitation email failed to resend", emailResult.error)
  }

  revalidatePath(`/spaces/${invitation.space_id}`)
  return { inviteLink }
}

async function getSpaceName(supabase: Awaited<ReturnType<typeof createClient>>, spaceId: string) {
  const { data } = await supabase.from("spaces").select("name").eq("id", spaceId).single()
  return data?.name ?? "your space"
}
