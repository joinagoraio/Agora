"use server"

import { createClient } from "@/lib/supabase/server"
import { randomBytes } from "node:crypto"
import { env } from "@/lib/env"

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

  // TODO: Send invitation email with token
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviteLink = `${appUrl}/invite/${token}`

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
    .eq("status", "pending")
    .single()

  if (inviteError || !invitation) {
    return { error: "Invalid or expired invitation" }
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    await supabase.from("invitations").update({ status: "expired" }).eq("id", invitation.id)
    return { error: "Invitation has expired" }
  }

  // Check if email matches
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single()

  if (profile?.email !== invitation.email) {
    return {
      error: "This invitation was sent to a different email address. Please sign in with the invited email.",
    }
  }

  // Add user to space
  const { error: memberError } = await supabase.from("space_members").insert({
    space_id: invitation.space_id,
    user_id: user.id,
    role: invitation.role,
  })

  if (memberError) {
    return { error: memberError.message }
  }

  // Update invitation status
  await supabase.from("invitations").update({ status: "accepted" }).eq("id", invitation.id)

  return { success: true, spaceId: invitation.space_id }
}
