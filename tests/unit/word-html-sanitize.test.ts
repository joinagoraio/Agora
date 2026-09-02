import { describe, expect, it } from "vitest"
import DOMPurify from "dompurify"
import { JSDOM } from "jsdom"
import { WORD_HTML_SANITIZE_OPTIONS } from "@/lib/utils/word-html-sanitize"

const purify = DOMPurify(new JSDOM("").window)

describe("WORD_HTML_SANITIZE_OPTIONS", () => {
  it("keeps table structure from Mammoth Word HTML", () => {
    const html = `<table><tr><td><p>Name</p></td><td><p>Role</p></td></tr><tr><td><p>Ada</p></td><td><p>Lead</p></td></tr></table>`
    const out = purify.sanitize(html, { ...WORD_HTML_SANITIZE_OPTIONS })
    expect(out).toContain("<table>")
    expect(out).toContain("<tr>")
    expect(out).toContain("<td>")
    expect(out).toContain("Ada")
    expect(out).toContain("Lead")
  })

  it("keeps lists and merged cells", () => {
    const html = `<ul><li>One</li></ul><table><tr><td colspan="2"><p>Span</p></td></tr></table>`
    const out = purify.sanitize(html, { ...WORD_HTML_SANITIZE_OPTIONS })
    expect(out).toContain("<ul>")
    expect(out).toContain("<li>")
    expect(out).toContain("colspan")
  })
})
