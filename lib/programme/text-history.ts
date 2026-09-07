export type ProgrammeTextRevision = {
  chapterId: string
  before: string
  after: string
}

export type ProgrammeTextHistoryState = {
  undo: ProgrammeTextRevision[]
  redo: ProgrammeTextRevision[]
}

export const EMPTY_PROGRAMME_TEXT_HISTORY: ProgrammeTextHistoryState = {
  undo: [],
  redo: [],
}

const MAX_STACK = 100

export function recordTextRevision(
  state: ProgrammeTextHistoryState,
  revision: ProgrammeTextRevision,
): ProgrammeTextHistoryState {
  if (revision.before === revision.after) return state
  const undo = [...state.undo, revision]
  if (undo.length > MAX_STACK) undo.shift()
  return { undo, redo: [] }
}

export function undoTextRevision(state: ProgrammeTextHistoryState): {
  state: ProgrammeTextHistoryState
  revision: ProgrammeTextRevision
} | null {
  if (state.undo.length === 0) return null
  const revision = state.undo[state.undo.length - 1]
  return {
    revision,
    state: {
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, revision],
    },
  }
}

export function redoTextRevision(state: ProgrammeTextHistoryState): {
  state: ProgrammeTextHistoryState
  revision: ProgrammeTextRevision
} | null {
  if (state.redo.length === 0) return null
  const revision = state.redo[state.redo.length - 1]
  return {
    revision,
    state: {
      undo: [...state.undo, revision],
      redo: state.redo.slice(0, -1),
    },
  }
}
