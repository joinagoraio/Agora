import { byPriority } from "@/lib/programme/measure-priority"

export const MEASURE_SORTS = ["priority", "decision", "chapter", "newest"] as const
export type MeasureSort = (typeof MEASURE_SORTS)[number]

export const MEASURE_FILTERS = ["all", "undecided", "kept", "dropped"] as const
export type MeasureFilter = (typeof MEASURE_FILTERS)[number]

type MeasureLike = {
  priority?: unknown
  decision?: string | null
  outline_node_id?: string | null
  created_at?: string | null
}

const DECISION_ORDER: Record<string, number> = { adapt: 1, keep: 2, drop: 3 }

export function sortAndFilterMeasures<T extends MeasureLike>(
  measures: T[],
  options: { sort: MeasureSort; filter: MeasureFilter; chapterOrder: string[] },
): T[] {
  const filtered = measures.filter((measure) => {
    if (options.filter === "undecided") return !measure.decision
    if (options.filter === "kept") return measure.decision === "keep" || measure.decision === "adapt"
    if (options.filter === "dropped") return measure.decision === "drop"
    return true
  })
  if (options.sort === "priority") {
    const active = byPriority(filtered.filter((measure) => measure.decision !== "drop"))
    return [...active, ...filtered.filter((measure) => measure.decision === "drop")]
  }
  const indexed = filtered.map((measure, index) => ({ measure, index }))
  const rank = (measure: T) => {
    if (options.sort === "decision") return measure.decision ? DECISION_ORDER[measure.decision] ?? 4 : 0
    if (options.sort === "chapter") {
      const position = options.chapterOrder.indexOf(measure.outline_node_id || "")
      return position < 0 ? options.chapterOrder.length : position
    }
    return -new Date(measure.created_at || 0).getTime()
  }
  return indexed
    .sort((a, b) => rank(a.measure) - rank(b.measure) || a.index - b.index)
    .map((entry) => entry.measure)
}
