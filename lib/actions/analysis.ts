"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { parseAnalysisReportJson, type AnalysisFinding } from "@/lib/programme/structured-artefacts"
import { recordGenerationRun } from "@/lib/actions/generation-run"
import { resolveMeasureVisionAnchors, type VisionAnchor } from "@/lib/programme/vision-path"

export async function saveAnalysisReportFromJson(workspaceId: string, rawJson: string, userId?: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { report, errors } = parseAnalysisReportJson(rawJson)
  if (!report) return { error: errors.join("; ") }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("analysis_reports")
    .insert({
      workspace_id: workspaceId,
      report_type: report.reportType,
      findings: report.findings,
      created_by: userId ?? user?.id ?? null,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function listAnalysisReports(workspaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("id, report_type, findings, created_at, generation_run_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function getAnalysisReport(workspaceId: string, reportId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("id, report_type, findings, created_at, generation_run_id")
    .eq("workspace_id", workspaceId)
    .eq("id", reportId)
    .maybeSingle()
  if (error || !data) return { error: error?.message || "Report not found", data: null }
  let run: {
    id: string
    agent_version_id: string | null
    source_document_ids: string[] | null
    instructions: string | null
    provider: string | null
    model: string | null
  } | null = null
  if (data.generation_run_id) {
    const listed = await supabase
      .from("generation_runs")
      .select("id, agent_version_id, source_document_ids, instructions, provider, model, citations")
      .eq("id", data.generation_run_id)
      .maybeSingle()
    run = listed.data
  }
  return { data: { ...data, run } }
}

export async function setFindingAddressed(
  workspaceId: string,
  reportId: string,
  findingId: string,
  addressed: boolean,
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { data: report, error } = await supabase
    .from("analysis_reports")
    .select("id, findings")
    .eq("id", reportId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !report) return { error: error?.message || "Report not found" }
  const { applyFindingAddressed } = await import("@/lib/programme/analysis-reports")
  const findings = applyFindingAddressed((report.findings as AnalysisFinding[]) || [], findingId, addressed)
  const { error: updateError } = await supabase
    .from("analysis_reports")
    .update({ findings })
    .eq("id", reportId)
    .eq("workspace_id", workspaceId)
  if (updateError) return { error: updateError.message }
  try {
    revalidatePath(`/workspaces/${workspaceId}/programme`)
  } catch {
    // Client refresh still loads the finding update.
  }
  return { data: { reportId, findingId, addressed } }
}

export async function measureHasVisionPath(workspaceId: string, measureId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: measureNode } = await supabase
    .from("policy_graph_nodes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("measure_id", measureId)
    .maybeSingle()
  if (!measureNode) return false

  const { data: edges } = await supabase
    .from("policy_graph_edges")
    .select("to_node_id")
    .eq("workspace_id", workspaceId)
    .eq("from_node_id", measureNode.id)
    .eq("relation", "contributes_to")
  if (!edges || edges.length === 0) return false

  const { data: targets } = await supabase
    .from("policy_graph_nodes")
    .select("id, node_type")
    .eq("workspace_id", workspaceId)
    .in(
      "id",
      edges.map((e) => e.to_node_id),
    )
  return (targets || []).some(
    (n) =>
      n.node_type === "ambition" ||
      n.node_type === "goal" ||
      n.node_type === "challenge" ||
      n.node_type === "provincial_interest",
  )
}

export async function listPolicyGraph(workspaceId: string) {
  const supabase = await createClient()
  const [nodes, edges] = await Promise.all([
    supabase.from("policy_graph_nodes").select("id, node_type, label, measure_id, metadata").eq("workspace_id", workspaceId),
    supabase.from("policy_graph_edges").select("id, from_node_id, to_node_id, relation").eq("workspace_id", workspaceId),
  ])
  return { data: { nodes: nodes.data || [], edges: edges.data || [] }, error: nodes.error?.message || edges.error?.message }
}

export async function ensureMeasureGraphNode(workspaceId: string, measureId: string, label: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("policy_graph_nodes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("measure_id", measureId)
    .maybeSingle()
  if (existing) return { data: existing }

  const { data, error } = await supabase
    .from("policy_graph_nodes")
    .insert({
      workspace_id: workspaceId,
      node_type: "measure",
      label,
      measure_id: measureId,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function compareAnalysisReports(workspaceId: string, reportIdA: string, reportIdB: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("id, report_type, findings, created_at, generation_run_id")
    .eq("workspace_id", workspaceId)
    .in("id", [reportIdA, reportIdB])
  if (error) return { error: error.message }
  const a = (data || []).find((r) => r.id === reportIdA)
  const b = (data || []).find((r) => r.id === reportIdB)
  if (!a || !b) return { error: "Both reports are required" }

  const { diffAnalysisFindings } = await import("@/lib/programme/analysis-reports")
  const diff = diffAnalysisFindings((a.findings as AnalysisFinding[]) || [], (b.findings as AnalysisFinding[]) || [])
  return { data: { ...diff, reportA: a, reportB: b } }
}

async function saveStructuredReport(input: {
  workspaceId: string
  reportType: "existing_policy" | "coverage" | "conflicts" | "effects" | "quality"
  findings: AnalysisFinding[]
  generationRunId?: string | null
  userId?: string | null
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("analysis_reports")
    .insert({
      workspace_id: input.workspaceId,
      report_type: input.reportType,
      findings: input.findings,
      generation_run_id: input.generationRunId ?? null,
      created_by: input.userId ?? null,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  try {
    revalidatePath(`/workspaces/${input.workspaceId}/programme`)
  } catch {
    // Client refresh still loads the new report.
  }
  return { data }
}

export async function runBoundAgentAnalysis(input: {
  workspaceId: string
  kind: "analysis" | "vision" | "oer" | "qc"
  instructions?: string
  pinAgentVersionId?: string
  pinSourceDocumentIds?: string[]
  skipJob?: boolean
}) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId: input.workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  try {
    const jobKind = input.kind === "qc" ? "qc" : input.kind === "analysis" ? "analysis" : null
    const job = !input.skipJob && jobKind ? await startAnalysisJob(input.workspaceId, jobKind, input.kind) : null
    if (job?.error) return { error: job.error }

    const result = await executeBoundAgentAnalysis(input)
    if (job?.data) {
      await finishAnalysisJob(input.workspaceId, job.data.id, result.error ? "failed" : "done", result.error)
    }
    return result
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Analysis failed" }
  }
}

export async function rerunAnalysisFromReport(workspaceId: string, reportId: string, instructions?: string) {
  const report = await getAnalysisReport(workspaceId, reportId)
  if (report.error || !report.data) return { error: report.error || "Report not found" }
  const kind =
    report.data.report_type === "quality"
      ? "qc"
      : report.data.report_type === "effects"
        ? "oer"
        : report.data.report_type === "coverage"
          ? "vision"
          : "analysis"
  return runBoundAgentAnalysis({
    workspaceId,
    kind,
    instructions: instructions || report.data.run?.instructions || undefined,
    pinAgentVersionId: report.data.run?.agent_version_id || undefined,
    pinSourceDocumentIds: report.data.run?.source_document_ids || undefined,
  })
}

async function executeBoundAgentAnalysis(input: {
  workspaceId: string
  kind: "analysis" | "vision" | "oer" | "qc"
  instructions?: string
  pinAgentVersionId?: string
  pinSourceDocumentIds?: string[]
}) {
  const { completeLlm } = await import("@/lib/llm")
  const { compileSystemPrompt } = await import("@/lib/chat/playbook-compiler")
  const { loadPromptLayers } = await import("@/lib/llm/prompts")
  const { parseProgrammeBindings, boundAgentId, defaultSourceRolesForStage } = await import("@/lib/programme/domain")
  const { getLatestAgentVersion, getAgentVersionById } = await import("@/lib/actions/agent")
  const { resolveAgentSourceDocuments, formatSourcePreview } = await import("@/lib/programme/source-set")
  const { preflightAnalysisRun, conflictFindings } = await import(
    "@/lib/programme/analysis-reports"
  )
  const { computeUnusedSourceReport } = await import("@/lib/actions/generation-run")
  const { listProgrammeOutlineNodes } = await import("@/lib/actions/outline")
  const { listProgrammeMeasures } = await import("@/lib/actions/measures")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, metadata, space_id")
    .eq("id", input.workspaceId)
    .single()
  if (!workspace) return { error: "Workspace not found" }

  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const agentId = boundAgentId(bindings, input.kind)
  const agentVersion = input.pinAgentVersionId
    ? (await getAgentVersionById(input.pinAgentVersionId)).data
    : agentId
      ? (await getLatestAgentVersion(agentId)).data
      : null
  let { documents, sourceIds } = await resolveAgentSourceDocuments({
    workspaceId: input.workspaceId,
    version: agentVersion,
    bindings,
    fallbackRoles: defaultSourceRolesForStage(input.kind),
  })
  if (input.pinSourceDocumentIds?.length) {
    documents = documents.filter((document) => input.pinSourceDocumentIds?.includes(document.id))
    sourceIds = input.pinSourceDocumentIds
  }
  const gate = preflightAnalysisRun({ kind: input.kind, agentId: agentVersion?.agentId || agentId, bindings, documents })
  if (!gate.ok) return { error: gate.reason }

  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const userLanguage = await writingLanguageForSpace(workspace.space_id)

  let outlineBlock = ""
  if (bindings.templateId) {
    const outline = await listProgrammeOutlineNodes(bindings.templateId)
    outlineBlock = (outline.data || []).map((n) => `- ${n.title}${n.required ? " (required)" : ""}`).join("\n")
  }
  const measures = await listProgrammeMeasures(input.workspaceId)
  const measureBlock = (measures.data || [])
    .map((m: { id: string; title: string; measure_type: string; specific_action?: string }) => `- ${m.title} [${m.id}] (${m.measure_type}) ${m.specific_action || ""}`)
    .join("\n")

  const reportType =
    input.kind === "analysis"
      ? "existing_policy"
      : input.kind === "vision"
        ? "coverage"
        : input.kind === "oer"
          ? "effects"
          : "quality"

  const { selectEvidenceForTask } = await import("@/lib/programme/evidence-select")
  const selection = await selectEvidenceForTask({
    supabase,
    documents,
    query: [ANALYSIS_FOCUS[input.kind], input.instructions || "", outlineBlock, measureBlock].join("\n"),
    budgetChars: 50000,
  })
  const evidence = {
    text: selection.text,
    used: selection.used,
    total: selection.total,
    read: selection.spans.map((span) => ({ documentId: span.documentId, title: span.title, page: span.pageNumber })),
  }
  const layers = await loadPromptLayers(input.kind)
  const { systemPrompt } = compileSystemPrompt({
    kind: input.kind,
    userLanguage,
    identity: layers.identity,
    playbookBody: agentVersion?.instructions || layers.playbook,
    runInstructions: input.instructions,
    runtimeSections: `AGENT SOURCE SET:\n${formatSourcePreview(documents, evidence)}\n\nOUTLINE:\n${outlineBlock || "(none)"}\n\nMEASURES:\n${measureBlock || "(none)"}\n\nEVIDENCE:\n${evidence.text}`,
  })

  let raw = ""
  const { getTenantIdForSpace, resolveAgentVersionLlm } = await import("@/lib/llm/resolve")
  const tenantId = workspace.space_id ? await getTenantIdForSpace(workspace.space_id) : null
  let llm
  try {
    llm = await resolveAgentVersionLlm({ tenantId, spaceId: workspace.space_id, agentVersion })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not resolve the analysis model" }
  }
  const model = llm.model
  const provider = llm.provider
  try {
    const completion = await completeLlm({
      usage: { workspaceId: input.workspaceId, kind: `analysis_${input.kind}` },
      provider,
      endpoint: llm.endpoint,
      apiKey: llm.apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            input.kind === "oer"
              ? `Produce the effects JSON report. Each finding must include measureId from the MEASURES list, oerTheme, effectsDirection, effectsDeviation, effectsJustification when deviation is true, and citations into the effects report. ${input.instructions || ""}`
              : `Produce the ${reportType} JSON report for workspace ${workspace.name}. In citations, give the documentId, the sectionId when shown, the pageNumber, and an exact quote. ${input.instructions || ""}`,
        },
      ],
      json: true,
      maxTokens: 8000,
    })
    raw = completion.text
    if (!raw.trim()) return { error: `${model} returned an empty answer. Try the analysis again.` }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Analysis run failed" }
  }

  const parsed = parseAnalysisReportJson(raw)
  if (!parsed.report) return { error: parsed.errors.join("; ") || "Invalid analysis JSON" }

  const { citedDocumentIdsFromUnknown, inventedCitationIds } = await import("@/lib/programme/citation-labels")
  const citedIds = citedDocumentIdsFromUnknown(parsed.report.findings)
  const invented = inventedCitationIds(citedIds, sourceIds)
  if (invented.length) {
    return { error: `Invented documentIds are not allowed: ${invented.join(", ")}` }
  }

  const { withCitationPages } = await import("@/lib/programme/evidence-select")
  let findings = parsed.report.findings.map((finding) => ({
    ...finding,
    citations: withCitationPages(finding.citations, selection.spans),
  }))
  if (input.kind === "qc") {
    const { overlapFindingsFromMeasures } = await import("@/lib/programme/measure-duplicates")
    const overlap = overlapFindingsFromMeasures(
      (measures.data || []).map((measure: { id: string; title: string; specific_action?: string; narrative?: string; outline_node_id?: string | null }) => ({
        id: measure.id,
        title: measure.title,
        specificAction: measure.specific_action,
        narrative: measure.narrative,
        outlineNodeId: measure.outline_node_id,
      })),
    )
    findings = [...findings, ...overlap]
  }

  const { assessGroundedness } = await import("@/lib/programme/reliability")
  const groundedness = assessGroundedness(
    findings.map((finding) => `${finding.summary} ${finding.citations.map((citation) => citation.quote || "").join(" ")}`).join(". "),
    documents.map((document) => ({ documentId: document.id, text: document.content })),
  )

  const unused = await computeUnusedSourceReport(
    input.workspaceId,
    sourceIds,
    citedIds,
    agentVersion?.sourceRoles,
  )
  const { unusedDocumentIdsFromReport } = await import("@/lib/programme/unused-sources")
  const run = await recordGenerationRun({
    workspaceId: input.workspaceId,
    kind: input.kind,
    agentVersionId: agentVersion?.id ?? null,
    provider,
    model,
    instructions: input.instructions ?? `${input.kind} agent job`,
    sourceDocumentIds: sourceIds,
    unusedDocumentIds: unusedDocumentIdsFromReport(unused.data || []),
    citations: {
      unusedSources: unused.data || [],
      groundedness,
      evidenceCap: { used: evidence.used, total: evidence.total, read: evidence.read },
    },
    userId: user?.id,
  })

  if (input.kind === "analysis" || input.kind === "vision") {
    await materializeVisionGraph(input.workspaceId, findings, measures.data || [])
  }
  if (input.kind === "oer") {
    await applyOerFindingsToMeasures(input.workspaceId, findings, measures.data || [])
  }

  const saved = await saveStructuredReport({
    workspaceId: input.workspaceId,
    reportType,
    findings,
    generationRunId: run.data?.id ?? null,
    userId: user?.id,
  })
  const conflicts = conflictFindings(findings)
  if (conflicts.length && (input.kind === "analysis" || input.kind === "qc")) {
    await saveStructuredReport({
      workspaceId: input.workspaceId,
      reportType: "conflicts",
      findings: conflicts,
      generationRunId: run.data?.id ?? null,
      userId: user?.id,
    })
  }
  return saved
}

/** Words that describe what each analysis looks for, in both writing languages, used to pick evidence. */
const ANALYSIS_FOCUS: Record<"analysis" | "vision" | "oer" | "qc", string> = {
  analysis:
    "beleid beleidsregels doelen doelstellingen maatregelen rol ambitie opgave belang uitvoering policy rules goals measures role ambition challenge interest",
  vision: "ambitie ambities belang belangen principe opgave opgaven doel doelen ambition interest principle challenge goal",
  oer: "effect effecten milieu risico mitigatie beoordeling alternatief effects environment risk mitigation assessment",
  qc: "maatregel doel indicator termijn rol monitoring measure goal indicator timing role monitoring",
}

async function startAnalysisJob(workspaceId: string, kind: "analysis" | "qc", label: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const { error } = await supabase.from("programme_jobs").insert({
    id,
    workspace_id: workspaceId,
    kind,
    status: "running",
    cancelled: false,
    progress: [{ nodeId: kind, title: label, status: "pending" }],
    created_by: user?.id ?? null,
    started_at: now,
    updated_at: now,
  })
  if (error) return { error: error.message, data: null as { id: string } | null }
  return { data: { id } }
}

async function finishAnalysisJob(workspaceId: string, jobId: string, status: "done" | "failed" | "cancelled", error?: string) {
  const supabase = await createClient()
  const now = new Date().toISOString()
  await supabase
    .from("programme_jobs")
    .update({
      status,
      cancelled: status === "cancelled",
      error: error || null,
      progress: [{ nodeId: status === "failed" ? "error" : "job", title: status, status: status === "done" ? "ok" : status === "cancelled" ? "cancelled" : "error", error }],
      updated_at: now,
      completed_at: now,
    })
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
}

export async function getAnalysisJob(workspaceId: string, kind: "analysis" | "qc") {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_jobs")
    .select("id, status, cancelled, progress, started_at, updated_at, error")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return { data: null, error: error?.message }
  return { data }
}

export async function cancelAnalysisJob(workspaceId: string, kind: "analysis" | "qc") {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("programme_jobs")
    .update({ cancelled: true, status: "cancelled", updated_at: now, completed_at: now })
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .eq("status", "running")
  if (error) return { error: error.message }
  return { data: { cancelled: true } }
}

async function ensureGraphNode(workspaceId: string, nodeType: string, label: string) {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("policy_graph_nodes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("node_type", nodeType)
    .eq("label", label)
    .maybeSingle()
  if (existing) return existing.id
  const { data } = await supabase
    .from("policy_graph_nodes")
    .insert({ workspace_id: workspaceId, node_type: nodeType, label })
    .select("id")
    .single()
  return data?.id ?? null
}

export async function syncMeasureVisionPath(
  workspaceId: string,
  measureId: string,
  title: string,
  anchors: VisionAnchor[],
) {
  const node = await ensureMeasureGraphNode(workspaceId, measureId, title)
  const fromId = node.data?.id
  if (!fromId) return { error: node.error || "Measure graph node missing" }

  const supabase = await createClient()
  const targetIds: string[] = []
  for (const anchor of anchors) {
    const targetId = await ensureGraphNode(workspaceId, anchor.nodeType, anchor.label)
    if (!targetId) continue
    targetIds.push(targetId)
    const { data: existing } = await supabase
      .from("policy_graph_edges")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("from_node_id", fromId)
      .eq("to_node_id", targetId)
      .eq("relation", "contributes_to")
      .maybeSingle()
    if (existing) continue
    await supabase.from("policy_graph_edges").insert({
      workspace_id: workspaceId,
      from_node_id: fromId,
      to_node_id: targetId,
      relation: "contributes_to",
    })
  }

  const { data: current } = await supabase
    .from("policy_graph_edges")
    .select("id, to_node_id")
    .eq("workspace_id", workspaceId)
    .eq("from_node_id", fromId)
    .eq("relation", "contributes_to")
  const wanted = new Set(targetIds)
  const stale = (current || []).filter((edge) => !wanted.has(edge.to_node_id))
  if (stale.length) {
    await supabase
      .from("policy_graph_edges")
      .delete()
      .in(
        "id",
        stale.map((edge) => edge.id),
      )
  }
  return { data: { fromId, anchors: targetIds.length } }
}

async function materializeVisionGraph(
  workspaceId: string,
  findings: AnalysisFinding[],
  measures: Array<{
    id: string
    title: string
    contributes_to_vision?: string[]
    provincial_interests?: string[]
  }>,
) {
  for (const finding of findings) {
    if (finding.visionAnchor) await ensureGraphNode(workspaceId, "ambition", finding.visionAnchor)
    if (finding.provincialInterest) {
      await ensureGraphNode(workspaceId, "provincial_interest", finding.provincialInterest)
    }
  }

  for (const measure of measures) {
    const anchors = resolveMeasureVisionAnchors({
      title: measure.title,
      contributesToVision: measure.contributes_to_vision || [],
      provincialInterests: measure.provincial_interests || [],
      findings,
    })
    await syncMeasureVisionPath(workspaceId, measure.id, measure.title, anchors)
  }
}

async function applyOerFindingsToMeasures(
  workspaceId: string,
  findings: AnalysisFinding[],
  measures: Array<{ id: string; title: string }>,
) {
  const { matchFindingToMeasure } = await import("@/lib/programme/analysis-reports")
  const supabase = await createClient()
  for (const finding of findings) {
    const match = matchFindingToMeasure(finding, measures)
    if (!match) continue
    const direction = finding.effectsDirection || (/negative/.test(finding.summary)
      ? "negative"
      : /positive/.test(finding.summary)
        ? "positive"
        : "unknown")
    await supabase
      .from("programme_measures")
      .update({
        effects_direction: direction,
        effects_deviation: finding.effectsDeviation ?? (finding.disposition === "drop" || finding.disposition === "adapt"),
        effects_justification: finding.effectsJustification || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id)
      .eq("workspace_id", workspaceId)
  }
}
