import {
  clickClosesProgrammeChapterEditor,
  clickDismissesWritingChapter,
  shouldAutoActivateWritingChapter,
  nextProgrammeDocumentSearch,
  parseFocusChapterIds,
  parseProgrammeDocumentMode,
  resolveProgrammeDocumentSearch,
  serializeFocusChapterIds,
  toggleFocusChapterId,
  visibleProgrammeChapterIds,
} from "@/lib/programme/document-mode"

describe("programme document modes", () => {
  it("defaults to read and treats a bare chapter param as legacy Focus", () => {
    expect(parseProgrammeDocumentMode(null)).toBe("read")
    expect(resolveProgrammeDocumentSearch({ mode: null, focus: null, chapter: null })).toEqual({
      mode: "read",
      focusIds: [],
      chapterId: null,
    })
    expect(resolveProgrammeDocumentSearch({ mode: null, focus: null, chapter: "n1" })).toEqual({
      mode: "focus",
      focusIds: ["n1"],
      chapterId: "n1",
    })
  })

  it("keeps Edit on the full document and Focus on an explicit set", () => {
    expect(resolveProgrammeDocumentSearch({ mode: "edit", focus: "n1,n2", chapter: "n2" })).toEqual({
      mode: "edit",
      focusIds: ["n1", "n2"],
      chapterId: "n2",
    })
    expect(resolveProgrammeDocumentSearch({ mode: "read", focus: "n1,n2", chapter: null })).toEqual({
      mode: "read",
      focusIds: ["n1", "n2"],
      chapterId: null,
    })
    expect(resolveProgrammeDocumentSearch({ mode: "focus", focus: "n2,n1,n1", chapter: "n9" })).toEqual({
      mode: "focus",
      focusIds: ["n2", "n1"],
      chapterId: null,
    })
  })

  it("serializes focus ids without blanks or duplicates", () => {
    expect(parseFocusChapterIds(" n1, n2,,n1 ")).toEqual(["n1", "n2"])
    expect(serializeFocusChapterIds(["n1", "n1", "n2"])).toBe("n1,n2")
  })

  it("enters Focus on every writable chapter, or the current subset", () => {
    expect(
      nextProgrammeDocumentSearch({
        nextMode: "read",
        writableIds: ["a", "b"],
        currentChapterId: "a",
        currentFocusIds: ["a"],
      }),
    ).toEqual({ mode: null, focusIds: ["a"], chapterId: null })
    expect(
      nextProgrammeDocumentSearch({
        nextMode: "edit",
        writableIds: ["a", "b"],
        currentChapterId: null,
        currentFocusIds: ["a"],
      }),
    ).toEqual({ mode: "edit", focusIds: ["a"], chapterId: null })
    expect(
      nextProgrammeDocumentSearch({
        nextMode: "edit",
        writableIds: ["a", "b"],
        currentChapterId: "a",
        currentFocusIds: ["a"],
      }),
    ).toEqual({ mode: "edit", focusIds: ["a"], chapterId: "a" })
    expect(
      nextProgrammeDocumentSearch({
        nextMode: "focus",
        writableIds: ["a", "b"],
        currentChapterId: null,
        currentFocusIds: [],
      }),
    ).toEqual({ mode: "focus", focusIds: ["a", "b"], chapterId: null })
    expect(
      nextProgrammeDocumentSearch({
        nextMode: "focus",
        writableIds: ["a", "b"],
        currentChapterId: "b",
        currentFocusIds: ["b"],
      }),
    ).toEqual({ mode: "focus", focusIds: ["b"], chapterId: "b" })
  })

  it("remembers Focus chapter selection across Read and Edit", () => {
    const subset = nextProgrammeDocumentSearch({
      nextMode: "focus",
      writableIds: ["a", "b", "c"],
      currentChapterId: null,
      currentFocusIds: ["b"],
    })
    expect(subset).toEqual({ mode: "focus", focusIds: ["b"], chapterId: null })

    const inEdit = nextProgrammeDocumentSearch({
      nextMode: "edit",
      writableIds: ["a", "b", "c"],
      currentChapterId: null,
      currentFocusIds: subset.focusIds,
    })
    expect(inEdit).toEqual({ mode: "edit", focusIds: ["b"], chapterId: null })

    const backToFocus = nextProgrammeDocumentSearch({
      nextMode: "focus",
      writableIds: ["a", "b", "c"],
      currentChapterId: null,
      currentFocusIds: inEdit.focusIds,
    })
    expect(backToFocus).toEqual({ mode: "focus", focusIds: ["b"], chapterId: null })
  })

  it("hides every chapter except the Focus selection", () => {
    expect(
      visibleProgrammeChapterIds({
        mode: "read",
        allIds: ["a", "b", "c"],
        writableIds: ["a"],
        focusIds: ["a"],
      }),
    ).toEqual(["a", "b", "c"])
    expect(
      visibleProgrammeChapterIds({
        mode: "edit",
        allIds: ["a", "b", "c"],
        writableIds: ["a", "b"],
        focusIds: [],
      }),
    ).toEqual(["a", "b", "c"])
    expect(
      visibleProgrammeChapterIds({
        mode: "focus",
        allIds: ["a", "b", "c"],
        writableIds: ["a", "b"],
        focusIds: ["b"],
      }),
    ).toEqual(["b"])
    expect(
      visibleProgrammeChapterIds({
        mode: "focus",
        allIds: ["a", "b", "c"],
        writableIds: ["a", "b"],
        focusIds: [],
      }),
    ).toEqual(["a", "b"])
  })

  it("keeps at least one Focus chapter selected", () => {
    expect(toggleFocusChapterId(["a"], "b", true)).toEqual(["a", "b"])
    expect(toggleFocusChapterId(["a", "b"], "a", false)).toEqual(["b"])
    expect(toggleFocusChapterId(["a"], "a", false)).toEqual(["a"])
  })

  it("closes the chapter editor only for clicks outside that chapter", () => {
    expect(
      clickClosesProgrammeChapterEditor({
        activeChapterId: "a",
        clickedChapterId: "a",
        isEditorChrome: false,
      }),
    ).toBe(false)
    expect(
      clickClosesProgrammeChapterEditor({
        activeChapterId: "a",
        clickedChapterId: "b",
        isEditorChrome: false,
      }),
    ).toBe(true)
    expect(
      clickClosesProgrammeChapterEditor({
        activeChapterId: "a",
        clickedChapterId: null,
        isEditorChrome: false,
      }),
    ).toBe(true)
    expect(
      clickClosesProgrammeChapterEditor({
        activeChapterId: "a",
        clickedChapterId: null,
        isEditorChrome: true,
      }),
    ).toBe(false)
    expect(
      clickClosesProgrammeChapterEditor({
        activeChapterId: null,
        clickedChapterId: "b",
        isEditorChrome: false,
      }),
    ).toBe(false)
  })

  it("opens the first writable chapter once, and a later clear stays clear", () => {
    expect(
      shouldAutoActivateWritingChapter({
        alreadyActivated: false,
        isWriting: true,
        activeChapterId: null,
        firstWritableId: "intro",
        sectionOpen: false,
      }),
    ).toBe(true)
    expect(
      shouldAutoActivateWritingChapter({
        alreadyActivated: false,
        isWriting: true,
        activeChapterId: "intro",
        firstWritableId: "intro",
        sectionOpen: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoActivateWritingChapter({
        alreadyActivated: true,
        isWriting: true,
        activeChapterId: null,
        firstWritableId: "intro",
        sectionOpen: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoActivateWritingChapter({
        alreadyActivated: false,
        isWriting: true,
        activeChapterId: null,
        firstWritableId: "intro",
        sectionOpen: true,
      }),
    ).toBe(false)
  })

  it("clears the writing chapter on a click that is not another chapter or an edit control", () => {
    expect(
      clickDismissesWritingChapter({
        activeChapterId: "intro",
        clickedChapterId: null,
        isEditorChrome: false,
        isWritingControl: false,
      }),
    ).toBe(true)
    expect(
      clickDismissesWritingChapter({
        activeChapterId: "intro",
        clickedChapterId: "intro",
        isEditorChrome: false,
        isWritingControl: false,
      }),
    ).toBe(true)
    expect(
      clickDismissesWritingChapter({
        activeChapterId: "intro",
        clickedChapterId: "intro",
        isEditorChrome: false,
        isWritingControl: true,
      }),
    ).toBe(false)
    expect(
      clickDismissesWritingChapter({
        activeChapterId: "intro",
        clickedChapterId: "wonen",
        isEditorChrome: false,
        isWritingControl: false,
      }),
    ).toBe(false)
    expect(
      clickDismissesWritingChapter({
        activeChapterId: "intro",
        clickedChapterId: null,
        isEditorChrome: true,
        isWritingControl: false,
      }),
    ).toBe(false)
  })
})
