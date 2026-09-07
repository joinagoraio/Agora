"use client"

import { useLayoutEffect, useState } from "react"
import {
  PROGRAMME_A4_GAP,
  PROGRAMME_A4_HEIGHT,
  PROGRAMME_A4_PAD,
  PROGRAMME_A4_WIDTH,
  applyProgrammePageExtras,
  collectProgrammePaginationUnits,
  naturalPaginationOffsets,
  programmeA4SheetTops,
  programmePagePushOffsets,
  programmePaginationChapterMeta,
  programmePaginationIsChapterTitle,
  programmePaginationKeepWithNext,
  readProgrammePageExtra,
  relativeOffsetTop,
  resetProgrammePagination,
} from "@/lib/programme/document-pagination"
import { programmePaginationEditorsComposing } from "@/lib/programme/editor-page-breaks"
import {
  programmeChromeFooterSlots,
  programmeChromeHeaderSlots,
  programmePageRunningFooter,
  programmePageRunningHeader,
  programmePageStartsFromUnits,
  type ProgrammePageChromeSettings,
  type ProgrammePageStart,
} from "@/lib/programme/page-chrome"

const PAGINATION_IDLE_MS = 120

function samePageStarts(a: ProgrammePageStart[], b: ProgrammePageStart[]) {
  if (a.length !== b.length) return false
  return a.every(
    (page, index) =>
      page.chapterId === b[index]?.chapterId &&
      page.chapterTitle === b[index]?.chapterTitle &&
      page.startsWithChapterTitle === b[index]?.startsWithChapterTitle,
  )
}

function measureA4Metrics(page: HTMLElement) {
  const probe = document.createElement("div")
  probe.setAttribute("aria-hidden", "true")
  probe.style.cssText = [
    "position:absolute",
    "left:-9999px",
    "top:0",
    `width:${PROGRAMME_A4_WIDTH}`,
    `height:${PROGRAMME_A4_HEIGHT}`,
    `padding:${PROGRAMME_A4_PAD}`,
    `margin-bottom:${PROGRAMME_A4_GAP}`,
    "pointer-events:none",
    "visibility:hidden",
  ].join(";")
  page.appendChild(probe)
  const pageHeight = probe.offsetHeight
  const padY = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0
  const gap = Number.parseFloat(getComputedStyle(probe).marginBottom) || 24
  probe.remove()
  return {
    pageHeight,
    padY,
    gap,
    pageInner: Math.max(1, pageHeight - padY * 2),
    breakExtra: padY * 2 + gap,
  }
}

export function useProgrammeA4Pagination(enabled: boolean, layoutKey: string) {
  const [pageCount, setPageCount] = useState(1)
  const [pageStarts, setPageStarts] = useState<ProgrammePageStart[]>([
    { chapterId: null, chapterTitle: "", startsWithChapterTitle: false },
  ])

  useLayoutEffect(() => {
    const page = document.getElementById("programme-document-page")
    const type = page?.querySelector<HTMLElement>("[data-programme-document-type]")
    if (!enabled || !page || !type) {
      if (type) {
        resetProgrammePagination(type)
        type.style.paddingBottom = ""
      }
      setPageCount(1)
      setPageStarts([{ chapterId: null, chapterTitle: "", startsWithChapterTitle: false }])
      return
    }

    let frame = 0
    let idle = 0
    let resizeObserver: ResizeObserver
    let mutationObserver: MutationObserver

    const apply = () => {
      if (programmePaginationEditorsComposing()) {
        schedule("idle")
        return
      }
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      const units = collectProgrammePaginationUnits(type)
      const metrics = measureA4Metrics(page)
      const applied = units.map((unit) => readProgrammePageExtra(unit))
      const measuredTops = units.map((unit) => Math.max(0, relativeOffsetTop(unit, type) - metrics.padY))
      const naturalTops = naturalPaginationOffsets(measuredTops, applied)
      const measured = units.map((unit, index) => ({
        offsetTop: naturalTops[index] ?? 0,
        height: unit.getBoundingClientRect().height,
        keepWithNext: programmePaginationKeepWithNext(unit),
      }))
      const { extras, pageCount: nextCount, lastUsed } = programmePagePushOffsets(
        measured,
        metrics.pageInner,
        metrics.breakExtra,
      )
      applyProgrammePageExtras(units, extras)
      const nextPad = `${metrics.padY + Math.max(0, metrics.pageInner - lastUsed)}px`
      if (type.style.paddingBottom !== nextPad) type.style.paddingBottom = nextPad
      const placed = collectProgrammePaginationUnits(type).map((unit) => {
        const chapter = programmePaginationChapterMeta(unit)
        return {
          offsetTop: relativeOffsetTop(unit, type),
          height: unit.getBoundingClientRect().height,
          chapterId: chapter.chapterId,
          chapterTitle: chapter.chapterTitle,
          isChapterTitle: programmePaginationIsChapterTitle(unit),
        }
      })
      const nextStarts = programmePageStartsFromUnits(placed, nextCount, metrics.pageHeight, metrics.padY, metrics.gap)
      setPageCount((current) => (current === nextCount ? current : nextCount))
      setPageStarts((current) => (samePageStarts(current, nextStarts) ? current : nextStarts))
      resizeObserver.observe(type)
      mutationObserver.observe(type, { childList: true, subtree: true, characterData: true })
    }

    const schedule = (mode: "now" | "idle") => {
      if (mode === "idle") {
        if (idle) window.clearTimeout(idle)
        idle = window.setTimeout(() => {
          idle = 0
          if (frame) return
          frame = window.requestAnimationFrame(() => {
            frame = 0
            apply()
          })
        }, PAGINATION_IDLE_MS)
        return
      }
      if (idle) {
        window.clearTimeout(idle)
        idle = 0
      }
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        apply()
      })
    }

    resizeObserver = new ResizeObserver(() => schedule("idle"))
    mutationObserver = new MutationObserver(() => schedule("idle"))
    apply()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (idle) window.clearTimeout(idle)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      resetProgrammePagination(type)
      type.style.paddingBottom = ""
    }
  }, [enabled, layoutKey])

  return { pageCount, pageStarts }
}

