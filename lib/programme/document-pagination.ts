import {
  applyProgrammeEditorPageBreaks,
  clearProgrammeEditorPageBreaks,
} from "@/lib/programme/editor-page-breaks"
import {
  createProgrammePageBreakRow,
  firstProgrammeTableRow,
  isProgrammePageBreakRow,
  programmePaginationBreakTarget,
  removePreviewPageBreakRows,
} from "@/lib/programme/page-break-row"

export const PROGRAMME_A4_WIDTH = "210mm"
export const PROGRAMME_A4_HEIGHT = "297mm"
export const PROGRAMME_A4_PAD = "20mm"
export const PROGRAMME_A4_GAP = "1.5rem"

export type PaginationUnitMetrics = {
  offsetTop: number
  height: number
  keepWithNext?: boolean
}

function chainEnd(units: PaginationUnitMetrics[], index: number) {
  let end = index
  while (end < units.length && units[end]?.keepWithNext) end += 1
  if (end < units.length) end += 1
  return Math.max(end, index + 1)
}

function chainHeight(units: PaginationUnitMetrics[], start: number, end: number) {
  let height = 0
  for (let index = start; index < end; index += 1) {
    const unit = units[index]
    if (!unit) continue
    const gap =
      index === start ? 0 : Math.max(0, unit.offsetTop - (units[index - 1]!.offsetTop + units[index - 1]!.height))
    height += gap + unit.height
  }
  return height
}

export function programmePagePushOffsets(
  units: PaginationUnitMetrics[],
  pageInner: number,
  breakExtra: number,
): { extras: number[]; pageCount: number; lastUsed: number } {
  const extras = units.map(() => 0)
  if (pageInner <= 0 || units.length === 0) return { extras, pageCount: 1, lastUsed: 0 }

  let used = 0
  let prevBottom = 0
  let pageCount = 1
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]!
    const spacing = index === 0 ? 0 : Math.max(0, unit.offsetTop - prevBottom)
    const placed = used + spacing + unit.height
    let breakBefore = used > 0 && placed > pageInner + 0.5
    if (!breakBefore && used > 0 && unit.keepWithNext) {
      const grouped = chainHeight(units, index, chainEnd(units, index))
      breakBefore = used + spacing + grouped > pageInner + 0.5
    }
    if (breakBefore) {
      extras[index] = Math.max(0, pageInner - used) + breakExtra
      used = unit.height
      pageCount += 1
    } else {
      extras[index] = 0
      used = placed
    }
    if (used > pageInner + 0.5) {
      const extraPages = Math.ceil(used / pageInner) - 1
      pageCount += extraPages
      used -= extraPages * pageInner
    }
    prevBottom = unit.offsetTop + unit.height
  }
  return { extras, pageCount, lastUsed: used }
}

export function programmeA4SheetTops(pageCount: number, pageHeight: number, gap: number): number[] {
  const count = Math.max(1, pageCount)
  return Array.from({ length: count }, (_, index) => index * (pageHeight + gap))
}

export function programmePaginationKeepWithNext(element: HTMLElement): boolean {
  if (element.matches("h1, h2, h3")) return true
  const parent = element.parentElement
  if (parent?.matches("article[data-chapter-id]") && element.querySelector("h1, h2, h3")) return true
  return false
}

export function programmePaginationIsChapterTitle(element: HTMLElement): boolean {
  const article = element.closest("article[data-chapter-id]")
  if (!article || element.parentElement !== article) return false
  return Boolean(element.querySelector("h1, h2, h3"))
}

export function programmePaginationChapterMeta(element: HTMLElement): {
  chapterId: string | null
  chapterTitle: string
} {
  const article = element.closest("article[data-chapter-id]")
  const heading = article?.querySelector<HTMLElement>(":scope > div h1, :scope > div h2, :scope > h1, :scope > h2")
  return {
    chapterId: article?.getAttribute("data-chapter-id") ?? null,
    chapterTitle: heading?.textContent?.replace(/\s+/g, " ").trim() ?? "",
  }
}

export function collectProgrammePaginationUnits(root: ParentNode): HTMLElement[] {
  const seen = new Set<HTMLElement>()
  const candidates: HTMLElement[] = []
  for (const article of root.querySelectorAll<HTMLElement>("article[data-chapter-id]")) {
    for (const child of Array.from(article.children) as HTMLElement[]) {
      candidates.push(child)
    }
    for (const block of article.querySelectorAll<HTMLElement>(
      "table, .tableWrapper, tr, [data-block-id], .ProseMirror > *, .tiptap > *, .ProseMirror li",
    )) {
      candidates.push(block)
    }
  }
  const unique = candidates.filter((element) => {
    if (seen.has(element) || isProgrammePageBreakRow(element)) return false
    seen.add(element)
    return true
  })
  const withoutTableInterior = unique.filter((element) => {
    if (element.tagName === "TABLE" || element.classList.contains("tableWrapper")) return false
    if (element.tagName === "TR") {
      const table = element.closest("table")
      return table instanceof HTMLTableElement && firstProgrammeTableRow(table) != null && !isProgrammePageBreakRow(element)
    }
    return !element.closest("table")
  })
  return withoutTableInterior.filter(
    (element) => !withoutTableInterior.some((other) => other !== element && element.contains(other)),
  )
}

