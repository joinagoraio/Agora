import { Resend } from "resend"

import { env } from "@/lib/env"

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

type SpaceInvitationEmailPayload = {
  to: string
  inviteLink: string
  spaceName: string
  invitedByName?: string | null
  invitedByEmail?: string | null
}

type WorkspaceInvitationEmailPayload = {
  to: string
  inviteLink: string
  workspaceName: string
  spaceName?: string | null
  invitedByName?: string | null
  invitedByEmail?: string | null
}

function getLogoUrl(): string {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return `${appUrl}/logo.svg`
}

function createEmailTemplate({
  title,
  greeting,
  description,
  ctaText,
  ctaLink,
  footerNote,
  inviterName,
}: {
  title: string
  greeting: string
  description: string
  ctaText: string
  ctaLink: string
  footerNote: string
  inviterName?: string | null
}): string {
  const logoUrl = getLogoUrl()
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const inviterDescriptor = inviterName || "A teammate"

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 40px 40px 30px 40px; background-color: #ffffff; border-radius: 8px 8px 0 0;">
              <img src="${logoUrl}" alt="Agora" style="max-width: 180px; height: auto; display: block;" />
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 600; color: #000000; line-height: 1.3;">
                ${title}
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">
                ${greeting}
              </p>
              <p style="margin: 0 0 32px 0; font-size: 16px; color: #333333;">
                ${description}
              </p>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding: 0 40px 32px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="background-color: #000000; border-radius: 6px;">
                    <a href="${ctaLink}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; background-color: #000000;">
                      ${ctaText}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Alternative Link -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <p style="margin: 0 0 12px 0; font-size: 14px; color: #666666; text-align: center;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 12px; color: #999999; word-break: break-all; text-align: center; font-family: 'Courier New', monospace; background-color: #f9f9f9; padding: 12px; border-radius: 4px; border: 1px solid #e5e5e5;">
                ${ctaLink}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px 40px 40px; border-top: 1px solid #e5e5e5; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666; text-align: center;">
                ${footerNote}
              </p>
              <p style="margin: 0; font-size: 12px; color: #999999; text-align: center;">
                This is an automated message from <a href="${appUrl}" style="color: #000000; text-decoration: underline;">Agora</a> — Your intelligent policy assistant
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

export async function sendSpaceInvitationEmail({
  to,
  inviteLink,
  spaceName,
  invitedByName,
  invitedByEmail,
}: SpaceInvitationEmailPayload) {
  if (!resendClient || !env.INVITE_EMAIL_FROM) {
    console.warn(
      "Space invitation email skipped because Resend is not configured. Provide RESEND_API_KEY and INVITE_EMAIL_FROM.",
    )
    return { skipped: true as const }
  }

  const subject = `You're invited to ${spaceName} on Agora`
  const inviterDescriptor = invitedByName || invitedByEmail || "A teammate"
  const inviterNameDisplay = invitedByName 
    ? `<strong style="color: #000000;">${invitedByName}</strong>` 
    : invitedByEmail 
    ? `<strong style="color: #000000;">${invitedByEmail}</strong>` 
    : "A teammate"
  const inviterText = `${inviterNameDisplay} has`
  
  const html = createEmailTemplate({
    title: `You're invited to ${spaceName}`,
    greeting: `Hello!`,
    description: `${inviterText} invited you to join <strong style="color: #000000;">${spaceName}</strong> on Agora. Join your team to collaborate, share documents, and get AI-powered answers to your questions.`,
    ctaText: "Accept Invitation",
    ctaLink: inviteLink,
    footerNote: "This invitation link will expire in 7 days.",
    inviterName: inviterDescriptor,
  })
  
  const text = `${inviterText} invited you to join ${spaceName} on Agora.\n\nAccept invitation: ${inviteLink}\n\nThis invitation expires in 7 days.`

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
  invitedByName,
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
  const inviterDescriptor = invitedByName || invitedByEmail || "A teammate"
  const inviterNameDisplay = invitedByName 
    ? `<strong style="color: #000000;">${invitedByName}</strong>` 
    : invitedByEmail 
    ? `<strong style="color: #000000;">${invitedByEmail}</strong>` 
    : "A teammate"
  const inviterText = `${inviterNameDisplay} has`
  
  const html = createEmailTemplate({
    title: `You're invited to ${workspaceName}`,
    greeting: `Hello!`,
    description: `${inviterText} invited you to join <strong style="color: #000000;">${contextPrefix}</strong> on Agora. Access documents, ask questions, and collaborate with your team using AI-powered search.`,
    ctaText: "Open Workspace",
    ctaLink: inviteLink,
    footerNote: "This invitation link will expire in 7 days.",
    inviterName: inviterDescriptor,
  })
  
  const text = `${inviterText} invited you to join ${contextPrefix} on Agora.\n\nOpen workspace: ${inviteLink}\n\nThis invitation expires in 7 days.`

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

