import { describe, expect, it } from "vitest"
import {
  findProgrammeCitationMarkers,
  programmeCitationLabel,
  renderProgrammeCitationHtml,
} from "@/lib/programme/citation-display"

const marker = `[citation:{"quote":"The province concentrates new housing near stations.","documentId":"vision-1","pageNumber":1}]`

describe("programme citation display", () => {
  it("reads a citation marker, including a nested text span", () => {
    const text = `Claim. [citation:{"quote":"Exact quote","documentId":"doc-1","textSpan":{"start":1,"end":4},"pageNumber":2}]`
    expect(findProgrammeCitationMarkers(text)).toEqual([
      {
        start: 7,
        end: text.length,
        citation: { quote: "Exact quote", documentId: "doc-1", pageNumber: 2 },
      },
    ])
  })

  it("uses a short source name and page as the visible reference", () => {
    expect(
      programmeCitationLabel({
        title: "Environmental vision — housing near nodes (fixture)",
        pageNumber: 1,
        index: 1,
      }),
    ).toBe("Environmental vision, p.1")
    expect(
      programmeCitationLabel({
        title: "01-omgevingsvisie-wonen-bij-knooppunten.md",
        label: "Environmental vision",
        pageNumber: 1,
        index: 1,
      }),
    ).toBe("Environmental vision, p.1")
  })

  it("turns a marker whose quote contains markup into a link", () => {
    const html = `<p>Priorities. [citation:{"quote":"Interest <strong>14</strong> applies.","documentId":"vision-1","pageNumber":1}]</p>`
    const rendered = renderProgrammeCitationHtml(html, {
      workspaceId: "ws-1",
      sources: [{ id: "vision-1", title: "01-omgevingsvisie.md", label: "Environmental vision" }],
    })
    expect(rendered).not.toContain("[citation:")
    expect(rendered).not.toContain("<strong>")
    expect(rendered).toContain(">Environmental vision, p.1</a>")
    expect(rendered).toContain('data-citation-quote="Interest 14 applies."')
  })

  it("replaces the raw marker with a source link and keeps the quote for the tooltip", () => {
    const html = `<p>Housing stays near stations. ${marker}</p>`
    const rendered = renderProgrammeCitationHtml(html, {
      workspaceId: "ws-1",
      sources: [{ id: "vision-1", title: "Environmental vision — housing near nodes" }],
    })
    expect(rendered).not.toContain("[citation:")
    expect(rendered).toContain("Housing stays near stations.")
    expect(rendered).toContain('class="programme-citation"')
    expect(rendered).toContain(">Environmental vision, p.1</a>")
    expect(rendered).toContain('href="/workspaces/ws-1/documents/vision-1"')
    expect(rendered).toContain('data-citation-quote="The province concentrates new housing near stations."')
    expect(rendered).toContain('data-citation-title="Environmental vision — housing near nodes"')
  })

  it("escapes quote text that would break the tooltip", () => {
    const html = `[citation:{"quote":"Say \\"<b>hi</b>\\"","documentId":"doc-1"}]`
    const rendered = renderProgrammeCitationHtml(html, {
      sources: [{ id: "doc-1", title: "Vision" }],
    })
    expect(rendered).toContain("data-citation-quote=\"Say &quot;hi&quot;\"")
    expect(rendered).not.toContain("<b>")
  })
})
