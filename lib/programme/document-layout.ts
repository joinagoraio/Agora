import {
  DEFAULT_PROGRAMME_PAGE_CHROME,
  parseProgrammePageChrome,
  type ProgrammePageChromeSettings,
} from "@/lib/programme/page-chrome"

const STORAGE_KEY = "agora:programme-document-layout"
const MIN_SCALE = 0.5
const MAX_SCALE = 2

export const PROGRAMME_ZOOM_PRESETS = [0.75, 0.9, 1, 1.1, 1.25, 1.5] as const

export type ProgrammeDocumentLayout = {
  wide: boolean
  scale: number
  showComments: boolean
  paged: boolean
  pageChrome: ProgrammePageChromeSettings
}

export const DEFAULT_PROGRAMME_DOCUMENT_LAYOUT: ProgrammeDocumentLayout = {
  wide: true,
  scale: 1,
  showComments: true,
  paged: false,
  pageChrome: DEFAULT_PROGRAMME_PAGE_CHROME,
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100))
}

export type ProgrammeDocumentLayoutPatch = Omit<Partial<ProgrammeDocumentLayout>, "pageChrome"> & {
  pageChrome?: Partial<ProgrammePageChromeSettings>
}

export function mergeProgrammeDocumentLayout(
  current: ProgrammeDocumentLayout,
  patch: ProgrammeDocumentLayoutPatch,
): ProgrammeDocumentLayout {
  return {
    ...current,
    ...patch,
    pageChrome: parseProgrammePageChrome({ ...current.pageChrome, ...patch.pageChrome }),
  }
}

export function readProgrammeDocumentLayout(): ProgrammeDocumentLayout {
  if (typeof window === "undefined") return DEFAULT_PROGRAMME_DOCUMENT_LAYOUT
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PROGRAMME_DOCUMENT_LAYOUT
    const parsed = JSON.parse(raw) as Partial<ProgrammeDocumentLayout>
    return {
      wide: parsed.wide !== false,
      scale: clampScale(typeof parsed.scale === "number" ? parsed.scale : 1),
      showComments: parsed.showComments !== false,
      paged: parsed.paged === true,
      pageChrome: parseProgrammePageChrome(parsed.pageChrome),
    }
  } catch {
    return DEFAULT_PROGRAMME_DOCUMENT_LAYOUT
  }
}

export function writeProgrammeDocumentLayout(layout: ProgrammeDocumentLayout) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      wide: layout.wide,
      scale: clampScale(layout.scale),
      showComments: layout.showComments !== false,
      paged: layout.paged === true,
      pageChrome: parseProgrammePageChrome(layout.pageChrome),
    }),
  )
}

export function programmeDocumentCanvasClass(layout: Pick<ProgrammeDocumentLayout, "paged">) {
  return layout.paged ? "bg-gray-100" : "bg-white"
}

export function programmeDocumentPageClass(
  layout: Pick<ProgrammeDocumentLayout, "wide" | "showComments" | "paged">,
) {
  if (layout.paged) return "relative mx-auto w-full px-4 py-8"
  if (layout.wide) {
    return [
      "relative mx-auto w-full py-8 max-w-7xl px-8 md:px-14",
      layout.showComments ? "md:pr-80" : "",
    ]
      .filter(Boolean)
      .join(" ")
  }
  if (layout.showComments) return "relative mx-auto w-full py-8"
  return "relative mx-auto w-full max-w-3xl px-8 py-8"
}

export function programmeDocumentColumnClass(
  layout: Pick<ProgrammeDocumentLayout, "wide" | "showComments" | "paged">,
) {
  if (layout.paged) return "relative mx-auto w-[210mm]"
  if (layout.wide || !layout.showComments) return "bg-white px-8 py-10"
  return "mx-auto w-full max-w-3xl bg-white px-8 py-10"
}

export function programmeCommentRailClass(layout: Pick<ProgrammeDocumentLayout, "wide" | "paged">) {
  if (layout.paged) {
    return "pointer-events-none absolute inset-y-0 w-72 left-[min(calc(50%+105mm+0.75rem),calc(100%-18.75rem))] max-md:left-auto max-md:right-0"
  }
  if (layout.wide) return "pointer-events-none absolute inset-y-0 right-0 w-72"
  return "pointer-events-none absolute inset-y-0 w-72 left-[min(calc(50%+24rem+0.75rem),calc(100%-18.75rem))] max-md:left-auto max-md:right-0"
}

export const programmeChapterProseClass =
  "text-sm text-foreground [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1"

export function programmeChapterScrollTop(
  scrollerScrollTop: number,
  scrollerClientTop: number,
  targetClientTop: number,
): number {
  return Math.max(0, scrollerScrollTop + targetClientTop - scrollerClientTop)
}

export function programmeDocumentTypeStyle(scale: number): { ["--programme-type-scale"]: string } {
  return { "--programme-type-scale": String(clampScale(scale)) }
}

export function stepProgrammeScale(scale: number, direction: 1 | -1) {
  if (direction > 0) {
    return PROGRAMME_ZOOM_PRESETS.find((preset) => preset > scale + 0.001) ?? PROGRAMME_ZOOM_PRESETS[PROGRAMME_ZOOM_PRESETS.length - 1]
  }
  return [...PROGRAMME_ZOOM_PRESETS].reverse().find((preset) => preset < scale - 0.001) ?? PROGRAMME_ZOOM_PRESETS[0]
}
