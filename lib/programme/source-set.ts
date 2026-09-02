import { createClient } from "@/lib/supabase/server"
import type { AgentVersionRecord, ProgrammeBindings } from "@/lib/programme/domain"
import { bindingIdsForRoles } from "@/lib/programme/source-set-bindings"

export type SourceDocument = {
  id: string
  title: string
  content: string
  documentRole: string | null
}

export {
  ROLE_TO_BINDING,
  applyDocumentRoleToBindings,
  bindingIdsForRoles,
  isChapterDocumentId,
} from "@/lib/programme/source-set-bindings"

export async function resolveAgentSourceDocuments(input: {
  workspaceId: string
  version: AgentVersionRecord | null
  bindings: ProgrammeBindings
}): Promise<{ documents: SourceDocument[]; sourceIds: string[] }> {
  const supabase = await createClient()
  const wanted = new Set<string>()
  const roles = input.version?.sourceRoles || []

  if (input.version) {
    for (const id of input.version.sourceDocumentIds) wanted.add(id)
    for (const id of bindingIdsForRoles(input.bindings, roles)) wanted.add(id)
  }

  const base = () =>
    supabase
      .from("documents")
      .select("id, title, content, document_role")
      .eq("workspace_id", input.workspaceId)
      .neq("status", "archived")
      .neq("status", "deleted")

  type DocumentRow = { id: string; title: string | null; content: string | null; document_role: string | null }
  const empty = Promise.resolve({ data: [] as DocumentRow[] })
  const byId = wanted.size > 0 ? base().in("id", [...wanted]).limit(40) : empty
  const byRole = roles.length > 0 ? base().in("document_role", roles).limit(40) : empty

  const [idResult, roleResult] = await Promise.all([byId, byRole])
  const merged = new Map<string, DocumentRow>()
  for (const row of [...(idResult.data || []), ...(roleResult.data || [])]) {
    merged.set(row.id, {
      id: String(row.id),
      title: row.title ?? null,
      content: row.content ?? null,
      document_role: "document_role" in row ? row.document_role ?? null : null,
    })
  }
  const data = [...merged.values()].slice(0, 40)
  const documents: SourceDocument[] = (data || []).map((row) => ({
    id: row.id,
    title: row.title || row.id,
    content: typeof row.content === "string" ? row.content : "",
    documentRole: row.document_role ?? null,
  }))
  return { documents, sourceIds: documents.map((d) => d.id) }
}

export function formatSourcePreview(documents: SourceDocument[]): string {
  if (documents.length === 0) return "(no sources in agent set)"
  return documents.map((d) => `- ${d.title} [${d.id}]${d.documentRole ? ` (${d.documentRole})` : ""}`).join("\n")
}

export function formatSourceEvidence(documents: SourceDocument[], maxChars = 4000): string {
  return documents
    .map((d) => {
      const body = (d.content || "").replace(/<[^>]+>/g, " ").slice(0, maxChars)
      return `### ${d.title} (id=${d.id})\n${body}`
    })
    .join("\n\n")
}
