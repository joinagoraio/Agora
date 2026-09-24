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
import { formatSourcePreview, resolveAgentSourceDocuments } from "@/lib/programme/source-set"
import { snapshotArtefact } from "@/lib/actions/collaboration"
import { measureHasVisionPath, syncMeasureVisionPath } from "@/lib/actions/analysis"
import { resolveMeasureVisionAnchors } from "@/lib/programme/vision-path"
import { roleCheckInstruction, roleCheckSchema, stampRoleCheck } from "@/lib/programme/role-check"
import { evaluateDistinctReviewerApproval, mergeCitationSets, parseProgrammePolicies } from "@/lib/programme/review-policy"

async function spaceTypeFor(supabase: Awaited<ReturnType<typeof createClient>>, spaceId: string | null) {
  if (!spaceId) return null
  const { data } = await supabase.from("spaces").select("space_type").eq("id", spaceId).maybeSingle()
  return (data?.space_type as string | undefined) ?? null
}

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
    ...(measure.challenge !== undefined ? { challenge: measure.challenge || null } : {}),
    ...(measure.resources !== undefined ? { resources: measure.resources || null } : {}),
    ...(measure.interestIds !== undefined ? { interest_ids: measure.interestIds } : {}),
    ...(measure.roleCheck ? { role_check: stampRoleCheck(measure.roleCheck) } : {}),
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

/** Staff decide what happens to a proposed measure: keep it, adapt it, or drop it with a reason. */
export async function setMeasureDecision(
  workspaceId: string,
  measureId: string,
  decision: "keep" | "adapt" | "drop" | null,
  reason?: string,
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const trimmed = reason?.trim() || ""
  if (decision === "drop" && !trimmed) return { error: "Give a reason for dropping this measure." }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from("programme_measures")
    .update({
      decision,
      decision_reason: decision ? trimmed || null : null,
      decided_by: decision ? user?.id ?? null : null,
      decided_at: decision ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", measureId)
    .eq("workspace_id", workspaceId)
    .select("id, decision, decision_reason, decided_at")
    .single()
  if (error || !data) return { error: error?.message || "Measure not found" }
  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: measureId,
    snapshot: data as Record<string, unknown>,
    reason: decision ? `decision:${decision}` : "decision cleared",
  })
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
}

