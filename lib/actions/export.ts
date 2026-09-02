"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { buildDocxFromSections, markdownToExportSections } from "@/lib/export/markdown-to-docx"
import { markdownToPrintHtml } from "@/lib/export/markdown-to-print-html"
import { recordGenerationRun } from "@/lib/actions/generation-run"

const CLASSIFICATION_RANK = { public: 0, internal: 1, confidential: 2 } as const

export type ProgrammeExportFormat = "docx" | "pdf" | "markdown" | "json"

export async function createExportJob(
  workspaceId: string,
  format: "docx" | "pdf" | "markdown" | "json" | "audit_package",
  classificationMax: "public" | "internal" | "confidential" = "internal",
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("export_jobs")
    .insert({
      workspace_id: workspaceId,
      format,
      status: "pending",
      classification_max: classificationMax,
      created_by: user?.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

/**
 * Export programme narrative as markdown, DOCX (base64), or print-ready HTML (for Save as PDF).
 */
export async function composeWorkspaceProgramme(workspaceId: string, title: string) {
  const { parseProgrammeBindings } = await import("@/lib/programme/domain")
  const { listProgrammeOutlineNodes } = await import("@/lib/actions/outline")
  const { listProgrammeMeasures } = await import("@/lib/actions/measures")
  const { composeProgrammeMarkdown, composeCitationGraph } = await import("@/lib/export/compose-programme")
  const supabase = await createClient()
  const { data: workspace } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  const bindings = parseProgrammeBindings((workspace?.metadata as Record<string, unknown>) || {})
  const nodes = bindings.templateId ? (await listProgrammeOutlineNodes(bindings.templateId)).data : []
  const measures = (await listProgrammeMeasures(workspaceId)).data || []
  const chapters = []
  for (const node of nodes) {
    const docId = bindings.chapterDocuments?.[node.id]
    if (!docId) continue
    const { data: doc } = await supabase.from("documents").select("title, content").eq("id", docId).maybeSingle()
    if (doc) chapters.push({ node, title: doc.title || node.title, html: doc.content || "" })
  }
  const composedMeasures = measures.map((m: Record<string, unknown>) => ({
    id: String(m.id),
    title: String(m.title || ""),
    measureType: String(m.measure_type || ""),
    specificAction: String(m.specific_action || ""),
    narrative: typeof m.narrative === "string" ? m.narrative : null,
    outlineNodeId: typeof m.outline_node_id === "string" ? m.outline_node_id : null,
    citations: Array.isArray(m.citations) ? m.citations : [],
    workflowStatus: String(m.workflow_status || ""),
  }))
  const markdown = composeProgrammeMarkdown({ title, nodes, chapters, measures: composedMeasures })
  const citationGraph = composeCitationGraph(composedMeasures)
  return { markdown, citationGraph, measures: composedMeasures, nodeCount: nodes.length }
}

export async function runMarkdownOrDocxExport(input: {
  workspaceId: string
  title: string
  markdown?: string
  format: ProgrammeExportFormat
  classificationMax?: "public" | "internal" | "confidential"
  compose?: boolean
  stakeholder?: boolean
}) {
  const job = await createExportJob(input.workspaceId, input.format, input.classificationMax ?? "internal")
  if (job.error || !job.data) return job

  const supabase = await createClient()
  await supabase.from("export_jobs").update({ status: "running" }).eq("id", job.data.id)

  try {
    const maxRank = CLASSIFICATION_RANK[input.classificationMax ?? "internal"]
    const { data: docs } = await supabase
      .from("documents")
      .select("id, classification")
      .eq("workspace_id", input.workspaceId)
      .neq("status", "archived")

    const blocked = (docs || []).filter(
      (d) => CLASSIFICATION_RANK[(d.classification as keyof typeof CLASSIFICATION_RANK) || "internal"] > maxRank,
    )

    if (input.stakeholder) {
      const { data: freeze } = await supabase
        .from("programme_freezes")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      const requireFreeze = Boolean(
        ((await supabase.from("workspaces").select("metadata").eq("id", input.workspaceId).single()).data
          ?.metadata as Record<string, unknown> | null)?.stakeholderExportRequiresFreeze,
      )
      if (requireFreeze && !freeze) {
        await supabase
          .from("export_jobs")
          .update({ status: "failed", error: "Stakeholder download requires a freeze", completed_at: new Date().toISOString() })
          .eq("id", job.data.id)
        return { error: "Stakeholder download requires an audit freeze first" }
      }
    }

    const composed = input.compose || !input.markdown?.trim() ? await composeWorkspaceProgramme(input.workspaceId, input.title) : null
    let markdown = input.markdown?.trim() || composed?.markdown || ""

    if (blocked.length > 0 && maxRank < CLASSIFICATION_RANK.confidential) {
      const confidentialIds = new Set(blocked.map((b) => b.id))
      const leaks = (composed?.measures || []).some((m) =>
        m.citations.some((c) => confidentialIds.has(c.documentId)),
      )
      if (leaks) {
        await supabase
          .from("export_jobs")
          .update({
            status: "failed",
            error: "Classification: confidential citations would leak",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.data.id)
        return { error: "Export refused: confidential sources exceed classification_max" }
      }
      markdown += `\n\n> Excluded ${blocked.length} higher-classification documents from package context.\n`
    }

    let resultPayload: string
    let encoding: "utf8" | "base64" = "utf8"
    let mimeType: string

    if (input.format === "json") {
      resultPayload = JSON.stringify(
        {
          title: input.title,
          markdown,
          citationGraph: composed?.citationGraph ?? { nodes: [], edges: [] },
          measures: composed?.measures ?? [],
        },
        null,
        2,
      )
      mimeType = "application/json;charset=utf-8"
    } else if (input.format === "markdown") {
      resultPayload = markdown
      mimeType = "text/markdown;charset=utf-8"
    } else if (input.format === "pdf") {
      resultPayload = markdownToPrintHtml(input.title, markdown)
      mimeType = "text/html;charset=utf-8"
    } else {
      const buffer = await buildDocxFromSections(input.title, markdownToExportSections(markdown))
      resultPayload = buffer.toString("base64")
      encoding = "base64"
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }

    await supabase
      .from("export_jobs")
      .update({
        status: "completed",
        result_path: `inline:${input.format}:${resultPayload.length}`,
        completed_at: new Date().toISOString(),
        error: blocked?.length ? `Excluded ${blocked.length} higher-classification docs from package context` : null,
      })
      .eq("id", job.data.id)

    await recordGenerationRun({
      workspaceId: input.workspaceId,
      kind: "export",
      instructions: `export:${input.format}`,
      outputRef: job.data.id,
      citations: { blockedDocumentIds: blocked.map((b) => b.id) },
    })

    return {
      data: {
        jobId: job.data.id,
        format: input.format,
        content: resultPayload,
        encoding,
        mimeType,
        filename:
          input.format === "docx"
            ? `${slugify(input.title)}.docx`
            : input.format === "pdf"
              ? `${slugify(input.title)}-print.html`
              : input.format === "json"
                ? `${slugify(input.title)}.json`
                : `${slugify(input.title)}.md`,
      },
    }
  } catch (error) {
    await supabase
      .from("export_jobs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Export failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.data.id)
    return { error: error instanceof Error ? error.message : "Export failed" }
  }
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return s || "programme-export"
}

export async function buildAuditPackageJson(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { canAdministerProgramme, parseDocumentOwnerId, requiredChaptersAreApproved } = await import(
    "@/lib/programme/ownership"
  )
  const { getUserWorkspaceRole } = await import("@/lib/middleware/authorization")
  const { listProgrammeChapters, getProgrammeBindings } = await import("@/lib/actions/programme")
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspaceMeta } = await supabase
    .from("workspaces")
    .select("metadata, created_by")
    .eq("id", workspaceId)
    .single()
  const accessRole = user ? await getUserWorkspaceRole(user.id, workspaceId) : null
  const documentOwnerId = parseDocumentOwnerId(workspaceMeta?.metadata) || workspaceMeta?.created_by || null
  if (!canAdministerProgramme({ actorId: user?.id, accessRole, documentOwnerId })) {
    return { error: "Only the document owner can freeze the programme" }
  }
  const chapters = await listProgrammeChapters(workspaceId)
  const bindings = await getProgrammeBindings(workspaceId)
  let requiredNodeIds: string[] = []
  if (bindings.data.templateId) {
    const { listProgrammeOutlineNodes } = await import("@/lib/actions/outline")
    const nodes = await listProgrammeOutlineNodes(bindings.data.templateId)
    requiredNodeIds = (nodes.data || []).filter((node) => node.required).map((node) => node.id)
  }
  if (
    !requiredChaptersAreApproved({
      chapters: chapters.data || [],
      requiredNodeIds,
    })
  ) {
    return { error: "Approve required chapters before freezing the programme" }
  }

  const [runs, measures, reports, jobs] = await Promise.all([
    supabase.from("generation_runs").select("id, kind, created_at, source_document_ids, unused_document_ids").eq("workspace_id", workspaceId),
    supabase.from("programme_measures").select("id, title, workflow_status, citations").eq("workspace_id", workspaceId),
    supabase.from("analysis_reports").select("id, report_type, created_at").eq("workspace_id", workspaceId),
    supabase.from("export_jobs").select("id, format, status, created_at, completed_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
  ])

  const { data: workspaceRow } = await supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle()
  const composed = await composeWorkspaceProgramme(workspaceId, workspaceRow?.name || workspaceId)
  const { createHash } = await import("node:crypto")
  const manifest = {
    workspaceId,
    generatedAt: new Date().toISOString(),
    generationRuns: runs.data || [],
    measures: measures.data || [],
    analysisReports: reports.data || [],
    recentExportJobs: jobs.data || [],
    composedMarkdown: composed.markdown,
    citationGraph: composed.citationGraph,
  }
  const contentHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
  const { data: freezeRow, error: freezeError } = await supabase
    .from("programme_freezes")
    .insert({
      workspace_id: workspaceId,
      manifest,
      content_hash: contentHash,
    })
    .select("id, created_at")
    .single()

  if (freezeError) return { error: freezeError.message }

  return {
    data: {
      ...manifest,
      contentHash,
      frozen: true,
      freezeId: freezeRow?.id ?? null,
      generatedAt: freezeRow?.created_at ?? manifest.generatedAt,
    },
  }
}
