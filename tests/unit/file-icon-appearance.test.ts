import { describe, expect, it } from "vitest"
import { resolveFileIconAppearance } from "@/lib/file-icon-appearance"

describe("resolveFileIconAppearance", () => {
  it("uses Acrobat red for PDF", () => {
    expect(resolveFileIconAppearance("pdf")).toMatchObject({
      color: "#D93831",
      type: "acrobat",
    })
  })

  it("uses Word blue for doc and docx", () => {
    expect(resolveFileIconAppearance("docx").color).toBe("#2C5898")
    expect(resolveFileIconAppearance("doc").color).toBe("#2C5898")
  })

  it("uses Excel green for spreadsheets", () => {
    expect(resolveFileIconAppearance("xlsx").color).toBe("#1A754C")
    expect(resolveFileIconAppearance("csv").type).toBe("spreadsheet")
  })

  it("uses PowerPoint orange-red for presentations", () => {
    expect(resolveFileIconAppearance("pptx").color).toBe("#D14423")
  })

  it("uses a distinct slate for text files", () => {
    expect(resolveFileIconAppearance("txt")).toMatchObject({
      color: "#607D8B",
      type: "document",
    })
  })

  it("keeps unknown types as a light document", () => {
    expect(resolveFileIconAppearance("file")).toMatchObject({
      color: "#E5E7EB",
      type: "document",
    })
  })
})
