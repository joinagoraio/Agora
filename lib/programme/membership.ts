export type SpaceAccessRole = "owner" | "admin" | "member" | "viewer"

export function isAuthorityAdministrator(spaceRole: string | null | undefined) {
  return spaceRole === "owner" || spaceRole === "admin"
}

/** Open and work in a programme. Authority members are not on every programme by default. */
export function canAccessProgramme(input: {
  isWorkspaceMember: boolean
  isCreator?: boolean
  spaceRole?: string | null
}) {
  if (input.isWorkspaceMember || input.isCreator) return true
  return isAuthorityAdministrator(input.spaceRole)
}

/** Rename, members, invitations, and delete for a programme. */
export function canManageProgrammeAccess(input: {
  workspaceRole?: string | null
  isCreator?: boolean
  spaceRole?: string | null
}) {
  if (input.isCreator || input.workspaceRole === "admin") return true
  return isAuthorityAdministrator(input.spaceRole)
}

export type ProgrammeInviteChannel = "in_app" | "email"

export function resolveProgrammeInvite(input: {
  alreadyOnProgramme: boolean
  alreadyPending: boolean
  inviteeIsAuthorityMember: boolean
}): { error: "already_member" | "already_pending" } | { channel: ProgrammeInviteChannel } {
  if (input.alreadyOnProgramme) return { error: "already_member" }
  if (input.alreadyPending) return { error: "already_pending" }
  return { channel: input.inviteeIsAuthorityMember ? "in_app" : "email" }
}
