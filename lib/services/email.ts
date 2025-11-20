import { Resend } from "resend"

import { env } from "@/lib/env"

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

type SpaceInvitationEmailPayload = {
  to: string
  inviteLink: string
  spaceName: string
  invitedByEmail?: string | null
}

type WorkspaceInvitationEmailPayload = {
  to: string
  inviteLink: string
  workspaceName: string
  spaceName?: string | null
  invitedByEmail?: string | null
}

export async function sendSpaceInvitationEmail({
  to,
  inviteLink,
  spaceName,
  invitedByEmail,
}: SpaceInvitationEmailPayload) {
  if (!resendClient || !env.INVITE_EMAIL_FROM) {
    console.warn(
      "Space invitation email skipped because Resend is not configured. Provide RESEND_API_KEY and INVITE_EMAIL_FROM.",
    )
    return { skipped: true as const }
  }

  const subject = `You're invited to ${spaceName} on Agora`
  const inviterDescriptor = invitedByEmail ? `${invitedByEmail} has` : "A teammate has"
  const html = [
    `<p>${inviterDescriptor} invited you to join <strong>${spaceName}</strong> on Agora.</p>`,
    `<p><a href="${inviteLink}" style="color:#2563eb;text-decoration:none;font-weight:600;">Accept invitation</a></p>`,
    `<p>If the button above does not work, copy and paste this link into your browser:</p>`,
    `<p style="word-break:break-all;">${inviteLink}</p>`,
    `<p>This invitation link will expire in 7 days.</p>`,
  ].join("")
  const text = `${inviterDescriptor} invited you to join ${spaceName} on Agora.\n\nAccept invitation: ${inviteLink}\n\nThis invitation expires in 7 days.`

  try {
    await resendClient.emails.send({
      from: env.INVITE_EMAIL_FROM,
      to,
      subject,
      html,
      text,
    })
    return { success: true as const }
  } catch (error) {
    console.error("Failed to send space invitation email", error)
    return {
      error: error instanceof Error ? error.message : "Unknown email delivery error",
    }
  }
}

export async function sendWorkspaceInvitationEmail({
  to,
  inviteLink,
  workspaceName,
  spaceName,
  invitedByEmail,
}: WorkspaceInvitationEmailPayload) {
  if (!resendClient || !env.INVITE_EMAIL_FROM) {
    console.warn(
      "Workspace invitation email skipped because Resend is not configured. Provide RESEND_API_KEY and INVITE_EMAIL_FROM.",
    )
    return { skipped: true as const }
  }

  const subject = `You're invited to ${workspaceName} on Agora`
  const contextPrefix = spaceName ? `${workspaceName} in ${spaceName}` : workspaceName
  const inviterDescriptor = invitedByEmail ? `${invitedByEmail} has` : "A teammate has"
  const html = [
    `<p>${inviterDescriptor} invited you to join <strong>${contextPrefix}</strong> on Agora.</p>`,
    `<p><a href="${inviteLink}" style="color:#2563eb;text-decoration:none;font-weight:600;">Open workspace</a></p>`,
    `<p>If the button above does not work, copy and paste this link into your browser:</p>`,
    `<p style="word-break:break-all;">${inviteLink}</p>`,
    `<p>This invitation link will expire in 7 days.</p>`,
  ].join("")
  const text = `${inviterDescriptor} invited you to join ${contextPrefix} on Agora.\n\nOpen workspace: ${inviteLink}\n\nThis invitation expires in 7 days.`

  try {
    await resendClient.emails.send({
      from: env.INVITE_EMAIL_FROM,
      to,
      subject,
      html,
      text,
    })
    return { success: true as const }
  } catch (error) {
    console.error("Failed to send workspace invitation email", error)
    return {
      error: error instanceof Error ? error.message : "Unknown email delivery error",
    }
  }
}

