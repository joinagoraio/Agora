const STORAGE_KEY = "agora:programme-document-layout"
const MIN_SCALE = 0.5
const MAX_SCALE = 2

export const PROGRAMME_ZOOM_PRESETS = [0.75, 0.9, 1, 1.1, 1.25, 1.5] as const

export type ProgrammeDocumentLayout = {
  wide: boolean
  scale: number
}

export const DEFAULT_PROGRAMME_DOCUMENT_LAYOUT: ProgrammeDocumentLayout = {
  wide: true,
  scale: 1,
}

function clampScale(value: number) {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100))
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
    }
  } catch {
    return DEFAULT_PROGRAMME_DOCUMENT_LAYOUT
  }
}

export function writeProgrammeDocumentLayout(layout: ProgrammeDocumentLayout) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ wide: layout.wide, scale: clampScale(layout.scale) }),
  )
}

export function stepProgrammeScale(scale: number, direction: 1 | -1) {
  if (direction > 0) {
    return PROGRAMME_ZOOM_PRESETS.find((preset) => preset > scale + 0.001) ?? PROGRAMME_ZOOM_PRESETS[PROGRAMME_ZOOM_PRESETS.length - 1]
  }
  return [...PROGRAMME_ZOOM_PRESETS].reverse().find((preset) => preset < scale - 0.001) ?? PROGRAMME_ZOOM_PRESETS[0]
}
