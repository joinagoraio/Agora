import { jaccardSimilarity, tokenizeConsultationText } from "@/lib/programme/consultation-cluster"

export const COHERENCE_KINDS = ["dilemma", "reinforces", "shared_measure"] as const
export type CoherenceKind = (typeof COHERENCE_KINDS)[number]

export type CoherenceCitation = { documentId: string; pageNumber?: number; sectionId?: string; quote?: string }

export type CoherenceFinding = {
  id: string
  kind: CoherenceKind
  title: string
  explanation: string | null
  interestIds: string[]
  measureIds: string[]
  citations: CoherenceCitation[]
  origin: "model" | "signal"
  decision: "keep" | "adapt" | "drop" | null
  decisionReason: string | null
  decidedAt: string | null
}

export type CoherenceDraft = Omit<CoherenceFinding, "id" | "decision" | "decisionReason" | "decidedAt">

type MeasureLike = {
  id: string
  title: string
  specific_action?: string | null
  interest_ids?: string[] | null
  decision?: string | null
}

type InterestLike = { id: string; reference: string | null; label: string }

export function mapCoherenceRow(row: Record<string, unknown>): CoherenceFinding {
  const kind = COHERENCE_KINDS.includes(row.kind as CoherenceKind) ? (row.kind as CoherenceKind) : "reinforces"
  const decision = row.decision === "keep" || row.decision === "adapt" || row.decision === "drop" ? row.decision : null
  return {
    id: String(row.id),
    kind,
    title: String(row.title || ""),
    explanation: typeof row.explanation === "string" ? row.explanation : null,
    interestIds: Array.isArray(row.interest_ids) ? (row.interest_ids as string[]) : [],
    measureIds: Array.isArray(row.measure_ids) ? (row.measure_ids as string[]) : [],
    citations: Array.isArray(row.citations) ? (row.citations as CoherenceCitation[]) : [],
    origin: row.origin === "signal" ? "signal" : "model",
    decision,
    decisionReason: typeof row.decision_reason === "string" ? row.decision_reason : null,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
  }
}

const SIGNAL_TEXT = {
  Dutch: {
    servesTitle: (count: number, names: string) => `${count === 1 ? "1 maatregel dient" : `${count} maatregelen dienen`} ${names}`,
    serves: (count: number) => (count === 1 ? "Deze maatregel dient de genoemde belangen tegelijk:" : "Deze maatregelen dienen de genoemde belangen tegelijk:"),
    similarTitle: (title: string) => `Mogelijk één gezamenlijke maatregel: ${title}`,
    similar: "Deze maatregelen onder verschillende belangen lijken sterk op elkaar en kunnen mogelijk worden samengevoegd:",
    and: " en ",
  },
  English: {
    servesTitle: (count: number, names: string) => `${count === 1 ? "1 measure serves" : `${count} measures serve`} ${names}`,
    serves: (count: number) => (count === 1 ? "This measure serves the named interests at once:" : "These measures serve the named interests at once:"),
    similarTitle: (title: string) => `Possibly one joint measure: ${title}`,
    similar: "These measures under different interests are very alike and could be merged:",
    and: " and ",
  },
} as const

function joinNames(names: string[], and: string) {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")}${and}${names[names.length - 1]}`
}

