import { jaccardSimilarity, tokenizeConsultationText } from "@/lib/programme/consultation-cluster"
import type { AnalysisFinding } from "@/lib/programme/structured-artefacts"

export const MEASURE_NEAR_DUPLICATE_THRESHOLD = 0.34

export type MeasureDupInput = {
  id: string
  title: string
  specificAction?: string | null
  narrative?: string | null
  outlineNodeId?: string | null
}

export type DuplicateGroup = {
  keepId: string
  dropIds: string[]
  score: number
  reason: "exact_title" | "near_duplicate" | "cross_chapter"
  members: MeasureDupInput[]
}

function measureTokens(measure: MeasureDupInput): string[] {
  return tokenizeConsultationText(`${measure.title} ${measure.specificAction || ""} ${measure.narrative || ""}`)
}

function exactTitleKey(title: string): string {
  return title.trim().toLowerCase()
}

export function findNearDuplicateMeasureGroups(
  measures: MeasureDupInput[],
  threshold = MEASURE_NEAR_DUPLICATE_THRESHOLD,
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const used = new Set<string>()

  const byTitle = new Map<string, MeasureDupInput[]>()
  for (const measure of measures) {
    const key = exactTitleKey(measure.title)
    const list = byTitle.get(key) || []
    list.push(measure)
    byTitle.set(key, list)
  }
  for (const list of byTitle.values()) {
    if (list.length < 2) continue
    const keep = list[0]!
    const dropIds = list.slice(1).map((item) => item.id)
    for (const item of list) used.add(item.id)
    const crossChapter = new Set(list.map((item) => item.outlineNodeId || "")).size > 1
    groups.push({
      keepId: keep.id,
      dropIds,
      score: 1,
      reason: crossChapter ? "cross_chapter" : "exact_title",
      members: list,
    })
  }

  for (let i = 0; i < measures.length; i += 1) {
    const left = measures[i]!
    if (used.has(left.id)) continue
    const cluster = [left]
    for (let j = i + 1; j < measures.length; j += 1) {
      const right = measures[j]!
      if (used.has(right.id)) continue
      const score = jaccardSimilarity(measureTokens(left), measureTokens(right))
      if (score >= threshold) cluster.push(right)
    }
    if (cluster.length < 2) continue
    for (const item of cluster) used.add(item.id)
    const crossChapter = new Set(cluster.map((item) => item.outlineNodeId || "")).size > 1
    const score = jaccardSimilarity(measureTokens(cluster[0]!), measureTokens(cluster[1]!))
    groups.push({
      keepId: cluster[0]!.id,
      dropIds: cluster.slice(1).map((item) => item.id),
      score: Number(score.toFixed(3)),
      reason: crossChapter ? "cross_chapter" : "near_duplicate",
      members: cluster,
    })
  }

  return groups
}

export function overlapFindingsFromMeasures(measures: MeasureDupInput[]): AnalysisFinding[] {
  return findNearDuplicateMeasureGroups(measures).map((group, index) => ({
    id: `overlap-${index + 1}`,
    disposition: "adapt",
    summary: `Overlapping measures: ${group.members.map((item) => item.title).join(" / ")}`,
    measureId: group.keepId,
    citations: [],
  }))
}
