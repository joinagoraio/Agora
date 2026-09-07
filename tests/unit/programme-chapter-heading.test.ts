import { describe, expect, it } from "vitest"
import {
  normalizeChapterHeadingText,
  stripDuplicateChapterHeading,
} from "@/lib/programme/chapter-heading"

describe("stripDuplicateChapterHeading", () => {
  it("drops a leading h1 that matches the outline title ignoring case", () => {
    const html =
      "<h1>Challenges and Goals</h1><p>North Holland must cut emissions.</p>"
    expect(stripDuplicateChapterHeading(html, "Challenges and goals")).toBe(
      "<p>North Holland must cut emissions.</p>",
    )
  })

  it("drops a leading h2 with nested markup and a block id", () => {
    const html =
      '<h2 data-block-id="b1"><strong>Introduction and legal framework</strong></h2><p>The Omgevingswet applies.</p>'
    expect(stripDuplicateChapterHeading(html, "Introduction and Legal Framework")).toBe(
      "<p>The Omgevingswet applies.</p>",
    )
  })

  it("keeps a first heading that is a real subsection", () => {
    const html = "<h1>Regional tensions</h1><p>Body</p>"
    expect(stripDuplicateChapterHeading(html, "Challenges and goals")).toBe(html)
  })

  it("keeps h3 and later headings even when the text matches", () => {
    const html = "<h3>Challenges and goals</h3><p>Body</p>"
    expect(stripDuplicateChapterHeading(html, "Challenges and goals")).toBe(html)
  })

  it("skips an empty lead paragraph before the duplicate title", () => {
    const html = "<p></p><h1>Challenges and goals</h1><p>Body</p>"
    expect(stripDuplicateChapterHeading(html, "Challenges and goals")).toBe("<p>Body</p>")
  })

  it("is a no-op without a title", () => {
    const html = "<h1>Challenges and Goals</h1><p>Body</p>"
    expect(stripDuplicateChapterHeading(html, "")).toBe(html)
  })
})

describe("normalizeChapterHeadingText", () => {
  it("ignores punctuation and extra spaces", () => {
    expect(normalizeChapterHeadingText("Challenges and Goals?")).toBe(
      normalizeChapterHeadingText("Challenges  and goals"),
    )
  })
})
