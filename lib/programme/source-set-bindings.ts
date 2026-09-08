import type { DocumentRole, ProgrammeBindings } from "@/lib/programme/domain"

export const ROLE_TO_BINDING: Partial<Record<DocumentRole, keyof ProgrammeBindings>> = {
  environmental_vision: "environmentalVisionDocumentIds",
  environmental_effects_report: "environmentalEffectsReportDocumentIds",
  programme_handbook: "programmeHandbookDocumentIds",
  quality_style_rules: "qualityStyleRulesDocumentIds",
  housing_programme: "housingProgrammeDocumentIds",
  existing_policy: "existingPolicyDocumentIds",
}

const BINDING_ID_KEYS = Object.values(ROLE_TO_BINDING)

export function bindingIdsForRoles(bindings: ProgrammeBindings, roles: readonly DocumentRole[]): string[] {
  const ids = new Set<string>()
  for (const role of roles) {
    const key = ROLE_TO_BINDING[role]
    if (!key) continue
    const list = bindings[key]
    if (Array.isArray(list)) {
      for (const id of list) {
        if (typeof id === "string" && id.length > 0) ids.add(id)
      }
    }
  }
  return [...ids]
}

export function applyDocumentRoleToBindings(
  bindings: ProgrammeBindings,
  documentId: string,
  role: DocumentRole | null,
): ProgrammeBindings {
  const next: ProgrammeBindings = { ...bindings }
  for (const key of BINDING_ID_KEYS) {
    const list = next[key]
    if (Array.isArray(list)) {
      ;(next as Record<string, unknown>)[key] = list.filter((id) => id !== documentId)
    }
  }
  const target = role ? ROLE_TO_BINDING[role] : undefined
  if (target) {
    const list = (next[target] as string[]) || []
    if (!list.includes(documentId)) {
      ;(next as Record<string, unknown>)[target] = [...list, documentId]
    }
  }
  return next
}

export function isChapterDocumentId(bindings: ProgrammeBindings, documentId: string): boolean {
  return Object.values(bindings.chapterDocuments || {}).includes(documentId)
}

export function roleFromBindings(bindings: ProgrammeBindings, documentId: string): DocumentRole | null {
  for (const [role, key] of Object.entries(ROLE_TO_BINDING) as Array<[DocumentRole, keyof ProgrammeBindings]>) {
    const list = bindings[key]
    if (Array.isArray(list) && list.includes(documentId)) return role
  }
  return null
}

export function listBoundDocumentsForHelp(
  documents: Array<{ id: string; title: string; document_role?: string | null }>,
  bindings: ProgrammeBindings,
): Array<{ title: string; role: string | null }> {
  return documents
    .filter((document) => !isChapterDocumentId(bindings, document.id))
    .map((document) => ({
      title: document.title,
      role: document.document_role ?? roleFromBindings(bindings, document.id),
    }))
    .filter((document) => Boolean(document.role))
}
