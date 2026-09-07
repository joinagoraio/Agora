export const PROGRAMME_LINE_HEIGHTS = ["1", "1.15", "1.5", "2", "2.5", "3"] as const
export type ProgrammeLineHeight = (typeof PROGRAMME_LINE_HEIGHTS)[number]
export const DEFAULT_PROGRAMME_LINE_HEIGHT: ProgrammeLineHeight = "1.5"

export const PROGRAMME_SPACE_AFTER = ["0", "6", "8", "12", "18", "24"] as const
export type ProgrammeSpaceAfter = (typeof PROGRAMME_SPACE_AFTER)[number]
export const DEFAULT_PROGRAMME_SPACE_AFTER: ProgrammeSpaceAfter = "8"

export const PROGRAMME_LINE_HEIGHT_ATTR = "data-line-height"
export const PROGRAMME_SPACE_AFTER_ATTR = "data-space-after"

const LINE_HEIGHT_SET = new Set<string>(PROGRAMME_LINE_HEIGHTS)
const SPACE_AFTER_SET = new Set<string>(PROGRAMME_SPACE_AFTER)

function nearestLineHeight(value: number): ProgrammeLineHeight {
  let best: ProgrammeLineHeight = DEFAULT_PROGRAMME_LINE_HEIGHT
  let delta = Number.POSITIVE_INFINITY
  for (const preset of PROGRAMME_LINE_HEIGHTS) {
    const gap = Math.abs(Number(preset) - value)
    if (gap < delta) {
      best = preset
      delta = gap
    }
  }
  return best
}

export function parseProgrammeLineHeight(value: unknown): ProgrammeLineHeight | null {
  if (value == null || value === "") return null
  const raw = String(value).trim().toLowerCase()
  if (raw === "default" || raw === "normal") return null
  if (raw === "single") return "1"
  if (raw === "double") return "2"
  if (raw === "triple") return "3"
  if (LINE_HEIGHT_SET.has(raw)) return raw as ProgrammeLineHeight
  const numeric = Number.parseFloat(raw)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  if (raw.endsWith("%")) return nearestLineHeight(numeric / 100)
  return nearestLineHeight(numeric)
}

export function parseProgrammeSpaceAfter(value: unknown): ProgrammeSpaceAfter | null {
  if (value == null || value === "") return null
  const raw = String(value).trim().toLowerCase()
  if (raw === "default" || raw === "normal") return null
  if (raw === "none") return "0"
  const numeric = Number.parseFloat(raw)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  const pt = raw.endsWith("em") ? numeric * 12 : numeric
  let best: ProgrammeSpaceAfter = DEFAULT_PROGRAMME_SPACE_AFTER
  let delta = Number.POSITIVE_INFINITY
  for (const preset of PROGRAMME_SPACE_AFTER) {
    const gap = Math.abs(Number(preset) - pt)
    if (gap < delta) {
      best = preset
      delta = gap
    }
  }
  return SPACE_AFTER_SET.has(String(best)) ? best : null
}

export function programmeLineHeightAttrs(value: unknown): Record<string, string> {
  const parsed = parseProgrammeLineHeight(value)
  return parsed ? { [PROGRAMME_LINE_HEIGHT_ATTR]: parsed } : {}
}

export function programmeSpaceAfterAttrs(value: unknown): Record<string, string> {
  const parsed = parseProgrammeSpaceAfter(value)
  return parsed ? { [PROGRAMME_SPACE_AFTER_ATTR]: parsed } : {}
}
