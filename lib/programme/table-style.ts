export const PROGRAMME_TABLE_BORDERS_ATTR = "data-table-borders"
export const PROGRAMME_TABLE_BORDER_MODES = ["all", "body", "none"] as const
export type ProgrammeTableBorderMode = (typeof PROGRAMME_TABLE_BORDER_MODES)[number]
export const DEFAULT_PROGRAMME_TABLE_BORDERS: ProgrammeTableBorderMode = "all"

export function parseProgrammeTableBorders(value: unknown): ProgrammeTableBorderMode {
  if (value === "body" || value === "none" || value === "all") return value
  return DEFAULT_PROGRAMME_TABLE_BORDERS
}

export function programmeTableBorderAttrs(value: unknown): { "data-table-borders": ProgrammeTableBorderMode } {
  return { [PROGRAMME_TABLE_BORDERS_ATTR]: parseProgrammeTableBorders(value) }
}

export function programmeTableHeaderHasBorders(mode: unknown) {
  return parseProgrammeTableBorders(mode) === "all"
}

export function programmeTableBodyHasBorders(mode: unknown) {
  return parseProgrammeTableBorders(mode) !== "none"
}
