"use server"

import { createClient } from "@/lib/supabase/server"
import { randomBytes } from "node:crypto"
import { env } from "@/lib/env"
import { sendSpaceInvitationEmail } from "@/lib/services/email"

export async function inviteUserToSpace(
  spaceId: string,
  email: string,
  role: "owner" | "admin" | "member" | "viewer" = "member",
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Unauthorized" }
  }

  // Generate unique token
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      space_id: spaceId,
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
  const inviteLink = `${appUrl}/invite/${token}`
  const spaceName = await getSpaceName(supabase, spaceId)

  // Get inviter's name from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single()
  
  const inviterName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null

  const emailResult = await sendSpaceInvitationEmail({
    to: email,
    inviteLink,
    spaceName,
    invitedByName: inviterName,
    invitedByEmail: user.email,
  })

  if (emailResult?.error) {
    console.error("Space invitation email failed to send", emailResult.error)
  }

  return { data, inviteLink }
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "You must be logged in to accept invitations" }
  }

  // Get invitation
  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .single()

  if (inviteError || !invitation) {
    return { error: "Invalid or expired invitation" }
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    return { error: "Invitation has expired" }
  }

  // Check if email matches (case-insensitive, trimmed)
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

  const profileEmail = profile?.email?.toLowerCase().trim()
  const invitationEmail = invitation.email?.toLowerCase().trim()

  console.log('[acceptInvitation] Checking emails:', { profileEmail, invitationEmail, match: profileEmail === invitationEmail })

  if (profileEmail !== invitationEmail) {
    return {
      error: "This invitation was sent to a different email address. Please sign in with the invited email.",
    }
  }

  // Add user to space
  console.log('[acceptInvitation] Adding user to space_members:', { space_id: invitation.space_id, user_id: user.id, role: invitation.role })
  
  const { error: memberError } = await supabase.from("space_members").insert({
    space_id: invitation.space_id,
    user_id: user.id,
    role: invitation.role,
  })

  if (memberError) {
    console.error('[acceptInvitation] Error adding member:', memberError)
    return { error: memberError.message }
  }

  console.log('[acceptInvitation] User added successfully, marking invitation as accepted')

  // Mark invitation as accepted
  const { error: updateError } = await supabase.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id)

  if (updateError) {
    console.error('[acceptInvitation] Error updating invitation:', updateError)
    // Don't fail here - user is already added to space
  }

  console.log('[acceptInvitation] Success!')
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

  const { data: invitation, error: fetchError } = await supabase.from("invitations").select("*").eq("id", invitationId).single()

  if (fetchError || !invitation) {
    return { error: "Invitation not found" }
  }

  const hasStatusColumn = Object.prototype.hasOwnProperty.call(invitation, "status")

  if (hasStatusColumn) {
    if (invitation.status !== "pending") {
      return { error: "Only pending invitations can be revoked" }
    }

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

  if ("status" in invitation && invitation.status !== "pending") {
    return { error: "Only pending invitations can be resent" }
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const updatePayload: Record<string, any> = {
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

  // Get inviter's name from profile
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

  return { inviteLink }
}

async function getSpaceName(supabase: Awaited<ReturnType<typeof createClient>>, spaceId: string) {
  const { data } = await supabase.from("spaces").select("name").eq("id", spaceId).single()
  return data?.name ?? "your space"
}
