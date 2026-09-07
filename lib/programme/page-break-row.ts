export const PROGRAMME_PAGE_BREAK_ROW_ATTR = "data-programme-page-break-row"

export function isProgrammePageBreakRow(element: Element) {
  return element.hasAttribute(PROGRAMME_PAGE_BREAK_ROW_ATTR)
}

export function firstProgrammeTableRow(table: HTMLTableElement): HTMLTableRowElement | null {
  for (const row of Array.from(table.rows)) {
    if (!isProgrammePageBreakRow(row)) return row
  }
  return null
}

export function programmePaginationBreakTarget(unit: HTMLElement): HTMLElement {
  if (unit.tagName !== "TR") return unit
  const table = unit.closest("table")
  if (!(table instanceof HTMLTableElement)) return unit
  if (firstProgrammeTableRow(table) !== unit) return unit
  const parent = table.parentElement
  if (parent?.classList.contains("tableWrapper")) return parent
  return table
}

export function createProgrammePageBreakRow(extra: number, columnCount: number) {
  const row = document.createElement("tr")
  row.setAttribute(PROGRAMME_PAGE_BREAK_ROW_ATTR, "")
  row.setAttribute("aria-hidden", "true")
  row.setAttribute("contenteditable", "false")
  row.dataset.programmePageExtra = String(Math.round(extra))
  row.style.pointerEvents = "none"
  const cell = document.createElement("td")
  cell.colSpan = Math.max(1, columnCount)
  cell.style.cssText = [
    `height:${Math.max(0, Math.round(extra))}px`,
    "padding:0",
    "border:0",
    "background:transparent",
    "line-height:0",
  ].join(";")
  row.appendChild(cell)
  return row
}

export function removePreviewPageBreakRows(root: ParentNode) {
  for (const row of Array.from(root.querySelectorAll(`tr[${PROGRAMME_PAGE_BREAK_ROW_ATTR}]`))) {
    if (row.closest(".ProseMirror")) continue
    row.remove()
  }
}
