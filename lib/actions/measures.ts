"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  canApproveMeasure,
  parseMeasureCandidatesJson,
  type MeasureCandidate,
} from "@/lib/programme/structured-artefacts"
import { recordGenerationRun } from "@/lib/actions/generation-run"
import { compileSystemPrompt } from "@/lib/chat/playbook-compiler"
import { boundAgentId, defaultSourceRolesForStage, parseProgrammeBindings } from "@/lib/programme/domain"
import { listProgrammeOutlineNodes } from "@/lib/actions/outline"
import { completeLlm } from "@/lib/llm"
import { getLatestAgentVersion } from "@/lib/actions/agent"
import { formatSourceEvidence, formatSourcePreview, resolveAgentSourceDocuments } from "@/lib/programme/source-set"
import { snapshotArtefact } from "@/lib/actions/collaboration"
import { measureHasVisionPath, syncMeasureVisionPath } from "@/lib/actions/analysis"
import { resolveMeasureVisionAnchors } from "@/lib/programme/vision-path"
import { evaluateDistinctReviewerApproval, mergeCitationSets, parseProgrammePolicies } from "@/lib/programme/review-policy"

function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

export async function upsertProgrammeMeasure(
  workspaceId: string,
  measure: MeasureCandidate & { id?: string; workflowStatus?: string; outlineNodeId?: string | null },
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

  const row = {
    workspace_id: workspaceId,
    title: measure.title,
    measure_type: measure.type,
    specific_action: measure.specificAction,
    owner_role: measure.ownerRole ?? null,
    geography: measure.geography ?? null,
    timeline: measure.timeline ?? null,
    indicator: measure.indicator ?? null,
    success_criterion: measure.successCriterion ?? null,
    contributes_to_vision: measure.contributesToVision ?? [],
    provincial_interests: measure.provincialInterests ?? [],
    effects_direction: measure.effectsDirection,
    effects_deviation: measure.effectsDeviation,
    effects_justification: measure.effectsJustification ?? null,
    citations: measure.citations,
    narrative: measure.narrative ?? null,
    workflow_status: measure.workflowStatus ?? "generated",
    outline_node_id: measure.outlineNodeId ?? null,
    updated_at: new Date().toISOString(),
    created_by: user?.id,
  }

  let saved
  if (measure.id) {
    const { data, error } = await supabase.from("programme_measures").update(row).eq("id", measure.id).eq("workspace_id", workspaceId).select().single()
    if (error) return { error: error.message }
    saved = data
  } else {
    const { data, error } = await supabase.from("programme_measures").insert(row).select().single()
    if (error) return { error: error.message }
    saved = data
  }

  if (saved) {
    await syncMeasureVisionPath(
      workspaceId,
      saved.id,
      saved.title,
      resolveMeasureVisionAnchors({
        title: saved.title,
        contributesToVision: saved.contributes_to_vision || [],
        provincialInterests: saved.provincial_interests || [],
      }),
    )
    await snapshotArtefact({
      workspaceId,
      artefactType: "measure",
      artefactId: saved.id,
      snapshot: saved as Record<string, unknown>,
      reason: measure.id ? "measure update" : "measure create",
    })
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: saved }
}

export async function approveProgrammeMeasure(workspaceId: string, measureId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspace } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  const { data: row, error } = await supabase.from("programme_measures").select("*").eq("id", measureId).eq("workspace_id", workspaceId).single()
  if (error || !row) return { error: error?.message || "Not found" }

  const reviewerGate = evaluateDistinctReviewerApproval({
    distinctReviewer: parseProgrammePolicies(workspace?.metadata).distinctReviewer,
    actorId: user?.id,
    assignedReviewerId: row.assigned_reviewer_id,
    createdBy: row.created_by,
  })
  if (!reviewerGate.ok) return { error: reviewerGate.reason }

  const candidate: MeasureCandidate = {
    title: row.title,
    type: row.measure_type,
    specificAction: row.specific_action,
    ownerRole: row.owner_role ?? undefined,
    geography: row.geography ?? undefined,
    timeline: row.timeline ?? undefined,
    indicator: row.indicator ?? undefined,
    successCriterion: row.success_criterion ?? undefined,
    contributesToVision: row.contributes_to_vision || [],
    provincialInterests: row.provincial_interests || [],
    effectsDirection: row.effects_direction,
    effectsDeviation: row.effects_deviation,
    effectsJustification: row.effects_justification ?? undefined,
    citations: row.citations || [],
    narrative: row.narrative ?? undefined,
  }

  if (row.workflow_status === "generated") {
    return { error: "Request review before approval — generated measures cannot jump to approved" }
  }
  const hasVisionPath = await measureHasVisionPath(workspaceId, measureId)
  const gate = canApproveMeasure(candidate, { hasVisionPath, requireVisionPath: true })
  if (!gate.ok) return { error: `Cannot approve: ${gate.reasons.join(", ")}` }

  const { data, error: updateError } = await supabase
    .from("programme_measures")
    .update({ workflow_status: "approved", updated_at: new Date().toISOString() })
    .eq("id", measureId)
    .select()
    .single()

  if (updateError) return { error: updateError.message }
  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: measureId,
    snapshot: data as Record<string, unknown>,
    reason: "approve",
  })
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
}

