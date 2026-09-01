/**
 * Publish is a frozen snapshot others may read and quote.
 * It is not gazette enactment. Live drafts are not citable.
 */

export const PUBLICATION_VISIBILITIES = ["permissioned", "link_code", "public_listing"] as const
export type PublicationVisibility = (typeof PUBLICATION_VISIBILITIES)[number]

export function isPublicationVisibility(value: unknown): value is PublicationVisibility {
  return typeof value === "string" && (PUBLICATION_VISIBILITIES as readonly string[]).includes(value)
}

export type PublicationRevealReason = "revoked" | "expired" | "login" | "code"

export function publicationIsRevoked(revokedAt: string | null | undefined): boolean {
  return typeof revokedAt === "string" && revokedAt.length > 0
}

export function publicationIsExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  const expires = new Date(expiresAt)
  if (Number.isNaN(expires.getTime())) return false
  return expires.getTime() <= now.getTime()
}

export function canRevealPublicationBody(input: {
  visibility: PublicationVisibility
  revoked: boolean
  expired: boolean
  isAuthorityMember: boolean
  accessCodeOk: boolean
}): { ok: true } | { ok: false; reason: PublicationRevealReason } {
  if (input.revoked) return { ok: false, reason: "revoked" }
  if (input.isAuthorityMember) return { ok: true }
  if (input.expired) return { ok: false, reason: "expired" }
  if (input.visibility === "public_listing") return { ok: true }
  if (input.visibility === "permissioned") return { ok: false, reason: "login" }
  return input.accessCodeOk ? { ok: true } : { ok: false, reason: "code" }
}

export function canPublishFromFreeze(hasFreeze: boolean): { ok: true } | { ok: false; reason: string } {
  if (!hasFreeze) return { ok: false, reason: "Freeze this programme before publishing a snapshot" }
  return { ok: true }
}

export function canCitePublication(input: {
  sourceWorkspaceId: string
  targetWorkspaceId: string
  revoked: boolean
}): { ok: true } | { ok: false; reason: string } {
  if (input.revoked) return { ok: false, reason: "Only a published frozen snapshot can be cited" }
  if (input.sourceWorkspaceId === input.targetWorkspaceId) {
    return { ok: false, reason: "A programme cannot cite its own live draft; bind a sister publication" }
  }
  return { ok: true }
}

export function buildPublicationCitation(input: {
  title: string
  authorityName: string
  publishedAt: string
  contentHash: string
}): string {
  const day = input.publishedAt.slice(0, 10) || input.publishedAt
  const hash = input.contentHash.slice(0, 12)
  return `${input.title}. ${input.authorityName}. Frozen snapshot ${day}. Hash ${hash}.`
}

export function publicationCookieName(publicationId: string): string {
  return `agora_pub_${publicationId}`
}
