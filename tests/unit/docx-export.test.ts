import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { buildDocxFromSections, markdownToExportSections, takeExportFootnotes } from "@/lib/export/markdown-to-docx"
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
    expect(html).toContain("@page { size: A4;")
    expect(html).toContain("counter(page)")
    expect(html).toContain('content: "HOUSING"')
    expect(html).toContain('content: "PROGRAMME"')
  })

  it("prints the document title once", () => {
    const html = markdownToPrintHtml("Full dry-run", "# Full dry-run\n\n## Wonen\n\nHousing stays near stations. [^1]\n")
    expect(html.match(/Full dry-run/g)?.length).toBe(2)
    expect(html).not.toContain("<h1>Full dry-run</h1>")
  })

  it("turns footnote markers into a Word footnote and a print endnote", async () => {
    const prepared = takeExportFootnotes("Housing stays near stations. [^1]\n\n[^1]: Environmental vision, p.1 — “near stations”\n")
    expect(prepared.footnotes).toEqual([{ id: 1, text: "Environmental vision, p.1 — “near stations”" }])
    expect(prepared.markdown).not.toContain("[^1]:")

    const buffer = await buildDocxFromSections("Programme", markdownToExportSections(prepared.markdown), prepared.footnotes)
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file("word/document.xml")?.async("string")
    const footnotesXml = await zip.file("word/footnotes.xml")?.async("string")
    expect(documentXml).toContain('<w:footnoteReference w:id="1"/>')
    expect(footnotesXml).toContain("Environmental vision, p.1")
    expect(footnotesXml).toContain('w:type="separator"')

    const html = markdownToPrintHtml("Programme", prepared.markdown, prepared.footnotes)
    expect(html).toContain('href="#fn-1"')
    expect(html).toContain("Environmental vision, p.1")
    expect(html).not.toContain("[^1]")
  })

  it("prints the Pages header, footer, and page number in Word and PDF", async () => {
    const markdown = "# Full dry-run\n\n## Wonen en samenleving\n\nHousing stays near stations.\n\n## Mobiliteit\n\nBuses along the corridor.\n"
    const buffer = await buildDocxFromSections("Full dry-run", markdownToExportSections(markdown))
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file("word/document.xml")?.async("string")
    const header = await zip.file("word/header-0.xml")?.async("string")
    const oddFooter = await zip.file("word/footer-odd.xml")?.async("string")
    const evenFooter = await zip.file("word/footer-even.xml")?.async("string")
    const settings = await zip.file("word/settings.xml")?.async("string")
    expect(documentXml).toContain("<w:titlePg/>")
    expect(documentXml).toContain('w:val="nextPage"')
    expect(header).toContain("WONEN EN SAMENLEVING")
    expect(oddFooter).toContain("FULL DRY-RUN")
    expect(oddFooter).toContain(" PAGE ")
    expect(evenFooter).toContain(" PAGE ")
    expect(settings).toContain("<w:evenAndOddHeaders/>")

    const html = markdownToPrintHtml("Full dry-run", markdown)
    expect(html).toContain('content: "WONEN EN SAMENLEVING"')
    expect(html).toContain('content: "MOBILITEIT"')
    expect(html).toContain('content: "FULL DRY-RUN"')
    expect(html).toContain("counter(page)")
    expect(html).toContain("@page c0:first")
    expect(html).toContain("break-before: page")
  })
})
