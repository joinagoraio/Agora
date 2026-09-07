import {
  EMPTY_PROGRAMME_TEXT_HISTORY,
  recordTextRevision,
  redoTextRevision,
  undoTextRevision,
  type ProgrammeTextHistoryState,
  type ProgrammeTextRevision,
} from "@/lib/programme/text-history"

describe("programme text history", () => {
  const edit = (chapterId: string, before: string, after: string): ProgrammeTextRevision => ({
    chapterId,
    before,
    after,
  })

  it("records text edits and undoes the latest regardless of chapter", () => {
    let state: ProgrammeTextHistoryState = EMPTY_PROGRAMME_TEXT_HISTORY
    state = recordTextRevision(state, edit("a", "<p>one</p>", "<p>two</p>"))
    state = recordTextRevision(state, edit("b", "<p>bee</p>", "<p>bear</p>"))
    const undone = undoTextRevision(state)
    expect(undone?.revision).toEqual(edit("b", "<p>bee</p>", "<p>bear</p>"))
    const undoneAgain = undoTextRevision(undone!.state)
    expect(undoneAgain?.revision.chapterId).toBe("a")
  })

  it("redoes a text edit after undo", () => {
    let state = recordTextRevision(EMPTY_PROGRAMME_TEXT_HISTORY, edit("a", "old", "new"))
    const undone = undoTextRevision(state)
    const redone = redoTextRevision(undone!.state)
    expect(redone?.revision).toEqual(edit("a", "old", "new"))
    expect(redone?.state.undo).toHaveLength(1)
    expect(redone?.state.redo).toHaveLength(0)
  })

  it("ignores no-op edits and comment-unrelated empty stacks", () => {
    const state = recordTextRevision(EMPTY_PROGRAMME_TEXT_HISTORY, edit("a", "same", "same"))
    expect(state).toEqual(EMPTY_PROGRAMME_TEXT_HISTORY)
    expect(undoTextRevision(state)).toBeNull()
    expect(redoTextRevision(state)).toBeNull()
  })
})
