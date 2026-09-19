import type { AnalysisFinding } from "@/lib/programme/structured-artefacts"
import type { ProgrammeBindings } from "@/lib/programme/domain"

export type SourceDocumentLike = {
  id: string
  title: string
  content: string
  documentRole: string | null
}

export type SourceSection = {
  id: string
  documentId: string
  title: string
  pageNumber: number
  startOffset: number
}

export function findingCompareKey(finding: Pick<AnalysisFinding, "disposition" | "summary">): string {
  return `${finding.disposition}|${finding.summary.slice(0, 80)}`
}

export function diffAnalysisFindings(a: AnalysisFinding[], b: AnalysisFinding[]) {
  const aKeys = new Set(a.map(findingCompareKey))
  const bKeys = new Set(b.map(findingCompareKey))
  return {
    onlyA: a.filter((finding) => !bKeys.has(findingCompareKey(finding))),
    onlyB: b.filter((finding) => !aKeys.has(findingCompareKey(finding))),
    shared: a.filter((finding) => bKeys.has(findingCompareKey(finding))),
  }
}

export function formatSectionEvidenceReport(
  documents: SourceDocumentLike[],
  sections: SourceSection[],
  maxCharsPerSection = 1200,
  maxSections = 40,
): { text: string; used: number; total: number } {
  if (sections.length === 0) {
    const selected = documents.slice(0, maxSections)
    return {
      text: selected
        .map((document) => {
          const body = (document.content || "").replace(/<[^>]+>/g, " ").slice(0, 4000)
          return `### ${document.title} (id=${document.id})\n${body}`
        })
        .join("\n\n"),
      used: selected.length,
      total: documents.length,
    }
  }
  const byDoc = new Map(documents.map((document) => [document.id, document]))
  const selected = sections.slice(0, maxSections)
  return {
    text: selected
      .map((section) => {
        const document = byDoc.get(section.documentId)
        const body = (document?.content || "")
          .replace(/<[^>]+>/g, " ")
          .slice(Math.max(0, section.startOffset), Math.max(0, section.startOffset) + maxCharsPerSection)
        return `### ${document?.title || section.documentId} § ${section.title} (id=${section.documentId} sectionId=${section.id} p.${section.pageNumber})\n${body}`
      })
      .join("\n\n"),
    used: selected.length,
    total: sections.length,
  }
}

export function formatSectionEvidence(
  documents: SourceDocumentLike[],
  sections: SourceSection[],
  maxCharsPerSection = 1200,
  maxSections = 40,
): string {
  return formatSectionEvidenceReport(documents, sections, maxCharsPerSection, maxSections).text
}

export function preflightAnalysisRun(input: {
  kind: "analysis" | "vision" | "oer" | "qc"
  agentId: string | null | undefined
  bindings: ProgrammeBindings
  documents: SourceDocumentLike[]
}): { ok: true } | { ok: false; reason: string } {
  if (!input.agentId) return { ok: false, reason: "Bind an agent for this stage first" }
  if (input.documents.length === 0) return { ok: false, reason: "The bound agent has no source documents" }
  if (input.kind === "analysis") {
    const hasVision =
      input.documents.some((document) => document.documentRole === "environmental_vision") ||
      input.bindings.environmentalVisionDocumentIds.length > 0
    const hasPolicy =
      input.documents.some((document) => document.documentRole === "existing_policy") ||
      input.bindings.existingPolicyDocumentIds.length > 0
    if (!hasVision) return { ok: false, reason: "Bind at least one environmental vision document" }
    if (!hasPolicy) return { ok: false, reason: "Bind at least one existing-policy document" }
  }
  return { ok: true }
}

export function conflictFindings(findings: AnalysisFinding[]): AnalysisFinding[] {
  return findings.filter((finding) => Boolean(finding.conflictWithDocumentId))
}

export function applyFindingAddressed(
  findings: AnalysisFinding[],
  findingId: string,
  addressed: boolean,
): AnalysisFinding[] {
  return findings.map((finding) => (finding.id === findingId ? { ...finding, addressed } : finding))
}

export function matchFindingToMeasure(
  finding: AnalysisFinding,
  measures: Array<{ id: string; title: string }>,
): { id: string; title: string } | undefined {
  if (finding.measureId) {
    const byId = measures.find((measure) => measure.id === finding.measureId)
    if (byId) return byId
  }
  const summary = finding.summary.toLowerCase()
  return measures.find(
    (measure) => measure.id === finding.id || summary.includes(measure.title.toLowerCase()) || measure.title.toLowerCase() === summary,
  )
}

export type SnapshotDiffEntry = {
  path: string
  before: string
  after: string
}

export function diffSnapshots(before: unknown, after: unknown, path = ""): SnapshotDiffEntry[] {
  if (before === after) return []
  if (before && after && typeof before === "object" && typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)])
    const entries: SnapshotDiffEntry[] = []
    for (const key of keys) {
      entries.push(
        ...diffSnapshots(
          (before as Record<string, unknown>)[key],
          (after as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key,
        ),
      )
    }
    return entries
  }
  const toText = (value: unknown) => {
    if (value == null) return ""
    return typeof value === "string" ? value : JSON.stringify(value)
  }
  const left = toText(before)
  const right = toText(after)
  if (left === right) return []
  return [{ path: path || "value", before: left, after: right }]
}