/** Links that follow from the measures themselves, grouped so each is one decision for staff. */
export function coherenceSignals(
  measures: MeasureLike[],
  selectedInterests: InterestLike[],
  language: "Dutch" | "English",
): CoherenceDraft[] {
  const text = SIGNAL_TEXT[language]
  const order = new Map(selectedInterests.map((interest, index) => [interest.id, index]))
  const shortName = new Map(selectedInterests.map((interest) => [interest.id, interest.reference || interest.label]))
  const active = measures.filter((measure) => measure.decision !== "drop")
  const linkedOf = (measure: MeasureLike) =>
    [...new Set((measure.interest_ids || []).filter((id) => order.has(id)))].sort((a, b) => order.get(a)! - order.get(b)!)
  const drafts: CoherenceDraft[] = []

  const bySet = new Map<string, { interestIds: string[]; measures: MeasureLike[] }>()
  for (const measure of active) {
    const linked = linkedOf(measure)
    if (linked.length < 2) continue
    const key = linked.join("|")
    const group = bySet.get(key) || { interestIds: linked, measures: [] }
    group.measures.push(measure)
    bySet.set(key, group)
  }
  for (const group of bySet.values()) {
    const names = joinNames(group.interestIds.map((id) => shortName.get(id) || ""), text.and)
    drafts.push({
      kind: "shared_measure",
      title: text.servesTitle(group.measures.length, names),
      explanation: `${text.serves(group.measures.length)} ${group.measures.map((measure) => measure.title).join("; ")}.`,
      interestIds: group.interestIds,
      measureIds: group.measures.map((measure) => measure.id),
      citations: [],
      origin: "signal",
    })
  }

  const tokens = new Map(active.map((measure) => [measure.id, tokenizeConsultationText(`${measure.title} ${measure.specific_action || ""}`)]))
  const parent = new Map(active.map((measure) => [measure.id, measure.id]))
  const root = (id: string): string => {
    const next = parent.get(id)!
    if (next === id) return id
    const top = root(next)
    parent.set(id, top)
    return top
  }
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i]!
      const right = active[j]!
      const leftInterests = linkedOf(left)
      const rightInterests = linkedOf(right)
      if (leftInterests.length === 0 || rightInterests.length === 0) continue
      if (leftInterests.join("|") === rightInterests.join("|")) continue
      if (jaccardSimilarity(tokens.get(left.id) || [], tokens.get(right.id) || []) < 0.3) continue
      parent.set(root(left.id), root(right.id))
    }
  }
  const clusters = new Map<string, MeasureLike[]>()
  for (const measure of active) {
    const key = root(measure.id)
    clusters.set(key, [...(clusters.get(key) || []), measure])
  }
  for (const cluster of clusters.values()) {
    if (cluster.length < 2) continue
    const interestIds = [...new Set(cluster.flatMap(linkedOf))].sort((a, b) => order.get(a)! - order.get(b)!)
    if (interestIds.length < 2) continue
    drafts.push({
      kind: "shared_measure",
      title: text.similarTitle(cluster[0]!.title),
      explanation: `${text.similar} ${cluster.map((measure) => measure.title).join("; ")}.`,
      interestIds,
      measureIds: cluster.map((measure) => measure.id),
      citations: [],
      origin: "signal",
    })
  }
  return drafts
}

/** Read the model's JSON into findings, linking interests by the vision's own numbers. */
export function parseCoherenceJson(
  raw: string,
  interests: InterestLike[],
  measureIds: Set<string>,
): CoherenceDraft[] {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return []
  let parsed: { findings?: Array<Record<string, unknown>> }
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  return (parsed.findings || []).flatMap((row) => {
    const kind = COHERENCE_KINDS.find((value) => value === row.kind)
    const title = typeof row.title === "string" ? row.title.trim() : ""
    if (!kind || !title) return []
    const refs = Array.isArray(row.interests) ? row.interests.map((value) => String(value).trim()) : []
    const interestIds = [
      ...new Set(
        refs
          .map((ref) => {
            const number = ref.match(/\d{1,3}/)?.[0]
            return interests.find((interest) => interest.reference === number || interest.label === ref)?.id
          })
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    if (interestIds.length < 2 && kind !== "shared_measure") return []
    const ids = Array.isArray(row.measureIds) ? row.measureIds.map(String).filter((id) => measureIds.has(id)) : []
    const citations = Array.isArray(row.citations)
      ? row.citations.flatMap((item) => {
          if (!item || typeof item !== "object") return []
          const citation = item as Record<string, unknown>
          if (typeof citation.documentId !== "string") return []
          return [
            {
              documentId: citation.documentId,
              pageNumber: typeof citation.pageNumber === "number" ? citation.pageNumber : undefined,
              sectionId: typeof citation.sectionId === "string" ? citation.sectionId : undefined,
              quote: typeof citation.quote === "string" ? citation.quote : undefined,
            },
          ]
        })
      : []
    return [
      {
        kind,
        title,
        explanation: typeof row.explanation === "string" ? row.explanation.trim() : null,
        interestIds,
        measureIds: ids,
        citations,
        origin: "model" as const,
      },
    ]
  })
}

export type PairCounts = Record<CoherenceKind, number>

/** How many kept or undecided findings link each pair of interests. */
export function coherencePairCounts(findings: CoherenceFinding[]): Map<string, PairCounts> {
  const counts = new Map<string, PairCounts>()
  for (const finding of findings) {
    if (finding.decision === "drop") continue
    const ids = [...new Set(finding.interestIds)].sort()
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`
        const current = counts.get(key) || { reinforces: 0, shared_measure: 0, dilemma: 0 }
        current[finding.kind] += 1
        counts.set(key, current)
      }
    }
  }
  return counts
}

export function pairKey(a: string, b: string) {
  return [a, b].sort().join("|")
}