export async function setMeasureWorkflowStatus(
  workspaceId: string,
  measureId: string,
  status: "generated" | "in_review" | "revised" | "approved",
  options?: { skipApproveGate?: boolean },
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  if (status === "approved" && !options?.skipApproveGate) {
    return approveProgrammeMeasure(workspaceId, measureId)
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_measures")
    .update({ workflow_status: status, updated_at: new Date().toISOString() })
    .eq("id", measureId)
    .eq("workspace_id", workspaceId)
    .select()
    .single()
  if (error) return { error: error.message }
  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: measureId,
    snapshot: data as Record<string, unknown>,
    reason: `workflow:${status}`,
  })
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
}

export async function assignMeasureReviewer(workspaceId: string, measureId: string, reviewerId: string | null) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspace } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  const requireDistinct = Boolean((workspace?.metadata as Record<string, unknown> | null)?.distinctReviewer)
  if (requireDistinct && reviewerId && user?.id && reviewerId === user.id) {
    return { error: "Distinct-reviewer policy: assign someone else" }
  }
  const { data, error } = await supabase
    .from("programme_measures")
    .update({ assigned_reviewer_id: reviewerId, updated_at: new Date().toISOString() })
    .eq("id", measureId)
    .eq("workspace_id", workspaceId)
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
}

export async function placeMeasureOnNode(workspaceId: string, measureId: string, outlineNodeId: string | null) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_measures")
    .update({ outline_node_id: outlineNodeId, updated_at: new Date().toISOString() })
    .eq("id", measureId)
    .eq("workspace_id", workspaceId)
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
}

/**
 * Update only effects fields on a measure (validates deviation ⇒ justification).
 */
