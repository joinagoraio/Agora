"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"

export type GenerationRunInput = {
  workspaceId: string
  kind: "chat" | "draft" | "measures" | "analysis" | "vision" | "oer" | "qc" | "export"
  playbookVersionId?: string | null
  agentVersionId?: string | null
  provider?: string | null
  model?: string | null
  temperature?: number | null
  instructions?: string | null
  sourceDocumentIds?: string[]
  unusedDocumentIds?: string[]
  outputRef?: string | null
  citations?: unknown
  userId?: string | null
}

/**
 * Append-only audit insert. Client INSERT is denied by RLS; service role is used
 * only after workspace:update authorization (see scripts/043_rls_harden_programme.sql).
 */
export async function recordGenerationRun(input: GenerationRunInput) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("generation_runs")
    .insert({
      workspace_id: input.workspaceId,
      kind: input.kind,
      playbook_version_id: input.playbookVersionId ?? null,
      agent_version_id: input.agentVersionId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      temperature: input.temperature ?? null,
      instructions: input.instructions ?? null,
      source_document_ids: input.sourceDocumentIds ?? [],
      unused_document_ids: input.unusedDocumentIds ?? [],
      output_ref: input.outputRef ?? null,
      citations: input.citations ?? [],
      created_by: input.userId ?? user?.id ?? null,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[generation_runs] insert failed", error)
    return { error: error.message }
  }
  return { data }
}

export async function computeUnusedDocumentIds(workspaceId: string, usedIds: string[]) {
  const report = await computeUnusedSourceReport(workspaceId, usedIds)
  if (report.error) return { error: report.error, data: [] as string[] }
  const { unusedDocumentIdsFromReport } = await import("@/lib/programme/unused-sources")
  return { data: unusedDocumentIdsFromReport(report.data || []) }
}

export async function listWorkspaceCitationCatalog(workspaceId: string) {
  const supabase = await createClient()
  const [documents, sections] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, document_role")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .neq("status", "deleted"),
    supabase
      .from("document_sections")
      .select("id, document_id, title, page_number")
      .eq("workspace_id", workspaceId),
  ])
  return {
    documents: (documents.data || []).map((row) => ({
      id: row.id,
      title: row.title || row.id,
      documentRole: row.document_role ?? null,
    })),
    sections: (sections.data || []).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      pageNumber: row.page_number,
    })),
  }
}

export async function computeUnusedSourceReport(
  workspaceId: string,
  sourceDocumentIds: string[],
  citedDocumentIds: string[] = [],
  requiredRoles?: readonly string[],
) {
  const catalog = await listWorkspaceCitationCatalog(workspaceId)
  const { buildUnusedSourceReport } = await import("@/lib/programme/unused-sources")
  return {
    data: buildUnusedSourceReport({
      documents: catalog.documents,
      sourceDocumentIds,
      citedDocumentIds,
      requiredRoles,
    }),
  }
}

export async function listGenerationRuns(workspaceId: string, limit = 20) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("generation_runs")
    .select("id, kind, model, created_at, source_document_ids, unused_document_ids, output_ref, citations")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function getProgrammeObservabilityMetrics(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const [runs, jobs] = await Promise.all([
    supabase
      .from("generation_runs")
      .select("kind, model, source_document_ids, unused_document_ids, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("export_jobs")
      .select("status, format, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  if (runs.error) return { error: runs.error.message }
  if (jobs.error) return { error: jobs.error.message }

  const { computeProgrammeObservabilityMetrics } = await import("@/lib/programme/programme-metrics")
  return {
    data: computeProgrammeObservabilityMetrics({
      runs: runs.data || [],
      exportJobs: jobs.data || [],
    }),
  }
}
