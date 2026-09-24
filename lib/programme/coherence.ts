import { jaccardSimilarity, tokenizeConsultationText } from "@/lib/programme/consultation-cluster"

export const COHERENCE_KINDS = ["reinforces", "shared_measure", "dilemma"] as const
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
    serves: "Deze maatregel dient meerdere belangen tegelijk.",
    similar: "Vergelijkbare maatregelen onder verschillende belangen; mogelijk één gezamenlijke maatregel.",
  },
  English: {
    serves: "This measure serves several interests at once.",
    similar: "Similar measures under different interests; possibly one joint measure.",
  },
} as const

/** Links that follow from the measures themselves, before any model reads them. */
export function coherenceSignals(
  measures: MeasureLike[],
  selectedInterestIds: string[],
  language: "Dutch" | "English",
): CoherenceDraft[] {
  const selected = new Set(selectedInterestIds)
  const active = measures.filter((measure) => measure.decision !== "drop")
  const drafts: CoherenceDraft[] = []

  for (const measure of active) {
    const interests = (measure.interest_ids || []).filter((id) => selected.has(id))
    if (interests.length < 2) continue
    drafts.push({
      kind: "shared_measure",
      title: measure.title,
      explanation: SIGNAL_TEXT[language].serves,
      interestIds: interests,
      measureIds: [measure.id],
      citations: [],
      origin: "signal",
    })
  }

  const tokens = new Map(active.map((measure) => [measure.id, tokenizeConsultationText(`${measure.title} ${measure.specific_action || ""}`)]))
  const seen = new Set<string>()
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i]!
      const right = active[j]!
      const leftInterests = (left.interest_ids || []).filter((id) => selected.has(id))
      const rightInterests = (right.interest_ids || []).filter((id) => selected.has(id))
      if (leftInterests.length === 0 || rightInterests.length === 0) continue
      const union = [...new Set([...leftInterests, ...rightInterests])]
      if (union.length < 2 || leftInterests.every((id) => rightInterests.includes(id))) continue
      const score = jaccardSimilarity(tokens.get(left.id) || [], tokens.get(right.id) || [])
      if (score < 0.3) continue
      const key = [left.id, right.id].sort().join("|")
      if (seen.has(key)) continue
      seen.add(key)
      drafts.push({
        kind: "shared_measure",
        title: `${left.title} / ${right.title}`,
        explanation: SIGNAL_TEXT[language].similar,
        interestIds: union,
        measureIds: [left.id, right.id],
        citations: [],
        origin: "signal",
      })
    }
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