export function relativeOffsetTop(element: HTMLElement, ancestor: HTMLElement): number {
  return element.getBoundingClientRect().top - ancestor.getBoundingClientRect().top
}

export function readProgrammePageExtra(unit: HTMLElement): number {
  const fromData = Number.parseFloat(unit.dataset.programmePageExtra || "")
  if (Number.isFinite(fromData) && fromData > 0) return fromData
  if (unit.tagName === "TR") {
    const target = programmePaginationBreakTarget(unit)
    if (target !== unit) {
      const fromTable = Number.parseFloat(target.dataset.programmePageExtra || "")
      if (Number.isFinite(fromTable) && fromTable > 0) return fromTable
    }
    const prev = unit.previousElementSibling
    if (prev instanceof HTMLElement && isProgrammePageBreakRow(prev)) {
      const fromSpacer = Number.parseFloat(prev.dataset.programmePageExtra || "")
      if (Number.isFinite(fromSpacer) && fromSpacer > 0) return fromSpacer
      return prev.getBoundingClientRect().height
    }
  }
  return 0
}

/** Undo already-applied page-break margins so push offsets see the natural flow. */
export function naturalPaginationOffsets(offsetTops: number[], extras: number[]): number[] {
  let shifted = 0
  return offsetTops.map((top, index) => {
    shifted += extras[index] ?? 0
    return Math.max(0, top - shifted)
  })
}

export function isProgrammeEditorPaginationNode(unit: HTMLElement): boolean {
  return Boolean(unit.closest(".ProseMirror"))
}

function clearPreviewUnitExtra(unit: HTMLElement) {
  unit.style.removeProperty("margin-top")
  delete unit.dataset.programmePageExtra
  const target = programmePaginationBreakTarget(unit)
  if (target === unit || !target.dataset.programmePageExtra) return
  target.style.removeProperty("margin-top")
  delete target.dataset.programmePageExtra
}

export function resetProgrammePagination(root: ParentNode) {
  clearProgrammeEditorPageBreaks()
  removePreviewPageBreakRows(root)
  for (const unit of collectProgrammePaginationUnits(root)) {
    if (isProgrammeEditorPaginationNode(unit)) continue
    clearPreviewUnitExtra(unit)
  }
}

export function clearProgrammePageExtras(units: HTMLElement[]) {
  const root = units[0]?.closest("[data-programme-document-type]") ?? units[0]?.ownerDocument
  if (root) {
    resetProgrammePagination(root)
    return
  }
  clearProgrammeEditorPageBreaks()
  for (const unit of units) {
    if (isProgrammeEditorPaginationNode(unit)) continue
    clearPreviewUnitExtra(unit)
  }
}

function applyPreviewUnitExtra(unit: HTMLElement, extra: number) {
  const target = programmePaginationBreakTarget(unit)
  if (extra <= 0.5) {
    clearPreviewUnitExtra(unit)
    return
  }
  if (unit.tagName === "TR" && target === unit) {
    const columns = unit instanceof HTMLTableRowElement ? unit.cells.length : 1
    unit.parentElement?.insertBefore(createProgrammePageBreakRow(extra, columns), unit)
    return
  }
  const base = Number.parseFloat(getComputedStyle(target).marginTop) || 0
  target.style.setProperty("margin-top", `${base + extra}px`, "important")
  target.dataset.programmePageExtra = String(Math.round(extra))
}

export function applyProgrammePageExtras(units: HTMLElement[], extras: number[]) {
  const root = units[0]?.closest("[data-programme-document-type]") ?? units[0]?.ownerDocument
  if (root) removePreviewPageBreakRows(root)
  const fromEditor = applyProgrammeEditorPageBreaks(units, extras)
  for (const unit of units) {
    if (!unit || fromEditor.has(unit) || isProgrammeEditorPaginationNode(unit)) continue
    clearPreviewUnitExtra(unit)
  }
  for (let index = 0; index < units.length; index += 1) {
    const extra = extras[index] ?? 0
    const unit = units[index]
    if (!unit || fromEditor.has(unit) || isProgrammeEditorPaginationNode(unit)) continue
    applyPreviewUnitExtra(unit, extra)
  }
}
