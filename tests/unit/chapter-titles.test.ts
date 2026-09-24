import { describe, expect, it } from "vitest"
import { chapterTitlesFromHtml } from "@/lib/programme/domain"

describe("chapter titles from a document", () => {
  it("reads heading 1 and heading 2 and skips the body", () => {
    const html = "<h1>Vision</h1><p>Long policy text</p><h2>Housing</h2><p>More text</p><h3>Detail</h3>"
    expect(chapterTitlesFromHtml(html)).toEqual(["Vision", "Housing"])
  })
})