import {
  DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
  programmeCommentRailClass,
  programmeDocumentCanvasClass,
  programmeDocumentColumnClass,
  programmeDocumentPageClass,
  programmeDocumentTypeStyle,
  programmeChapterScrollTop,
  readProgrammeDocumentLayout,
  readProgrammeShowComments,
  stepProgrammeScale,
  writeProgrammeDocumentLayout,
  writeProgrammeShowComments,
} from "@/lib/programme/document-layout"

describe("programme document layout", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("reads an earlier narrow choice as the one reading width", () => {
    window.localStorage.setItem("agora:programme-document-layout", JSON.stringify({ wide: false, paged: false }))
    expect(readProgrammeDocumentLayout().wide).toBe(true)
  })

  it("defaults to the one reading width, continuous at 100%", () => {
    expect(readProgrammeDocumentLayout()).toEqual({
      wide: true,
      scale: 1,
      showComments: false,
      paged: false,
      pageChrome: {
        showHeader: true,
        showFooter: true,
        headerText: "",
        footerText: "",
        pageNumbers: "outside",
        size: "xs",
      },
    })
    expect(DEFAULT_PROGRAMME_DOCUMENT_LAYOUT).toEqual({
      wide: true,
      scale: 1,
      showComments: false,
      paged: false,
      pageChrome: {
        showHeader: true,
        showFooter: true,
        headerText: "",
        footerText: "",
        pageNumbers: "outside",
        size: "xs",
      },
    })
  })

  it("persists pages, zoom, and page chrome", () => {
    writeProgrammeDocumentLayout({
      ...DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
      wide: false,
      scale: 1.25,
      showComments: false,
      paged: true,
      pageChrome: {
        ...DEFAULT_PROGRAMME_DOCUMENT_LAYOUT.pageChrome,
        footerText: "North Holland",
        pageNumbers: "center",
        size: "sm",
      },
    })
    expect(readProgrammeDocumentLayout()).toEqual({
      wide: true,
      scale: 1.25,
      showComments: false,
      paged: true,
      pageChrome: {
        showHeader: true,
        showFooter: true,
        headerText: "",
        footerText: "North Holland",
        pageNumbers: "center",
        size: "sm",
      },
    })
  })

  it("keeps comments off until they are turned on for that programme", () => {
    expect(readProgrammeShowComments("programme-a")).toBe(false)
    writeProgrammeShowComments("programme-a", true)
    expect(readProgrammeShowComments("programme-a")).toBe(true)
    expect(readProgrammeShowComments("programme-b")).toBe(false)
  })

  it("clamps scale", () => {
    window.localStorage.setItem("agora:programme-document-layout", JSON.stringify({ scale: 9 }))
    expect(readProgrammeDocumentLayout()).toEqual({
      ...DEFAULT_PROGRAMME_DOCUMENT_LAYOUT,
      scale: 2,
    })
  })

  it("reserves comment space only when the document has room for it", () => {
    expect(programmeDocumentPageClass({ wide: true, scale: 1, showComments: true, paged: false })).toContain("@min-[66rem]/doc:pr-80")
    expect(programmeDocumentPageClass({ wide: true, scale: 1, showComments: false, paged: false })).not.toContain("pr-80")
    expect(programmeDocumentPageClass({ wide: false, scale: 1, showComments: true, paged: false })).not.toContain("pr-80")
    expect(programmeDocumentColumnClass({ wide: false, scale: 1, showComments: true, paged: false })).toContain("max-w-3xl")
    expect(programmeCommentRailClass({ wide: false, paged: false })).toContain("min(calc(50%+24rem+0.75rem)")
    expect(programmeCommentRailClass({ wide: true, paged: false })).toContain("right-0")
  })

  it("keeps type zoom from changing the column width", () => {
    expect(programmeDocumentTypeStyle(1)).toEqual({ "--programme-type-scale": "1" })
    expect(programmeDocumentTypeStyle(1.25)).toEqual({ "--programme-type-scale": "1.25" })
    expect(programmeDocumentTypeStyle(0.75)).toEqual({ "--programme-type-scale": "0.75" })
    expect(programmeDocumentPageClass({ wide: true, scale: 1.5, showComments: false, paged: false })).toBe(
      programmeDocumentPageClass({ wide: true, scale: 1, showComments: false, paged: false }),
    )
    expect(programmeDocumentColumnClass({ wide: false, scale: 1.5, showComments: true, paged: false })).toBe(
      programmeDocumentColumnClass({ wide: false, scale: 1, showComments: true, paged: false }),
    )
  })

  it("uses A4 sheets instead of wide or narrow when paginated", () => {
    expect(programmeDocumentPageClass({ wide: true, scale: 1, showComments: true, paged: true })).not.toContain("pr-80")
    expect(programmeDocumentPageClass({ wide: true, scale: 1, showComments: true, paged: true })).not.toContain("max-w-7xl")
    expect(programmeDocumentColumnClass({ wide: true, scale: 1, showComments: true, paged: true })).toContain("w-[210mm]")
    expect(programmeDocumentColumnClass({ wide: true, scale: 1, showComments: true, paged: false })).toContain("bg-white")
    expect(programmeDocumentColumnClass({ wide: true, scale: 1, showComments: true, paged: false })).not.toContain("space-y-10")
    expect(programmeDocumentColumnClass({ wide: true, scale: 1, showComments: true, paged: false })).not.toContain("shadow-lg")
    expect(programmeDocumentColumnClass({ wide: true, scale: 1, showComments: true, paged: true })).not.toContain("shadow-lg")
    expect(programmeDocumentCanvasClass({ paged: true })).toBe("bg-gray-100")
    expect(programmeDocumentCanvasClass({ paged: false })).toBe("bg-white")
    expect(programmeCommentRailClass({ wide: true, paged: true })).toContain("105mm")
  })

  it("steps zoom through presets", () => {
    expect(stepProgrammeScale(1, 1)).toBe(1.1)
    expect(stepProgrammeScale(1, -1)).toBe(0.9)
    expect(stepProgrammeScale(0.75, -1)).toBe(0.75)
    expect(stepProgrammeScale(1.5, 1)).toBe(1.5)
  })

  it("scrolls a chapter so its top matches the scroller top", () => {
    expect(programmeChapterScrollTop(400, 80, 240)).toBe(560)
    expect(programmeChapterScrollTop(120, 80, 40)).toBe(80)
    expect(programmeChapterScrollTop(0, 80, 40)).toBe(0)
  })
})
