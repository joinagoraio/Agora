import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { extractSectionsFromPages } from "@/lib/documents/section-extraction"
import { splitTextIntoPages } from "@/lib/documents/text-pages"
import { buildEvidenceSpans, formatEvidenceSelection, selectEvidenceSpans } from "@/lib/programme/evidence-select"

function visionSpans() {
  const text = readFileSync(resolve(process.cwd(), "lib/programme/flevoland-sources/vision-2050.txt"), "utf8")
  const pages = splitTextIntoPages(text)
  const sections = extractSectionsFromPages(pages.map((page) => ({ pageNumber: page.pageNumber, textContent: page.text }))).map(
    (section, index) => ({ id: `s${index}`, title: section.title, page_number: section.pageNumber, start_offset: section.startOffset }),
  )
  return { pages, spans: buildEvidenceSpans({ documentId: "vision", documentTitle: "Vision", pages, sections }) }
}

describe("splitTextIntoPages", () => {
  it("uses the PDF page markers", () => {
    const { pages } = visionSpans()
    expect(pages.length).toBe(71)
    expect(pages[0]?.pageNumber).toBe(1)
    expect(pages.at(-1)?.pageNumber).toBe(71)
  })

  it("cuts unmarked text at paragraph breaks", () => {
    const text = Array.from({ length: 12 }, (_, index) => `Paragraph ${index} ${"word ".repeat(120)}`).join("\n\n")
    const pages = splitTextIntoPages(text)
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.every((page) => page.text.length <= 6000)).toBe(true)
  })
})

describe("selectEvidenceSpans", () => {
  it("finds housing interests deep in the vision instead of the first pages", () => {
    const { spans } = visionSpans()
    const chosen = selectEvidenceSpans(spans, "Provinciaal belang voldoende passende betaalbare woningen vitale steden en dorpen", 20000)
    const text = chosen.map((span) => span.text).join("\n")
    expect(text).toMatch(/Provinciaal belang 15/)
    expect(Math.max(...chosen.map((span) => span.pageNumber))).toBeGreaterThan(20)
    expect(chosen.reduce((sum, span) => sum + span.text.length, 0)).toBeLessThanOrEqual(20000)
  })

  it("keeps at least one piece of every document", () => {
    const spans = [
      { documentId: "a", documentTitle: "A", sectionId: null, title: "p. 1", pageNumber: 1, text: "woningbouw provincie rol" },
      { documentId: "b", documentTitle: "B", sectionId: null, title: "p. 1", pageNumber: 1, text: "natuur water" },
    ]
    const chosen = selectEvidenceSpans(spans, "woningbouw", 1000)
    expect(chosen.map((span) => span.documentId).sort()).toEqual(["a", "b"])
    expect(formatEvidenceSelection([{ id: "a", title: "A", outline: [], pageCount: 1 }], chosen)).toContain("p.1")
  })
})
