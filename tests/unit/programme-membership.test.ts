import { describe, expect, it } from "vitest"
import { canAccessProgramme, canManageProgrammeAccess, resolveProgrammeInvite } from "@/lib/programme/membership"

describe("programme membership", () => {
  it("lets programme members in, not every authority member", () => {
    expect(canAccessProgramme({ isWorkspaceMember: true, spaceRole: "member" })).toBe(true)
    expect(canAccessProgramme({ isWorkspaceMember: false, spaceRole: "member" })).toBe(false)
    expect(canAccessProgramme({ isWorkspaceMember: false, spaceRole: "viewer" })).toBe(false)
  })

  it("lets authority owners and admins open any programme", () => {
    expect(canAccessProgramme({ isWorkspaceMember: false, spaceRole: "owner" })).toBe(true)
    expect(canAccessProgramme({ isWorkspaceMember: false, spaceRole: "admin" })).toBe(true)
  })

  it("lets the creator in even without a membership row", () => {
    expect(canAccessProgramme({ isWorkspaceMember: false, isCreator: true, spaceRole: null })).toBe(true)
  })

  it("limits manage to programme admins and authority administrators", () => {
    expect(canManageProgrammeAccess({ workspaceRole: "member", spaceRole: "member" })).toBe(false)
    expect(canManageProgrammeAccess({ workspaceRole: "admin", spaceRole: "member" })).toBe(true)
    expect(canManageProgrammeAccess({ spaceRole: "owner" })).toBe(true)
    expect(canManageProgrammeAccess({ isCreator: true })).toBe(true)
  })

  it("invites authority colleagues in-app and outsiders by email", () => {
    expect(
      resolveProgrammeInvite({
        alreadyOnProgramme: false,
        alreadyPending: false,
        inviteeIsAuthorityMember: true,
      }),
    ).toEqual({ channel: "in_app" })
    expect(
      resolveProgrammeInvite({
        alreadyOnProgramme: false,
        alreadyPending: false,
        inviteeIsAuthorityMember: false,
      }),
    ).toEqual({ channel: "email" })
    expect(
      resolveProgrammeInvite({
        alreadyOnProgramme: true,
        alreadyPending: false,
        inviteeIsAuthorityMember: true,
      }),
    ).toEqual({ error: "already_member" })
    expect(
      resolveProgrammeInvite({
        alreadyOnProgramme: false,
        alreadyPending: true,
        inviteeIsAuthorityMember: true,
      }),
    ).toEqual({ error: "already_pending" })
  })
})