function ChromeLine({
  slots,
  size,
  edge,
}: {
  slots: { left: string; center: string; right: string }
  size: ProgrammePageChromeSettings["size"]
  edge: "header" | "footer"
}) {
  if (!slots.left && !slots.center && !slots.right) return null
  if (edge === "header") {
    const label = slots.center || slots.left || slots.right
    return (
      <div className="programme-a4-chrome" data-programme-a4-chrome="header" data-size={size}>
        <span data-programme-chrome-slot="center">{label}</span>
      </div>
    )
  }
  return (
    <div className="programme-a4-chrome" data-programme-a4-chrome="footer" data-size={size}>
      <span data-programme-chrome-slot="left" className="min-w-0 truncate text-left">
        {slots.left}
      </span>
      <span data-programme-chrome-slot="center" className="min-w-0 truncate text-center">
        {slots.center}
      </span>
      <span data-programme-chrome-slot="right" className="min-w-0 truncate text-right">
        {slots.right}
      </span>
    </div>
  )
}

type SheetsProps = {
  pageCount: number
  pageStarts: ProgrammePageStart[]
  programmeName: string
  chrome: ProgrammePageChromeSettings
}

export function ProgrammeA4Sheets({ pageCount, pageStarts, programmeName, chrome }: SheetsProps) {
  const [tops, setTops] = useState<number[]>([0])

  useLayoutEffect(() => {
    const page = document.getElementById("programme-document-page")
    if (!page) return
    const metrics = measureA4Metrics(page)
    setTops(programmeA4SheetTops(pageCount, metrics.pageHeight, metrics.gap))
  }, [pageCount])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0" data-programme-a4-sheets>
      {tops.map((top, index) => {
        const start = pageStarts[index] ?? {
          chapterId: null,
          chapterTitle: "",
          startsWithChapterTitle: false,
        }
        const header = programmePageRunningHeader(start, chrome)
        const footer = programmePageRunningFooter(programmeName, chrome)
        return (
          <div
            key={index}
            data-programme-a4-sheet
            data-programme-page={index + 1}
            data-programme-header-chapter={start.chapterId || undefined}
            data-programme-header-suppressed={start.startsWithChapterTitle ? "" : undefined}
            className="programme-a4-sheet bg-white shadow-lg"
            style={{ top }}
          >
            <ChromeLine slots={programmeChromeHeaderSlots(header)} size={chrome.size} edge="header" />
            <ChromeLine
              slots={programmeChromeFooterSlots(index, index + 1, footer, chrome.pageNumbers)}
              size={chrome.size}
              edge="footer"
            />
          </div>
        )
      })}
    </div>
  )
}

