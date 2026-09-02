import {
  DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
  readProgrammeDocumentLayout,
  stepProgrammeScale,
  writeProgrammeDocumentLayout,
} from "@/lib/programme/document-layout"

describe("programme document layout", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("defaults to wide at 100%", () => {
    expect(readProgrammeDocumentLayout()).toEqual({ wide: true, scale: 1 })
    expect(DEFAULT_PROGRAMME_DOCUMENT_LAYOUT).toEqual({ wide: true, scale: 1 })
  })

  it("persists wide/narrow and zoom", () => {
    writeProgrammeDocumentLayout({ wide: false, scale: 1.25 })
    expect(readProgrammeDocumentLayout()).toEqual({ wide: false, scale: 1.25 })
  })

  it("treats missing wide as true and clamps scale", () => {
    window.localStorage.setItem("agora:programme-document-layout", JSON.stringify({ scale: 9 }))
    expect(readProgrammeDocumentLayout()).toEqual({ wide: true, scale: 2 })
  })

  it("steps zoom through presets", () => {
    expect(stepProgrammeScale(1, 1)).toBe(1.1)
    expect(stepProgrammeScale(1, -1)).toBe(0.9)
    expect(stepProgrammeScale(0.75, -1)).toBe(0.75)
    expect(stepProgrammeScale(1.5, 1)).toBe(1.5)
  })
})