export async function updateMeasureEffects(
  workspaceId: string,
  measureId: string,
  effects: {
    effectsDirection: MeasureCandidate["effectsDirection"]
    effectsDeviation: boolean
    effectsJustification?: string | null
  },
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  if (effects.effectsDeviation && !effects.effectsJustification?.trim()) {
    return { error: "Deviation requires a justification" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_measures")
    .update({
      effects_direction: effects.effectsDirection,
      effects_deviation: effects.effectsDeviation,
      effects_justification: effects.effectsJustification?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", measureId)
    .eq("workspace_id", workspaceId)
    .select()
    .single()

  if (error) return { error: error.message }

  const { data: workspace } = await supabase.from("workspaces").select("metadata").eq("id", workspaceId).single()
  const metadata = (workspace?.metadata as Record<string, unknown> | null) || {}
  const current = Array.isArray(metadata.effectsCheckedIds)
    ? metadata.effectsCheckedIds.filter((id): id is string => typeof id === "string")
    : []
  if (!current.includes(measureId)) {
    await supabase
      .from("workspaces")
      .update({
        metadata: { ...metadata, effectsCheckedIds: [...current, measureId] },
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId)
  }

  revalidatePath(`/workspaces/${workspaceId}`)
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
}

export async function importMeasureCandidatesFromJson(workspaceId: string, rawJson: string, userId?: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const { measures, errors } = parseMeasureCandidatesJson(rawJson)
  const saved = []
  for (const measure of measures) {
    const result = await upsertProgrammeMeasure(workspaceId, measure)
    if (result.data) saved.push(result.data)
  }
  await recordGenerationRun({
    workspaceId,
    kind: "measures",
    instructions: "importMeasureCandidatesFromJson",
    citations: { parseErrors: errors },
    userId,
    outputRef: `imported:${saved.length}`,
  })
  return { data: { saved: saved.length, errors } }
}

export async function generateProgrammeMeasuresFromContext(
  workspaceId: string,
  options?: { instructions?: string; count?: number; temperature?: number; outlineNodeId?: string | null },
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
  if (!user) return { error: "Unauthorized" }

  const count = Math.min(Math.max(options?.count ?? 5, 1), 12)
  const temperature = options?.temperature ?? 0.3
  const instructions =
    options?.instructions?.trim() ||
    `Propose ${count} concrete environmental-programme measures grounded in the evidence and outline.`

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("name, context, location, metadata, space_id")
    .eq("id", workspaceId)
    .single()
  if (workspaceError || !workspace) return { error: "Workspace not found" }

  const { data: profile } = await supabase.from("profiles").select("language").eq("id", user.id).single()
  const userLanguage = profile?.language === "nl" ? "Dutch" : "English"

  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const agentId = boundAgentId(bindings, "measures")
  const agentVersion = agentId ? (await getLatestAgentVersion(agentId)).data : null
  const { documents, sourceIds } = await resolveAgentSourceDocuments({
    workspaceId,
    version: agentVersion,
    bindings,
    fallbackRoles: defaultSourceRolesForStage("measures"),
  })
  const context = formatSourceEvidence(documents)
  const sourcePreview = formatSourcePreview(documents)

  if (sourceIds.length === 0 && !context.trim()) {
    return { error: "Add workspace documents (or bind an agent source set) before generating measures" }
  }

  const { assessMeasureCitations } = await import("@/lib/programme/reliability")
  const { getTenantIdForSpace, resolveAgentVersionLlm } = await import("@/lib/llm/resolve")
  const tenantId = workspace.space_id ? await getTenantIdForSpace(workspace.space_id) : null
  let llm
  try {
    llm = await resolveAgentVersionLlm({ tenantId, spaceId: workspace.space_id, agentVersion })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not resolve the measures model" }
  }
  const model = llm.model
  const provider = llm.provider
  const { loadPromptLayers } = await import("@/lib/llm/prompts")
  const layers = await loadPromptLayers("measures")
  const playbookBody = agentVersion?.instructions || layers.playbook

  let outlineBlock = "(no outline bound yet)"
  if (bindings.templateId) {
    const outline = await listProgrammeOutlineNodes(bindings.templateId)
    if (outline.data.length > 0) {
      outlineBlock = outline.data
        .map((n, i) => {
          const purpose = n.purpose ? n.purpose.replace(/<[^>]+>/g, "").slice(0, 200) : ""
          const instr = n.instructions ? ` | instructions: ${n.instructions.slice(0, 180)}` : ""
          return `${i + 1}. ${n.title} [${n.id}]${n.required ? " (required)" : ""}${purpose ? ` — ${purpose}` : ""}${instr}`
        })
        .join("\n")
    }
  }

  const evidenceIdList = sourceIds.map((id) => `- ${id}`).join("\n") || "- (none)"
  const evidenceDocs = documents.map((d) => ({ documentId: d.id, text: d.content }))

  const { systemPrompt } = compileSystemPrompt({
    kind: "measures",
    userLanguage,
    identity: layers.identity,
    playbookBody,
    runInstructions: instructions,
    runtimeSections: `PROGRAMME OUTLINE:\n${outlineBlock}\n\nAGENT SOURCE SET:\n${sourcePreview}\n\nALLOWED DOCUMENT IDS FOR CITATIONS:\n${evidenceIdList}${
      options?.outlineNodeId ? `\n\nPLACE MEASURES ON OUTLINE NODE: ${options.outlineNodeId}` : ""
    }${agentVersion?.qualityRules ? `\n\nQUALITY RULES:\n${agentVersion.qualityRules}` : ""}`,
  })

  const userPrompt = `Generate exactly ${count} measure candidates as JSON.

Workspace: ${workspace.name}
${workspace.context ? `Context: ${workspace.context}` : ""}
${workspace.location ? `Location: ${workspace.location}` : ""}

Author instructions:
${instructions}

Workspace evidence:
${context || "(empty)"}

Return ONLY the JSON object with a "measures" array.`

  let raw = ""
  try {
    const completion = await completeLlm({
      provider,
      endpoint: llm.endpoint,
      apiKey: llm.apiKey,
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      maxTokens: 8000,
      json: true,
    })
    raw = completion.text
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to generate measures" }
  }

  if (!raw) return { error: "The AI did not return any content" }

  const payload = extractJsonPayload(raw)
  const parsed = parseMeasureCandidatesJson(payload)
  let measures = parsed.measures
  const errors = [...parsed.errors]

  const accepted = []
  for (const measure of measures) {
    const citationIssues = assessMeasureCitations(measure.citations || [], evidenceDocs)
    const blocking = citationIssues.filter((i) => i.reason === "missing_citation" || i.reason === "unknown_document")
    if (blocking.length > 0) {
      errors.push({
        index: -1,
        message: `Rejected "${measure.title}": ${blocking.map((b) => b.reason).join(", ")}`,
      })
      continue
    }
    accepted.push(measure)
  }
  measures = accepted

  const saved = []
  for (const measure of measures) {
    const result = await upsertProgrammeMeasure(workspaceId, {
      ...measure,
      outlineNodeId: options?.outlineNodeId ?? measure.outlineNodeId ?? null,
    })
    if (result.data) saved.push(result.data)
  }

  const { computeUnusedSourceReport } = await import("@/lib/actions/generation-run")
  const { unusedDocumentIdsFromReport } = await import("@/lib/programme/unused-sources")
  const { citedDocumentIdsFromUnknown } = await import("@/lib/programme/citation-labels")
  const unused = await computeUnusedSourceReport(
    workspaceId,
    sourceIds,
    citedDocumentIdsFromUnknown(saved),
    agentVersion?.sourceRoles,
  )
  await recordGenerationRun({
    workspaceId,
    kind: "measures",
    agentVersionId: agentVersion?.id ?? null,
    provider,
    model,
    temperature,
    instructions,
    sourceDocumentIds: sourceIds,
    unusedDocumentIds: unusedDocumentIdsFromReport(unused.data || []),
    outputRef: `measures:${saved.length}`,
    citations: {
      parseErrors: errors,
      sourceCount: sourceIds.length,
      accepted: saved.length,
      sourcePreview,
      unusedSources: unused.data || [],
    },
    userId: user.id,
  })

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return {
    data: {
      saved: saved.length,
      errors,
      model,
    },
  }
}

export async function listProgrammeMeasures(workspaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_measures")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

/**
 * Keep one measure, union citations from the dropped duplicate, then delete the extra row.
 */
export async function mergeDuplicateMeasures(workspaceId: string, keepId: string, dropId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  if (keepId === dropId) return { error: "Choose two different measures to merge" }

  const supabase = await createClient()
  const { data: keep, error: keepError } = await supabase
    .from("programme_measures")
    .select("*")
    .eq("id", keepId)
    .eq("workspace_id", workspaceId)
    .single()
  const { data: drop, error: dropError } = await supabase
    .from("programme_measures")
    .select("*")
    .eq("id", dropId)
    .eq("workspace_id", workspaceId)
    .single()
  if (keepError || !keep) return { error: keepError?.message || "Keep measure not found" }
  if (dropError || !drop) return { error: dropError?.message || "Drop measure not found" }

  const citations = mergeCitationSets(keep.citations || [], drop.citations || [])
  const outlineNodeId = keep.outline_node_id || drop.outline_node_id || null

  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: keepId,
    snapshot: keep as Record<string, unknown>,
    reason: "pre-merge keep",
  })
  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: dropId,
    snapshot: drop as Record<string, unknown>,
    reason: "pre-merge drop",
  })

  const { data: saved, error: updateError } = await supabase
    .from("programme_measures")
    .update({
      citations,
      outline_node_id: outlineNodeId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", keepId)
    .eq("workspace_id", workspaceId)
    .select()
    .single()
  if (updateError || !saved) return { error: updateError?.message || "Failed to merge citations" }

  const { error: deleteError } = await supabase
    .from("programme_measures")
    .delete()
    .eq("id", dropId)
    .eq("workspace_id", workspaceId)
  if (deleteError) return { error: deleteError.message }

  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: keepId,
    snapshot: saved as Record<string, unknown>,
    reason: `merge ${dropId}`,
  })

  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { keep: saved, droppedId: dropId, citationCount: citations.length } }
}
