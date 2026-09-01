import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { buildDocxFromSections, markdownToExportSections } from "@/lib/export/markdown-to-docx"
import { markdownToPrintHtml } from "@/lib/export/markdown-to-print-html"

describe("markdown-to-docx (confidence spike)", () => {
  it("parses markdown outline into export sections", () => {
    const md = `# Strong Living Regions

Intro paragraph.

## Housing

Build near stations.

### Timeline

2026-2030
`
    const sections = markdownToExportSections(md)
    expect(sections[0]?.heading).toBe("Strong Living Regions")
    expect(sections[0]?.level).toBe(1)
    expect(sections.some((s) => s.heading === "Housing" && s.level === 2)).toBe(true)
    expect(sections.some((s) => s.heading === "Timeline" && s.body.includes("2026"))).toBe(true)
  })

  it("builds a valid docx zip with headings, lists, bold, and numbering", async () => {
    const buffer = await buildDocxFromSections("Programme draft", [
      {
        heading: "Strong Living Regions",
        level: 1,
        body: "Vision-led measures for **housing** and mobility.\n- Near stations\n- Along corridors\n1. First phase\n2. Second phase",
      },
      {
        heading: "Mobility",
        level: 2,
        body: "Increase regional bus frequency.",
      },
    ])

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.byteLength).toBeGreaterThan(500)

    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file("word/document.xml")?.async("string")
    expect(documentXml).toBeTruthy()
    expect(documentXml).toContain("Strong Living Regions")
    expect(documentXml).toContain("Mobility")
    expect(documentXml).toContain("Heading1")
    expect(documentXml).toContain("Heading2")
    expect(documentXml).toContain("<w:b/>")
    expect(documentXml).toContain("numPr")
    expect(documentXml).toContain("pgMar")
    expect(zip.file("[Content_Types].xml")).toBeTruthy()
    expect(zip.file("word/styles.xml")).toBeTruthy()
    expect(zip.file("word/numbering.xml")).toBeTruthy()
  })
})

describe("markdown-to-print-html", () => {
  it("renders print-ready HTML with headings, lists, and bold", () => {
    const html = markdownToPrintHtml(
      "Programme",
      `# Vision\n\nLead with **stations**.\n\n## Housing\n\n- Densify\n- Mix uses\n`,
    )
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain('class="doc-title"')
    expect(html).toContain("<h1>Vision</h1>")
    expect(html).toContain("<strong>stations</strong>")
    expect(html).toContain("<ul>")
    expect(html).toContain("@media print")
  })
})
