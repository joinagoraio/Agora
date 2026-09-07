import {
  DEFAULT_PROGRAMME_TABLE_BORDERS,
  parseProgrammeTableBorders,
  programmeTableBodyHasBorders,
  programmeTableBorderAttrs,
  programmeTableHeaderHasBorders,
} from "@/lib/programme/table-style"

describe("programme table borders", () => {
  it("defaults missing or unknown values to all borders", () => {
    expect(parseProgrammeTableBorders(undefined)).toBe(DEFAULT_PROGRAMME_TABLE_BORDERS)
    expect(parseProgrammeTableBorders("")).toBe("all")
    expect(parseProgrammeTableBorders("hidden")).toBe("all")
    expect(programmeTableBorderAttrs(null)).toEqual({ "data-table-borders": "all" })
  })

  it("keeps all, body, and none", () => {
    expect(parseProgrammeTableBorders("all")).toBe("all")
    expect(parseProgrammeTableBorders("body")).toBe("body")
    expect(parseProgrammeTableBorders("none")).toBe("none")
  })

  it("gives the header row a border only in all mode", () => {
    expect(programmeTableHeaderHasBorders("all")).toBe(true)
    expect(programmeTableHeaderHasBorders("body")).toBe(false)
    expect(programmeTableHeaderHasBorders("none")).toBe(false)
  })

  it("keeps body cell borders unless borders are hidden", () => {
    expect(programmeTableBodyHasBorders("all")).toBe(true)
    expect(programmeTableBodyHasBorders("body")).toBe(true)
    expect(programmeTableBodyHasBorders("none")).toBe(false)
  })
})
