import {
  DEFAULT_PROGRAMME_LINE_HEIGHT,
  DEFAULT_PROGRAMME_SPACE_AFTER,
  parseProgrammeLineHeight,
  parseProgrammeSpaceAfter,
  programmeLineHeightAttrs,
  programmeSpaceAfterAttrs,
} from "@/lib/programme/paragraph-style"

describe("programme paragraph spacing", () => {
  it("parses named and numeric line heights", () => {
    expect(parseProgrammeLineHeight("single")).toBe("1")
    expect(parseProgrammeLineHeight("double")).toBe("2")
    expect(parseProgrammeLineHeight("2.5")).toBe("2.5")
    expect(parseProgrammeLineHeight("200%")).toBe("2")
    expect(parseProgrammeLineHeight("1.2")).toBe("1.15")
    expect(parseProgrammeLineHeight("default")).toBeNull()
    expect(parseProgrammeLineHeight("")).toBeNull()
  })

  it("parses space after in pt", () => {
    expect(parseProgrammeSpaceAfter("none")).toBe("0")
    expect(parseProgrammeSpaceAfter("12pt")).toBe("12")
    expect(parseProgrammeSpaceAfter("0.5em")).toBe("6")
    expect(parseProgrammeSpaceAfter("default")).toBeNull()
    expect(programmeSpaceAfterAttrs("18")).toEqual({ "data-space-after": "18" })
    expect(programmeLineHeightAttrs("2")).toEqual({ "data-line-height": "2" })
    expect(programmeLineHeightAttrs(null)).toEqual({})
  })

  it("keeps document defaults for missing values", () => {
    expect(DEFAULT_PROGRAMME_LINE_HEIGHT).toBe("1.5")
    expect(DEFAULT_PROGRAMME_SPACE_AFTER).toBe("8")
    expect(parseProgrammeSpaceAfter("8")).toBe(DEFAULT_PROGRAMME_SPACE_AFTER)
    expect(parseProgrammeLineHeight("1.5")).toBe(DEFAULT_PROGRAMME_LINE_HEIGHT)
  })
})
