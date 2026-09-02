import {
  canAdministerProgramme,
  canWriteChapter,
  landingOwnedChapterId,
  parseChapterOwnerId,
  parseDocumentOwnerId,
  requiredChaptersAreApproved,
} from "@/lib/programme/ownership"

describe("programme ownership", () => {
  it("parses owner ids from metadata", () => {
    expect(parseDocumentOwnerId({ documentOwnerId: "u1" })).toBe("u1")
    expect(parseChapterOwnerId({ chapterOwnerId: "u2" })).toBe("u2")
    expect(parseDocumentOwnerId({})).toBeNull()
  })

  it("lets space admins and the document owner administer", () => {
    expect(canAdministerProgramme({ actorId: "u1", accessRole: "member", documentOwnerId: "u1" })).toBe(true)
    expect(canAdministerProgramme({ actorId: "u2", accessRole: "admin", documentOwnerId: "u1" })).toBe(true)
    expect(canAdministerProgramme({ actorId: "u2", accessRole: "tenant_admin", documentOwnerId: "u1" })).toBe(true)
    expect(canAdministerProgramme({ actorId: "u2", accessRole: "member", documentOwnerId: "u1" })).toBe(false)
  })

  it("lets the chapter owner write, and falls back to the document owner", () => {
    expect(
      canWriteChapter({ actorId: "c1", accessRole: "member", documentOwnerId: "d1", chapterOwnerId: "c1" }),
    ).toBe(true)
    expect(
      canWriteChapter({ actorId: "d1", accessRole: "member", documentOwnerId: "d1", chapterOwnerId: null }),
    ).toBe(true)
    expect(
      canWriteChapter({ actorId: "x", accessRole: "member", documentOwnerId: "d1", chapterOwnerId: "c1" }),
    ).toBe(false)
  })

  it("lands in the only unfrozen chapter the actor owns", () => {
    expect(
      landingOwnedChapterId({
        actorId: "c1",
        chapters: [
          { outlineNodeId: "n1", chapterOwnerId: "c1", workflowStatus: "generated" },
          { outlineNodeId: "n2", chapterOwnerId: "c2", workflowStatus: "generated" },
        ],
      }),
    ).toBe("n1")
    expect(
      landingOwnedChapterId({
        actorId: "c1",
        chapters: [
          { outlineNodeId: "n1", chapterOwnerId: "c1", workflowStatus: "generated" },
          { outlineNodeId: "n2", chapterOwnerId: "c1", workflowStatus: "in_review" },
        ],
      }),
    ).toBeNull()
  })

  it("requires required chapters to be approved before a programme freeze", () => {
    expect(
      requiredChaptersAreApproved({
        requiredNodeIds: ["n1"],
        chapters: [{ outlineNodeId: "n1", workflowStatus: "approved" }],
      }),
    ).toBe(true)
    expect(
      requiredChaptersAreApproved({
        requiredNodeIds: ["n1"],
        chapters: [{ outlineNodeId: "n1", workflowStatus: "generated" }],
      }),
    ).toBe(false)
  })
})
