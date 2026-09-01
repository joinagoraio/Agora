import { describe, expect, it } from "vitest"
import {
  buildPublicationCitation,
  canCitePublication,
  canPublishFromFreeze,
  canRevealPublicationBody,
  isPublicationVisibility,
  publicationCookieName,
  publicationIsExpired,
  publicationIsRevoked,
} from "@/lib/programme/publish"

describe("publication visibility", () => {
  it("accepts the three share modes and rejects gazette-like values", () => {
    expect(isPublicationVisibility("permissioned")).toBe(true)
    expect(isPublicationVisibility("link_code")).toBe(true)
    expect(isPublicationVisibility("public_listing")).toBe(true)
    expect(isPublicationVisibility("gazette")).toBe(false)
    expect(isPublicationVisibility("public")).toBe(false)
  })
})

describe("reveal body", () => {
  const base = {
    visibility: "permissioned" as const,
    revoked: false,
    expired: false,
    isAuthorityMember: false,
    accessCodeOk: false,
  }

  it("hides revoked snapshots from everyone", () => {
    expect(canRevealPublicationBody({ ...base, revoked: true, isAuthorityMember: true })).toEqual({
      ok: false,
      reason: "revoked",
    })
  })

  it("lets authority members read permissioned and link+code snapshots", () => {
    expect(canRevealPublicationBody({ ...base, isAuthorityMember: true })).toEqual({ ok: true })
    expect(
      canRevealPublicationBody({ ...base, visibility: "link_code", isAuthorityMember: true, expired: true }),
    ).toEqual({ ok: true })
  })

  it("requires sign-in for permissioned outsiders", () => {
    expect(canRevealPublicationBody(base)).toEqual({ ok: false, reason: "login" })
  })

  it("requires a matching code for link+code outsiders", () => {
    expect(canRevealPublicationBody({ ...base, visibility: "link_code" })).toEqual({ ok: false, reason: "code" })
    expect(canRevealPublicationBody({ ...base, visibility: "link_code", accessCodeOk: true })).toEqual({ ok: true })
  })

  it("opens a public listing without a code, until it expires", () => {
    expect(canRevealPublicationBody({ ...base, visibility: "public_listing" })).toEqual({ ok: true })
    expect(canRevealPublicationBody({ ...base, visibility: "public_listing", expired: true })).toEqual({
      ok: false,
      reason: "expired",
    })
  })
})

describe("publish and cite gates", () => {
  it("refuses publish without a freeze", () => {
    expect(canPublishFromFreeze(false).ok).toBe(false)
    expect(canPublishFromFreeze(true)).toEqual({ ok: true })
  })

  it("refuses citing a revoked snapshot or the same programme", () => {
    expect(
      canCitePublication({ sourceWorkspaceId: "a", targetWorkspaceId: "b", revoked: true }).ok,
    ).toBe(false)
    expect(
      canCitePublication({ sourceWorkspaceId: "a", targetWorkspaceId: "a", revoked: false }).ok,
    ).toBe(false)
    expect(canCitePublication({ sourceWorkspaceId: "a", targetWorkspaceId: "b", revoked: false })).toEqual({
      ok: true,
    })
  })
})

describe("citation line and expiry", () => {
  it("builds a stable citation from title, authority, day, and hash prefix", () => {
    expect(
      buildPublicationCitation({
        title: "Housing programme 2026",
        authorityName: "Provincie Flevoland",
        publishedAt: "2026-09-01T10:00:00.000Z",
        contentHash: "abcdef1234567890",
      }),
    ).toBe("Housing programme 2026. Provincie Flevoland. Frozen snapshot 2026-09-01. Hash abcdef123456.")
  })

  it("treats missing expiry as open and past expiry as closed", () => {
    expect(publicationIsExpired(null)).toBe(false)
    expect(publicationIsExpired("2099-01-01T00:00:00.000Z", new Date("2026-09-01"))).toBe(false)
    expect(publicationIsExpired("2020-01-01T00:00:00.000Z", new Date("2026-09-01"))).toBe(true)
    expect(publicationIsRevoked(null)).toBe(false)
    expect(publicationIsRevoked("2026-09-01T00:00:00.000Z")).toBe(true)
    expect(publicationCookieName("pub-1")).toBe("agora_pub_pub-1")
  })
})
