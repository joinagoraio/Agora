export const PROGRAMME_PAGE_NUMBER_POSITIONS = ["outside", "inside", "center", "hidden"] as const
export type ProgrammePageNumberPosition = (typeof PROGRAMME_PAGE_NUMBER_POSITIONS)[number]

export const PROGRAMME_CHROME_SIZES = ["xs", "sm", "base"] as const
export type ProgrammeChromeSize = (typeof PROGRAMME_CHROME_SIZES)[number]

export type ProgrammePageChromeSettings = {
  showHeader: boolean
  showFooter: boolean
  headerText: string
  footerText: string
  pageNumbers: ProgrammePageNumberPosition
  size: ProgrammeChromeSize
}

export const DEFAULT_PROGRAMME_PAGE_CHROME: ProgrammePageChromeSettings = {
  showHeader: true,
  showFooter: true,
  headerText: "",
  footerText: "",
  pageNumbers: "outside",
  size: "xs",
}

export type ProgrammePageStart = {
  chapterId: string | null
  chapterTitle: string
  startsWithChapterTitle: boolean
}

export type ProgrammePageUnitMeta = {
  offsetTop: number
  height: number
  chapterId: string | null
  chapterTitle: string
  isChapterTitle: boolean
}

export type ProgrammeChromeSlots = {
  left: string
  center: string
  right: string
}

function isPageNumberPosition(value: unknown): value is ProgrammePageNumberPosition {
  return PROGRAMME_PAGE_NUMBER_POSITIONS.includes(value as ProgrammePageNumberPosition)
}

function isChromeSize(value: unknown): value is ProgrammeChromeSize {
  return PROGRAMME_CHROME_SIZES.includes(value as ProgrammeChromeSize)
}

export function parseProgrammePageChrome(raw: unknown): ProgrammePageChromeSettings {
  const parsed = raw && typeof raw === "object" ? (raw as Partial<ProgrammePageChromeSettings>) : {}
  return {
    showHeader: parsed.showHeader !== false,
    showFooter: parsed.showFooter !== false,
    headerText: typeof parsed.headerText === "string" ? parsed.headerText : "",
    footerText: typeof parsed.footerText === "string" ? parsed.footerText : "",
    pageNumbers: isPageNumberPosition(parsed.pageNumbers) ? parsed.pageNumbers : "outside",
    size: isChromeSize(parsed.size) ? parsed.size : "xs",
  }
}

export function formatProgrammeChromeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().toUpperCase()
}

export function programmePageNumberAlign(
  pageIndex: number,
  position: ProgrammePageNumberPosition,
): "left" | "center" | "right" | "hidden" {
  if (position === "hidden") return "hidden"
  if (position === "center") return "center"
  const odd = pageIndex % 2 === 0
  if (position === "outside") return odd ? "right" : "left"
  return odd ? "left" : "right"
}

export function programmePageRunningHeader(
  start: ProgrammePageStart,
  settings: Pick<ProgrammePageChromeSettings, "showHeader" | "headerText">,
) {
  if (!settings.showHeader) return ""
  if (start.startsWithChapterTitle) return ""
  return formatProgrammeChromeLabel(settings.headerText.trim() || start.chapterTitle)
}

export function programmePageRunningFooter(
  programmeName: string,
  settings: Pick<ProgrammePageChromeSettings, "showFooter" | "footerText">,
) {
  if (!settings.showFooter) return ""
  return formatProgrammeChromeLabel(settings.footerText.trim() || programmeName)
}

export function programmeChromeHeaderSlots(header: string): ProgrammeChromeSlots {
  return { left: "", center: header, right: "" }
}

export function programmeChromeFooterSlots(
  pageIndex: number,
  pageNumber: number,
  footer: string,
  position: ProgrammePageNumberPosition,
): ProgrammeChromeSlots {
  const number = position === "hidden" ? "" : String(pageNumber)
  const align = programmePageNumberAlign(pageIndex, position)
  if (align === "hidden") {
    return { left: "", center: footer, right: "" }
  }
  if (align === "center") {
    return { left: footer, center: number, right: "" }
  }
  if (align === "left") {
    return { left: number, center: footer, right: "" }
  }
  return { left: "", center: footer, right: number }
}

export function programmePageStartsFromUnits(
  units: ProgrammePageUnitMeta[],
  pageCount: number,
  pageHeight: number,
  padY: number,
  gap: number,
): ProgrammePageStart[] {
  const count = Math.max(1, pageCount)
  const pages: ProgrammePageStart[] = []
  let previous: ProgrammePageStart = { chapterId: null, chapterTitle: "", startsWithChapterTitle: false }
  for (let index = 0; index < count; index += 1) {
    const pageTop = index * (pageHeight + gap) + padY
    const pageBottom = index * (pageHeight + gap) + pageHeight - padY
    const first = units.find(
      (unit) => unit.offsetTop + unit.height > pageTop + 0.5 && unit.offsetTop < pageBottom - 0.5,
    )
    if (!first) {
      pages.push({ ...previous, startsWithChapterTitle: false })
      continue
    }
    previous = {
      chapterId: first.chapterId,
      chapterTitle: first.chapterTitle,
      startsWithChapterTitle: first.isChapterTitle,
    }
    pages.push(previous)
  }
  return pages
}
