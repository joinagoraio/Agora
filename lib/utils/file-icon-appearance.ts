export type FileGlyphType =
  | "acrobat"
  | "code"
  | "document"
  | "image"
  | "presentation"
  | "spreadsheet"
  | "vector"

export type FileIconAppearance = {
  color: string
  foldColor: string
  glyphColor: string
  type: FileGlyphType
}

/** Brand / conventional colors (react-file-icon defaults where they exist). */
const PAGE_COLORS: Record<string, { color: string; type: FileGlyphType }> = {
  pdf: { color: "#D93831", type: "acrobat" },
  doc: { color: "#2C5898", type: "document" },
  docx: { color: "#2C5898", type: "document" },
  xls: { color: "#1A754C", type: "spreadsheet" },
  xlsx: { color: "#1A754C", type: "spreadsheet" },
  csv: { color: "#1A754C", type: "spreadsheet" },
  ppt: { color: "#D14423", type: "presentation" },
  pptx: { color: "#D14423", type: "presentation" },
  txt: { color: "#607D8B", type: "document" },
  md: { color: "#0F766E", type: "document" },
  html: { color: "#E44D26", type: "code" },
  jpg: { color: "#0284C7", type: "image" },
  png: { color: "#7C3AED", type: "image" },
  gif: { color: "#C026D3", type: "image" },
  svg: { color: "#EA580C", type: "vector" },
}

const UNKNOWN: FileIconAppearance = {
  color: "#E5E7EB",
  foldColor: "#D1D5DB",
  glyphColor: "rgba(55,65,81,0.85)",
  type: "document",
}

function darkenHex(hex: string, amount = 0.14): string {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return hex
  const channel = (start: number) => {
    const value = Number.parseInt(raw.slice(start, start + 2), 16)
    return Math.max(0, Math.round(value * (1 - amount)))
      .toString(16)
      .padStart(2, "0")
  }
  return `#${channel(0)}${channel(2)}${channel(4)}`
}

function isLight(hex: string): boolean {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return false
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.72
}

export function resolveFileIconAppearance(extension: string): FileIconAppearance {
  const branded = PAGE_COLORS[extension.toLowerCase()]
  if (!branded) return UNKNOWN
  return {
    color: branded.color,
    foldColor: darkenHex(branded.color),
    glyphColor: isLight(branded.color) ? UNKNOWN.glyphColor : "rgba(255,255,255,0.92)",
    type: branded.type,
  }
}
