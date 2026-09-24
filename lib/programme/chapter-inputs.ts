import type { CoherenceFinding } from "@/lib/programme/coherence"
import type { ProgrammeInterest } from "@/lib/programme/interests"

type Language = "Dutch" | "English"

export function interestName(interest: Pick<ProgrammeInterest, "reference" | "label">): string {
  return interest.reference ? `${interest.reference} ${interest.label}` : interest.label
}

/** Adds the names of linked interests to each measure's free-text interests. */
export function withInterestLabels<T extends { interest_ids?: string[] | null; provincial_interests?: string[] | null }>(
  measures: T[],
  interests: ProgrammeInterest[],
): T[] {
  const byId = new Map(interests.map((interest) => [interest.id, interestName(interest)]))
  return measures.map((measure) => {
    const linked = (measure.interest_ids || []).map((id) => byId.get(id)).filter((name): name is string => Boolean(name))
    if (linked.length === 0) return measure
    const names = [...new Set([...linked, ...(measure.provincial_interests || [])])]
    return { ...measure, provincial_interests: names }
  })
}

function plainText(content: string): string {
  return content
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** The chosen interests with their work-ups, shared out over a character budget. */
export function formatInterestInputs(
  interests: ProgrammeInterest[],
  workups: Map<string, string>,
  language: Language,
  budget = 24000,
): string {
  const chosen = interests.filter((interest) => interest.selected)
  if (chosen.length === 0) return ""
  const perInterest = Math.max(1500, Math.floor(budget / chosen.length))
  const missing = language === "Dutch" ? "(nog niet uitgewerkt)" : "(not worked up yet)"
  const blocks = chosen.map((interest) => {
    const raw = workups.get(interest.id)
    const text = raw ? plainText(raw) : ""
    const body = text ? (text.length > perInterest ? `${text.slice(0, perInterest)}…` : text) : interest.summary || missing
    return `### ${interestName(interest)}\n${body}`
  })
  return [
    "CHOSEN PROVINCIAL INTERESTS AND THEIR WORK-UPS:",
    "Staff chose these interests and worked each one up from the sources. Build on them; keep their citations where you reuse a claim.",
    ...blocks,
  ].join("\n\n")
}

/** Links across interests that staff kept. */
export function formatCoherenceInputs(
  findings: CoherenceFinding[],
  interests: ProgrammeInterest[],
  measureTitles: Map<string, string>,
  language: Language,
): string {
  const kept = findings.filter((finding) => finding.decision === "keep" || finding.decision === "adapt")
  if (kept.length === 0) return ""
  const names = new Map(interests.map((interest) => [interest.id, interestName(interest)]))
  const kindLabel = {
    Dutch: { reinforces: "Versterken elkaar", shared_measure: "Gezamenlijke maatregel", dilemma: "Dilemma" },
    English: { reinforces: "Reinforce each other", shared_measure: "Shared measure", dilemma: "Dilemma" },
  }[language]
  const blocks = kept.map((finding) => {
    const lines = [`- [${kindLabel[finding.kind]}] ${finding.title}`]
    const linked = finding.interestIds.map((id) => names.get(id)).filter(Boolean)
    if (linked.length) lines.push(`  ${language === "Dutch" ? "Belangen" : "Interests"}: ${linked.join("; ")}`)
    const measures = finding.measureIds.map((id) => measureTitles.get(id)).filter(Boolean)
    if (measures.length) lines.push(`  ${language === "Dutch" ? "Maatregelen" : "Measures"}: ${measures.join("; ")}`)
    if (finding.explanation) lines.push(`  ${finding.explanation}`)
    for (const citation of finding.citations.filter((c) => c.quote).slice(0, 2)) {
      const page = citation.pageNumber ? `, p. ${citation.pageNumber}` : ""
      lines.push(`  "${citation.quote}" (documentId ${citation.documentId}${page})`)
    }
    return lines.join("\n")
  })
  return [
    "LINKS ACROSS INTERESTS (kept by staff):",
    "Use these where the chapter covers samenhang, shared measures, or choices between interests. Name dilemmas plainly and say which choice staff still have to make.",
    ...blocks,
  ].join("\n")
}
