import { describe, expect, it } from "vitest"

import {
  assertConsultationCommentInput,
  assertConsultationTransition,
  assertConsultationWindow,
  buildConsultationManifestSlice,
  canPublishProgrammeSnapshot,
  canSubmitConsultationComment,
  consultationWindowStatus,
  planClusterResolution,
} from "@/lib/programme/consultation"

describe("consultation window", () => {
  const now = new Date("2026-09-08T12:00:00.000Z")

  it("is scheduled before open, open during the window, and closed after", () => {
    expect(
      consultationWindowStatus(
        { opensAt: "2026-09-09T00:00:00.000Z", closesAt: "2026-09-30T00:00:00.000Z" },
        now,
      ),
    ).toBe("scheduled")
    expect(
      consultationWindowStatus(
        { opensAt: "2026-09-01T00:00:00.000Z", closesAt: "2026-09-30T00:00:00.000Z" },
        now,
      ),
    ).toBe("open")
    expect(
      consultationWindowStatus(
        { opensAt: "2026-08-01T00:00:00.000Z", closesAt: "2026-09-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("closed")
  })

  it("treats an early close as closed even inside the calendar window", () => {
    expect(
      consultationWindowStatus(
        {
          opensAt: "2026-09-01T00:00:00.000Z",
          closesAt: "2026-09-30T00:00:00.000Z",
          closedAt: "2026-09-07T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("closed")
  })

  it("rejects a window that does not close after it opens", () => {
    expect(
      assertConsultationWindow({
        opensAt: "2026-09-10T00:00:00.000Z",
        closesAt: "2026-09-01T00:00:00.000Z",
      }).ok,
    ).toBe(false)
  })
})

describe("consultation submit", () => {
  const openWindow = { opensAt: "2026-09-01T00:00:00.000Z", closesAt: "2026-09-30T00:00:00.000Z" }
  const now = new Date("2026-09-08T12:00:00.000Z")

  it("requires a signed-in commenter and an open window", () => {
    expect(canSubmitConsultationComment({ signedIn: false, window: openWindow, now }).ok).toBe(false)
    expect(canSubmitConsultationComment({ signedIn: true, window: openWindow, now })).toEqual({ ok: true })
    expect(
      canSubmitConsultationComment({
        signedIn: true,
        window: { ...openWindow, closedAt: "2026-09-07T00:00:00.000Z" },
        now,
      }).ok,
    ).toBe(false)
  })

  it("requires a stored quote and a non-empty body", () => {
    expect(assertConsultationCommentInput({ body: "Too noisy", quoteText: "" }).ok).toBe(false)
    expect(assertConsultationCommentInput({ body: "   ", quoteText: "Goal 1" }).ok).toBe(false)
    expect(assertConsultationCommentInput({ body: "Too noisy", quoteText: "Goal 1" })).toEqual({
      ok: true,
      body: "Too noisy",
      quoteText: "Goal 1",
    })
  })
})

describe("consultation transitions", () => {
  it("requires a reason except when opening", () => {
    expect(assertConsultationTransition({ from: "open", to: "rejected" }).ok).toBe(false)
    expect(assertConsultationTransition({ from: "open", to: "rejected", reason: "Out of mandate" })).toEqual({
      ok: true,
    })
  })

  it("blocks unknown jumps and same-status writes", () => {
    expect(assertConsultationTransition({ from: "accepted", to: "rejected", reason: "No" }).ok).toBe(false)
    expect(assertConsultationTransition({ from: "open", to: "open", reason: "Again" }).ok).toBe(false)
  })

  it("lets an owner send a decided comment back to discussion", () => {
    expect(
      assertConsultationTransition({ from: "rejected", to: "in_discussion", reason: "Reconsider" }),
    ).toEqual({ ok: true })
  })
})

describe("cluster cascade", () => {
  it("skips corrected comments and already decided members", () => {
    const plan = planClusterResolution({
      memberIds: ["a", "b", "c"],
      correctedCommentIds: ["b"],
      statuses: { a: "open", b: "open", c: "accepted" },
      toStatus: "rejected",
      reason: "Same topic, out of scope",
    })
    expect(plan).toEqual({ ok: true, applyTo: ["a"] })
  })

  it("refuses a cluster apply without a reason or a reset to open", () => {
    expect(
      planClusterResolution({
        memberIds: ["a"],
        correctedCommentIds: [],
        statuses: { a: "open" },
        toStatus: "rejected",
        reason: "  ",
      }).ok,
    ).toBe(false)
    expect(
      planClusterResolution({
        memberIds: ["a"],
        correctedCommentIds: [],
        statuses: { a: "open" },
        toStatus: "open",
        reason: "Reset",
      }).ok,
    ).toBe(false)
  })
})

describe("publish gate", () => {
  it("still requires a freeze", () => {
    expect(
      canPublishProgrammeSnapshot({
        hasFreeze: false,
        consultationWindowOpen: false,
        unresolvedCommentCount: 0,
      }).ok,
    ).toBe(false)
  })

  it("blocks a new snapshot while the period is open or comments are unresolved", () => {
    expect(
      canPublishProgrammeSnapshot({
        hasFreeze: true,
        consultationWindowOpen: true,
        unresolvedCommentCount: 0,
      }).ok,
    ).toBe(false)
    expect(
      canPublishProgrammeSnapshot({
        hasFreeze: true,
        consultationWindowOpen: false,
        unresolvedCommentCount: 2,
      }).ok,
    ).toBe(false)
  })

  it("allows the first publish and a later publish after the ledger is quiet", () => {
    expect(
      canPublishProgrammeSnapshot({
        hasFreeze: true,
        consultationWindowOpen: false,
        unresolvedCommentCount: 0,
      }),
    ).toEqual({ ok: true })
  })
})

describe("freeze manifest slice", () => {
  it("records window status and unresolved count without comment bodies", () => {
    const slice = buildConsultationManifestSlice({
      now: new Date("2026-09-08T12:00:00.000Z"),
      consultations: [
        {
          id: "c1",
          publicationId: "p1",
          opensAt: "2026-09-01T00:00:00.000Z",
          closesAt: "2026-09-30T00:00:00.000Z",
          closedAt: null,
        },
      ],
      comments: [
        {
          id: "m1",
          consultationId: "c1",
          status: "open",
          authorId: "u1",
          quoteLocator: "goal-1",
          createdAt: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "m2",
          consultationId: "c1",
          status: "accepted",
          authorId: "u2",
          quoteLocator: null,
          createdAt: "2026-09-03T00:00:00.000Z",
        },
      ],
    })
    expect(slice.consultations[0]?.window).toBe("open")
    expect(slice.unresolvedCount).toBe(1)
    expect(slice.comments[0]).not.toHaveProperty("body")
  })
})
