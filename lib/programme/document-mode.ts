export type ProgrammeDocumentMode = "read" | "edit" | "focus"

export function parseProgrammeDocumentMode(value: string | null | undefined): ProgrammeDocumentMode {
  if (value === "edit" || value === "focus" || value === "read") return value
  return "edit"
}

export function parseFocusChapterIds(value: string | null | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const part of value.split(",")) {
    const id = part.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function serializeFocusChapterIds(ids: string[]): string {
  return parseFocusChapterIds(ids.join(",")).join(",")
}

export function resolveProgrammeDocumentSearch(input: {
  mode: string | null | undefined
  focus: string | null | undefined
  chapter: string | null | undefined
}): { mode: ProgrammeDocumentMode; focusIds: string[]; chapterId: string | null } {
  const chapterId = input.chapter && input.chapter.length > 0 ? input.chapter : null
  const explicitMode =
    input.mode === "edit" || input.mode === "focus" || input.mode === "read" ? input.mode : null
  const focusIds = parseFocusChapterIds(input.focus)

  if (explicitMode === "read") {
    return { mode: "read", focusIds, chapterId: null }
  }
  if (explicitMode === "edit" || !explicitMode) {
    return { mode: "edit", focusIds, chapterId }
  }

  const ids = focusIds.length > 0 ? focusIds : chapterId ? [chapterId] : []
  const active = chapterId && ids.includes(chapterId) ? chapterId : null
  return { mode: "focus", focusIds: ids, chapterId: active }
}

export function nextProgrammeDocumentSearch(input: {
  nextMode: ProgrammeDocumentMode
  writableIds: string[]
  currentChapterId: string | null
  currentFocusIds: string[]
}): { mode: ProgrammeDocumentMode | null; focusIds: string[]; chapterId: string | null } {
  const writable = input.writableIds.filter(Boolean)
  const rememberedFocusIds = input.currentFocusIds.filter((id) => writable.includes(id))
  if (input.nextMode === "read") {
    return { mode: "read", focusIds: rememberedFocusIds, chapterId: null }
  }
  if (input.nextMode === "edit") {
    const chapterId =
      input.currentChapterId && writable.includes(input.currentChapterId) ? input.currentChapterId : null
    return { mode: "edit", focusIds: rememberedFocusIds, chapterId }
  }
  const retained = input.currentFocusIds.filter((id) => writable.includes(id))
  const focusIds = retained.length > 0 ? retained : writable
  const chapterId =
    input.currentChapterId && focusIds.includes(input.currentChapterId) ? input.currentChapterId : null
  return { mode: "focus", focusIds, chapterId }
}

export function visibleProgrammeChapterIds(input: {
  mode: ProgrammeDocumentMode
  allIds: string[]
  writableIds: string[]
  focusIds: string[]
}): string[] {
  if (input.mode !== "focus") return input.allIds
  const allowed = new Set(input.writableIds)
  const known = new Set(input.allIds)
  const chosen = input.focusIds.filter((id) => allowed.has(id) && known.has(id))
  if (chosen.length > 0) return chosen
  return input.writableIds.filter((id) => known.has(id))
}

export function toggleFocusChapterId(selected: string[], chapterId: string, checked: boolean): string[] {
  if (checked) {
    return selected.includes(chapterId) ? selected : [...selected, chapterId]
  }
  const next = selected.filter((id) => id !== chapterId)
  return next.length > 0 ? next : selected
}

export function clickClosesProgrammeChapterEditor(input: {
  activeChapterId: string | null
  clickedChapterId: string | null
  isEditorChrome: boolean
}): boolean {
  if (!input.activeChapterId) return false
  if (input.isEditorChrome) return false
  return input.clickedChapterId !== input.activeChapterId
}

export function clickDismissesWritingChapter(input: {
  activeChapterId: string | null
  clickedChapterId: string | null
  isEditorChrome: boolean
  isWritingControl: boolean
}): boolean {
  if (!input.activeChapterId || input.isEditorChrome) return false
  if (input.clickedChapterId && input.clickedChapterId !== input.activeChapterId) return false
  if (input.clickedChapterId === input.activeChapterId && input.isWritingControl) return false
  return true
}
