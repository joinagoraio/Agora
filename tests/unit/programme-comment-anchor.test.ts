import { isParagraphComment, paragraphArtefactId, parseParagraphArtefactId, toAnchoredComment } from "@/lib/programme/comment-anchor"
import { stableBlockId } from "@/lib/programme/block-id"

describe("programme comment anchors", () => {
  it("round-trips document and block ids", () => {
    const artefactId = paragraphArtefactId("doc-1", "block-9")
    expect(parseParagraphArtefactId(artefactId)).toEqual({ documentId: "doc-1", blockId: "block-9" })
  })

  it("treats legacy document ids as chapter-level", () => {
    expect(parseParagraphArtefactId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBeNull()
    expect(isParagraphComment("document", "doc-1")).toBe(false)
    expect(isParagraphComment("section", paragraphArtefactId("doc-1", "b1"))).toBe(true)
  })

  it("maps section comments onto the chapter and block", () => {
    const row = toAnchoredComment(
      {
        id: "c1",
        artefact_type: "section",
        artefact_id: paragraphArtefactId("doc-1", "b1"),
        body: "tighten this",
        resolved: false,
        authorName: "Ada",
      },
      [{ documentId: "doc-1", title: "Introduction" }],
      "Housing must…",
    )
    expect(row).toMatchObject({
      blockId: "b1",
      documentId: "doc-1",
      chapterTitle: "Introduction",
      quote: "Housing must…",
    })
  })

  it("keeps legacy document comments as chapter-level", () => {
    const row = toAnchoredComment(
      {
        id: "c2",
        artefact_type: "document",
        artefact_id: "doc-1",
        body: "overall",
        resolved: false,
      },
      [{ documentId: "doc-1", title: "Introduction" }],
    )
    expect(row).toMatchObject({ blockId: null, documentId: "doc-1", chapterTitle: "Introduction" })
  })

  it("gives the same block id for the same paragraph text", () => {
    expect(stableBlockId("Housing must grow.", 0)).toBe(stableBlockId("Housing must grow.", 0))
    expect(stableBlockId("Housing must grow.", 0)).not.toBe(stableBlockId("Other.", 0))
  })
})


