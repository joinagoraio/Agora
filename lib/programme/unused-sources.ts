import { PRIVILEGED_DOCUMENT_ROLES, type DocumentRole } from "@/lib/programme/domain"

export type UnusedSourceKind = "excluded" | "not_cited" | "should_have_used"

export type UnusedSource = {
  id: string
  title: string
  role: string | null
  kind: UnusedSourceKind
}

export type UnusedSourceDocument = {
  id: string
  title: string
  documentRole?: string | null
}

const ROLE_HINTS: Partial<Record<DocumentRole, string>> = {
  environmental_vision: "Bind or include the environmental vision",
  environmental_effects_report: "Bind or include the environmental effects report",
  programme_handbook: "Bind or include the programme handbook",
  quality_style_rules: "Bind or include the quality and style rules",
  housing_programme: "Bind or include the housing programme",
  existing_policy: "Include existing-policy sources",
}

export function buildUnusedSourceReport(input: {
  documents: UnusedSourceDocument[]
  sourceDocumentIds: string[]
  citedDocumentIds?: string[]
  requiredRoles?: readonly string[]
}): UnusedSource[] {
  const sourceIds = new Set(input.sourceDocumentIds)
  const cited = new Set(input.citedDocumentIds || [])
  const out: UnusedSource[] = []

  for (const document of input.documents) {
    if (!sourceIds.has(document.id)) {
      out.push({
        id: document.id,
        title: document.title,
        role: document.documentRole ?? null,
        kind: "excluded",
      })
      continue
    }
    if (cited.size > 0 && !cited.has(document.id)) {
      out.push({
        id: document.id,
        title: document.title,
        role: document.documentRole ?? null,
        kind: "not_cited",
      })
    }
  }

  const presentRoles = new Set(
    input.documents.filter((document) => sourceIds.has(document.id)).map((document) => document.documentRole),
  )
  const required = input.requiredRoles || PRIVILEGED_DOCUMENT_ROLES
  for (const role of required) {
    if (presentRoles.has(role)) continue
    out.push({
      id: `role:${role}`,
      title: ROLE_HINTS[role as DocumentRole] || role,
      role,
      kind: "should_have_used",
    })
  }

  return out
}

export function unusedDocumentIdsFromReport(report: UnusedSource[]): string[] {
  return report.filter((item) => item.kind !== "should_have_used").map((item) => item.id)
}
