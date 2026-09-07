import { groupProgrammeCommentThreads, stackCommentAnchors } from "@/lib/programme/comment-layout"

describe("groupProgrammeCommentThreads", () => {
  const comments = [
    { id: "1", blockId: "p1", documentId: "d1", resolved: false },
    { id: "2", blockId: "p2", documentId: "d1", resolved: true },
  ]

  it("shows nothing when comments are off, even if a paragraph is active", () => {
    expect(
      groupProgrammeCommentThreads({
        comments,
        showComments: false,
        activeBlockId: "p1",
        canCompose: true,
      }).size,
    ).toBe(0)
  })

  it("opens a compose box only when comments are on", () => {
    const off = groupProgrammeCommentThreads({
      comments: [],
      showComments: false,
      activeBlockId: "p1",
      canCompose: true,
    })
    expect(off.size).toBe(0)
    const on = groupProgrammeCommentThreads({
      comments: [],
      showComments: true,
      activeBlockId: "p1",
      canCompose: true,
    })
    expect([...on.keys()]).toEqual(["p1"])
    expect(on.get("p1")).toEqual([])
  })

  it("hides resolved threads unless that paragraph is active", () => {
    const grouped = groupProgrammeCommentThreads({
      comments,
      showComments: true,
      activeBlockId: "p2",
      canCompose: false,
    })
    expect([...grouped.keys()]).toEqual(["p1", "p2"])
  })
})

describe("stackCommentAnchors", () => {
  it("keeps cards at their preferred tops when they do not overlap", () => {
    expect(
      stackCommentAnchors([
        { id: "b", preferredTop: 200, height: 40 },
        { id: "a", preferredTop: 20, height: 40 },
      ]),
    ).toEqual([
      { id: "a", top: 20 },
      { id: "b", top: 200 },
    ])
  })

  it("pushes overlapping cards down", () => {
    expect(
      stackCommentAnchors([
        { id: "a", preferredTop: 10, height: 80 },
        { id: "b", preferredTop: 40, height: 50 },
      ]),
    ).toEqual([
      { id: "a", top: 10 },
      { id: "b", top: 98 },
    ])
  })
})