/** Staff set how urgent a measure is; drafting orders measures by it. */
export async function setMeasurePriority(
  workspaceId: string,
  measureId: string,
  priority: "high" | "medium" | "low" | null,
  reason?: string,
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
    .from("programme_measures")
    .update({
      priority,
      priority_reason: priority ? reason?.trim() || null : null,
      prioritised_by: priority ? user?.id ?? null : null,
      prioritised_at: priority ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", measureId)
    .eq("workspace_id", workspaceId)
    .select("id, priority, priority_reason, prioritised_at")
    .single()
  if (error || !data) return { error: error?.message || "Measure not found" }
  await snapshotArtefact({
    workspaceId,
    artefactType: "measure",
    artefactId: measureId,
    snapshot: data as Record<string, unknown>,
    reason: priority ? `priority:${priority}` : "priority cleared",
  })
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data }
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
  options?: {
    instructions?: string
    count?: number
    temperature?: number
    outlineNodeId?: string | null
    /** Extra words that describe what the measures are about, used to pick evidence. */
    focus?: string
    /** The interest these measures are for; it is linked to every measure. */
    interestId?: string | null
  },
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

  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const userLanguage = await writingLanguageForSpace(workspace.space_id)
  const spaceType = await spaceTypeFor(supabase, workspace.space_id)

  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const agentId = boundAgentId(bindings, "measures")
  const agentVersion = agentId ? (await getLatestAgentVersion(agentId)).data : null
  const { documents, sourceIds } = await resolveAgentSourceDocuments({
    workspaceId,
    version: agentVersion,
    bindings,
    fallbackRoles: defaultSourceRolesForStage("measures"),
  })
  if (sourceIds.length === 0 && documents.every((document) => !document.content.trim())) {
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
  const outlineIds = new Set<string>()
  if (bindings.templateId) {
    const outline = await listProgrammeOutlineNodes(bindings.templateId)
    for (const node of outline.data) outlineIds.add(node.id)
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

  const { data: interestRows } = await supabase
    .from("programme_interests")
    .select("id, reference, label, summary, selected")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
  const interests = (interestRows || []) as Array<{
    id: string
    reference: string | null
    label: string
    summary: string | null
    selected: boolean
  }>
  const focusInterest = options?.interestId ? interests.find((interest) => interest.id === options.interestId) : undefined
  const interestName = (interest: { reference: string | null; label: string }) =>
    [interest.reference, interest.label].filter(Boolean).join(" ")
  const promptInterests = interests.filter((interest) => interest.selected || interest.id === focusInterest?.id)
  const interestsBlock = (promptInterests.length ? promptInterests : interests).map((interest) => `- ${interestName(interest)}`).join("\n")

  const { selectEvidenceForTask } = await import("@/lib/programme/evidence-select")
  const evidence = await selectEvidenceForTask({
    supabase,
    documents,
    query: [
      instructions,
      outlineBlock,
      options?.focus || "",
      focusInterest ? `${interestName(focusInterest)} ${focusInterest.summary || ""}` : "",
    ].join("\n"),
  })
  const context = evidence.text
  const sourcePreview = formatSourcePreview(documents, { used: evidence.used, total: evidence.total })
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

Workspace evidence (each piece shows its document id, section id, and page):
${context || "(empty)"}

In citations, give the documentId, the sectionId when shown, the pageNumber, and an exact quote from that piece.
${
  interestsBlock
    ? `\nINTERESTS the vision names:\n${interestsBlock}\nIn "provincialInterests", name each interest a measure serves exactly as listed above, number first.${
        focusInterest ? ` Every measure serves ${interestName(focusInterest)}; name others only when the evidence links them.` : ""
      }\n`
    : ""
}
Also give, when the evidence supports it: "challenge" (the task or problem from the vision or policy this measure addresses) and "resources" (only what the sources say about means, costs, or funding; leave it out otherwise, never estimate).

Add "roleCheck": {"actor", "reason", "quote", "documentId", "pageNumber"}. ${roleCheckInstruction(spaceType)}

${
  outlineIds.size > 0 && !options?.outlineNodeId
    ? `For each item, set "outlineNodeId" to the id in [brackets] of the PROGRAMME OUTLINE chapter it belongs to.\n\n`
    : ""
}Every measure object has these keys: "title", "type", "specificAction", "ownerRole", "geography", "timeline", "indicator", "contributesToVision", "provincialInterests", "challenge", "resources", "roleCheck", ${
  outlineIds.size > 0 && !options?.outlineNodeId ? `"outlineNodeId", ` : ""
}"citations". Leave out "geography" and "resources" only when the sources say nothing about them.

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
  const { withCitationPages } = await import("@/lib/programme/evidence-select")
  let measures = parsed.measures.map((measure) => ({
    ...measure,
    citations: withCitationPages(measure.citations, evidence.spans),
  }))
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
    const proposedNode = measure.outlineNodeId && outlineIds.has(measure.outlineNodeId) ? measure.outlineNodeId : null
    const { matchInterestIds } = await import("@/lib/programme/interests")
    const linked = new Set(matchInterestIds(measure.provincialInterests || [], interests))
    if (focusInterest) linked.add(focusInterest.id)
    const result = await upsertProgrammeMeasure(workspaceId, {
      ...measure,
      outlineNodeId: options?.outlineNodeId ?? proposedNode,
      interestIds: [...linked],
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

/** Say who has to act on each measure, going by the sources. Never blocks a measure. */
export async function checkMeasureRoles(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, metadata, space_id")
    .eq("id", workspaceId)
    .single()
  if (!workspace) return { error: "Workspace not found" }

  const { data: measureRows } = await supabase
    .from("programme_measures")
    .select("id, title, specific_action, owner_role, decision")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
  const measures = (measureRows || []).filter((m) => m.decision !== "drop").slice(0, 40)
  if (measures.length === 0) return { error: "There are no measures to check yet." }

  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const userLanguage = await writingLanguageForSpace(workspace.space_id)
  const spaceType = await spaceTypeFor(supabase, workspace.space_id)
  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const agentId = boundAgentId(bindings, "measures")
  const agentVersion = agentId ? (await getLatestAgentVersion(agentId)).data : null
  const { documents } = await resolveAgentSourceDocuments({
    workspaceId,
    version: agentVersion,
    bindings,
    fallbackRoles: defaultSourceRolesForStage("measures"),
  })
  const { getTenantIdForSpace, resolveAgentVersionLlm } = await import("@/lib/llm/resolve")
  const tenantId = workspace.space_id ? await getTenantIdForSpace(workspace.space_id) : null
  let llm
  try {
    llm = await resolveAgentVersionLlm({ tenantId, spaceId: workspace.space_id, agentVersion })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not resolve the measures model" }
  }

  const measureList = measures
    .map((m) => `- [${m.id}] ${m.title}${m.specific_action ? ` — ${m.specific_action}` : ""}${m.owner_role ? ` (role: ${m.owner_role})` : ""}`)
    .join("\n")
  const { selectEvidenceForTask, withCitationPages } = await import("@/lib/programme/evidence-select")
  const evidence = await selectEvidenceForTask({
    supabase,
    documents,
    query: `${measureList}\nrol taak bevoegdheid verantwoordelijk provincie gemeente Rijk waterschap partners role responsibility powers`,
    budgetChars: 35000,
  })
  const { loadPromptLayers } = await import("@/lib/llm/prompts")
  const layers = await loadPromptLayers("measures")
  const { systemPrompt } = compileSystemPrompt({
    kind: "measures",
    userLanguage,
    identity: layers.identity,
    playbookBody: "",
    runInstructions: "Check who has to act on each measure.",
    runtimeSections: `ROLE CHECK:\n${roleCheckInstruction(spaceType)}`,
  })
  const userPrompt = `Measures:
${measureList}

Evidence (each piece shows its document id, section id, and page):
${evidence.text || "(empty)"}

Return ONLY a JSON object: {"checks": [{"measureId", "actor", "reason", "quote", "documentId", "pageNumber"}]}, one per measure, using the ids in [brackets]. Write the reason in ${userLanguage}.`

  let raw = ""
  try {
    const completion = await completeLlm({
      provider: llm.provider,
      endpoint: llm.endpoint,
      apiKey: llm.apiKey,
      model: llm.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 8000,
      json: true,
    })
    raw = completion.text
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The role check failed" }
  }
  if (!raw.trim()) return { error: "The AI did not return any content" }

  let checks: unknown[] = []
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as { checks?: unknown[] }
    checks = Array.isArray(parsed.checks) ? parsed.checks : []
  } catch {
    return { error: "The role check returned an unreadable answer. Try again." }
  }
  const ids = new Set(measures.map((m) => m.id))
  let saved = 0
  for (const item of checks) {
    const measureId = (item as { measureId?: unknown })?.measureId
    if (typeof measureId !== "string" || !ids.has(measureId)) continue
    const parsed = roleCheckSchema.safeParse(item)
    if (!parsed.success) continue
    const [cited] = withCitationPages(
      parsed.data.documentId ? [{ documentId: parsed.data.documentId, pageNumber: parsed.data.pageNumber, quote: parsed.data.quote }] : [],
      evidence.spans,
    )
    const check = stampRoleCheck({ ...parsed.data, pageNumber: cited?.pageNumber ?? parsed.data.pageNumber })
    const { error } = await supabase
      .from("programme_measures")
      .update({ role_check: check, updated_at: new Date().toISOString() })
      .eq("id", measureId)
      .eq("workspace_id", workspaceId)
    if (!error) saved += 1
  }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { checked: saved, total: measures.length } }
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
