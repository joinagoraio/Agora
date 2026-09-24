export const MEASURE_PRIORITIES = ["high", "medium", "low"] as const
export type MeasurePriority = (typeof MEASURE_PRIORITIES)[number]

export function parseMeasurePriority(value: unknown): MeasurePriority | null {
  return MEASURE_PRIORITIES.includes(value as MeasurePriority) ? (value as MeasurePriority) : null
}

const RANK: Record<MeasurePriority, number> = { high: 0, medium: 1, low: 2 }

/** High first, then medium, low, and measures without a priority; otherwise the original order. */
export function byPriority<T extends { priority?: unknown }>(measures: T[]): T[] {
  return measures
    .map((measure, index) => ({ measure, index }))
    .sort((a, b) => {
      const left = parseMeasurePriority(a.measure.priority)
      const right = parseMeasurePriority(b.measure.priority)
      const diff = (left ? RANK[left] : 3) - (right ? RANK[right] : 3)
      return diff || a.index - b.index
    })
    .map((entry) => entry.measure)
}
