import { describe, expect, it } from "vitest"
import { plainTextFromStoredContent } from "@/lib/documents/stored-text"

describe("plainTextFromStoredContent", () => {
  it("turns a sample source into readable paragraphs", () => {
    const html =
      "<h1>Environmental vision</h1><p>The province concentrates new housing near stations and mobility nodes. Provincial interest 14 (housing) and 20 (urbanisation) apply.</p>"
    expect(plainTextFromStoredContent(html)).toBe(
      "Environmental vision\n\nThe province concentrates new housing near stations and mobility nodes. Provincial interest 14 (housing) and 20 (urbanisation) apply.",
    )
  })

  it("returns an empty string when there is no stored body", () => {
    expect(plainTextFromStoredContent(null)).toBe("")
    expect(plainTextFromStoredContent("   <p> </p>")).toBe("")
  })
})