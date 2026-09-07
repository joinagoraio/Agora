import {
  formatProgrammeChromeLabel,
  programmeChromeFooterSlots,
  programmeChromeHeaderSlots,
  programmePageNumberAlign,
  programmePageRunningFooter,
  programmePageRunningHeader,
  programmePageStartsFromUnits,
} from "@/lib/programme/page-chrome"

describe("programme page chrome", () => {
  it("uppercases running labels", () => {
    expect(formatProgrammeChromeLabel("  Energy  transition ")).toBe("ENERGY TRANSITION")
  })

  it("puts page numbers on the outer edge by default", () => {
    expect(programmePageNumberAlign(0, "outside")).toBe("right")
    expect(programmePageNumberAlign(1, "outside")).toBe("left")
    expect(programmePageNumberAlign(0, "inside")).toBe("left")
    expect(programmePageNumberAlign(1, "inside")).toBe("right")
    expect(programmePageNumberAlign(2, "center")).toBe("center")
    expect(programmePageNumberAlign(0, "hidden")).toBe("hidden")
  })

  it("omits the header when a page starts with a chapter title", () => {
    expect(
      programmePageRunningHeader(
        { chapterId: "one", chapterTitle: "Introduction", startsWithChapterTitle: true },
        { showHeader: true, headerText: "" },
      ),
    ).toBe("")
    expect(
      programmePageRunningHeader(
        { chapterId: "one", chapterTitle: "Introduction", startsWithChapterTitle: false },
        { showHeader: true, headerText: "" },
      ),
    ).toBe("INTRODUCTION")
  })

  it("uses custom header and footer text when provided", () => {
    expect(
      programmePageRunningHeader(
        { chapterId: "one", chapterTitle: "Introduction", startsWithChapterTitle: false },
        { showHeader: true, headerText: "Draft" },
      ),
    ).toBe("DRAFT")
    expect(programmePageRunningFooter("Energy transition programme", { showFooter: true, footerText: "North Holland" })).toBe(
      "NORTH HOLLAND",
    )
    expect(programmePageRunningFooter("Energy transition programme", { showFooter: false, footerText: "" })).toBe("")
  })

  it("centers the header across the full width, like the footer label", () => {
    expect(programmeChromeHeaderSlots("INTRODUCTION")).toEqual({ left: "", center: "INTRODUCTION", right: "" })
    expect(programmeChromeHeaderSlots("A VERY LONG CHAPTER TITLE ABOUT CLIMATE")).toEqual({
      left: "",
      center: "A VERY LONG CHAPTER TITLE ABOUT CLIMATE",
      right: "",
    })
    expect(programmeChromeFooterSlots(0, 1, "ENERGY PROGRAMME", "outside")).toEqual({
      left: "",
      center: "ENERGY PROGRAMME",
      right: "1",
    })
    expect(programmeChromeFooterSlots(1, 2, "ENERGY PROGRAMME", "outside")).toEqual({
      left: "2",
      center: "ENERGY PROGRAMME",
      right: "",
    })
  })

  it("uses the chapter of the first line on each page", () => {
    expect(
      programmePageStartsFromUnits(
        [
          { offsetTop: 76, height: 30, chapterId: "a", chapterTitle: "One", isChapterTitle: true },
          { offsetTop: 120, height: 80, chapterId: "a", chapterTitle: "One", isChapterTitle: false },
          { offsetTop: 1223, height: 40, chapterId: "a", chapterTitle: "One", isChapterTitle: false },
          { offsetTop: 2370, height: 28, chapterId: "b", chapterTitle: "Two", isChapterTitle: true },
        ],
        3,
        1123,
        76,
        24,
      ),
    ).toEqual([
      { chapterId: "a", chapterTitle: "One", startsWithChapterTitle: true },
      { chapterId: "a", chapterTitle: "One", startsWithChapterTitle: false },
      { chapterId: "b", chapterTitle: "Two", startsWithChapterTitle: true },
    ])
  })
})
