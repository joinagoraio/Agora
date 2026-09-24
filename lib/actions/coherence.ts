"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { boundAgentId, parseProgrammeBindings } from "@/lib/programme/domain"
import {
  coherenceSignals,
  mapCoherenceRow,
  parseCoherenceJson,
  type CoherenceDraft,
  type CoherenceFinding,
} from "@/lib/programme/coherence"

export async function listCoherenceFindings(workspaceId: string): Promise<{ data: CoherenceFinding[]; error?: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("programme_coherence_findings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
  if (error) return { error: error.message, data: [] }
  return { data: (data || []).map(mapCoherenceRow) }
}

/** Look across the chosen interests: where they reinforce, where measures can be shared, and where they conflict. */
export async function runCoherenceAnalysis(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: workspace } = await supabase.from("workspaces").select("name, metadata, space_id").eq("id", workspaceId).maybeSingle()
  if (!workspace) return { error: "Programme not found" }

  const [{ data: interestRows }, { data: measureRows }] = await Promise.all([
    supabase
      .from("programme_interests")
      .select("id, reference, label, summary, selected, workup_document_id")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("programme_measures")
      .select("id, title, specific_action, owner_role, geography, interest_ids, decision, challenge")
      .eq("workspace_id", workspaceId),
  ])
  const interests = (interestRows || []).filter((row) => row.selected)
  if (interests.length < 2) return { error: "Choose at least two interests to compare." }

  const workupIds = interests.map((interest) => interest.workup_document_id).filter((id): id is string => Boolean(id))
  const { data: workups } = workupIds.length
    ? await supabase.from("documents").select("id, content").in("id", workupIds)
    : { data: [] as Array<{ id: string; content: string | null }> }
  const workupText = (id: string | null) =>
    ((workups || []).find((row) => row.id === id)?.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3500)

  const measures = (measureRows || []).filter((measure) => measure.decision !== "drop")
  const name = (interest: { reference: string | null; label: string }) => [interest.reference, interest.label].filter(Boolean).join(" ")
  const interestById = new Map(interests.map((interest) => [interest.id, interest]))

  const { writingLanguageForSpace } = await import("@/lib/programme/load-writing-language")
  const userLanguage = await writingLanguageForSpace(workspace.space_id)
  const signals = coherenceSignals(measures, interests, userLanguage)

  const bindings = parseProgrammeBindings((workspace.metadata as Record<string, unknown>) || {})
  const { data: sourceRows } = await supabase
    .from("documents")
    .select("id, title, content, metadata")
    .eq("workspace_id", workspaceId)
    .neq("status", "deleted")
    .neq("status", "archived")
  const chapterIds = new Set(Object.values(bindings.chapterDocuments || {}))
  const sources = (sourceRows || []).filter((row) => {
    if (chapterIds.has(row.id)) return false
    return ((row.metadata as Record<string, unknown> | null) || {}).origin !== "programme_interest_workup"
  })
  const { selectEvidenceForTask, withCitationPages } = await import("@/lib/programme/evidence-select")
  const evidence = await selectEvidenceForTask({
    supabase,
    documents: sources,
    query: [
      ...interests.map((interest) => `${name(interest)} ${interest.summary || ""}`),
      "samenhang spanning dilemma afweging versterken combineren conflict ruimte schaarste",
      "coherence tension dilemma trade-off reinforce combine conflict space scarcity",
    ].join("\n"),
    budgetChars: 30000,
  })

  const interestBlock = interests
    .map((interest) => {
      const text = workupText(interest.workup_document_id)
      return `### ${name(interest)}\n${interest.summary || ""}${text ? `\nWork-up: ${text}` : ""}`
    })
    .join("\n\n")
  const measureBlock = measures
    .map((measure) => {
      const linked = (measure.interest_ids || [])
        .map((id: string) => interestById.get(id))
        .filter(Boolean)
        .map((interest: { reference: string | null; label: string } | undefined) => interest!.reference || interest!.label)
      return `- [${measure.id}] ${measure.title}: ${measure.specific_action || ""}${linked.length ? ` (interests ${linked.join(", ")})` : ""}`
    })
    .join("\n")

  const { getLatestAgentVersion } = await import("@/lib/actions/agent")
  const { getTenantIdForSpace, resolveAgentVersionLlm } = await import("@/lib/llm/resolve")
  const { loadPromptLayers } = await import("@/lib/llm/prompts")
  const { compileSystemPrompt } = await import("@/lib/chat/playbook-compiler")
  const agentId = boundAgentId(bindings, "vision") || boundAgentId(bindings, "analysis")
  const agentVersion = agentId ? (await getLatestAgentVersion(agentId)).data : null
  const tenantId = await getTenantIdForSpace(workspace.space_id)
  let llm
  try {
    llm = await resolveAgentVersionLlm({ tenantId, spaceId: workspace.space_id, agentVersion })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not resolve the analysis model" }
  }
  const layers = await loadPromptLayers("vision")
  const { systemPrompt } = compileSystemPrompt({
    kind: "vision",
    userLanguage,
    identity: layers.identity,
    playbookBody: "",
    runtimeSections: `LINKS ACROSS INTERESTS (mandatory):
You compare interests that were first worked up one by one. Report only links the material supports:
- "reinforces": work on one interest helps another.
- "shared_measure": one measure could serve several interests, or measures under different interests could be combined.
- "dilemma": interests pull against each other (for example the same space, grid capacity, water, or money), so a choice is needed.
Each finding names at least two interests by their number, has a short title, two or three sentences of explanation, the measure ids it concerns when there are any, and citations with documentId, pageNumber, and an exact quote.
Which measures already serve several interests, and which look alike, is listed for staff separately; do not report a measure only for that. Report a "shared_measure" only when combining or reshaping measures would create something the list does not already show.
Give between three and eight findings, most important first. Look hard for dilemmas: they are what staff most need to see.
Return JSON only: {"findings":[{"kind":"reinforces"|"shared_measure"|"dilemma","title":string,"interests":[string],"measureIds":[string],"explanation":string,"citations":[{"documentId":string,"pageNumber":number,"sectionId":string,"quote":string}]}]}.
Do not invent documentIds, numbers, or decisions. Staff decide; you only point out links.`,
  })

  const { completeLlm } = await import("@/lib/llm")
  let raw = ""
  try {
    const completion = await completeLlm({
      provider: llm.provider,
      endpoint: llm.endpoint,
      apiKey: llm.apiKey,
      model: llm.model,
      json: true,
      maxTokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `INTERESTS:\n${interestBlock}\n\nMEASURES:\n${measureBlock || "(none yet)"}\n\nEVIDENCE:\n${evidence.text}`,
        },
      ],
    })
    raw = completion.text
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The comparison could not run" }
  }

  const fromModel = parseCoherenceJson(raw, interests, new Set(measures.map((measure) => measure.id))).map((finding) => ({
    ...finding,
    citations: withCitationPages(finding.citations, evidence.spans),
  }))
  if (fromModel.length === 0 && signals.length === 0) return { error: `${llm.model} found no links it could support. Try again.` }

  const { recordGenerationRun } = await import("@/lib/actions/generation-run")
  const run = await recordGenerationRun({
    workspaceId,
    kind: "vision",
    agentVersionId: agentVersion?.id ?? null,
    provider: llm.provider,
    model: llm.model,
    instructions: "Links across interests",
    sourceDocumentIds: sources.map((source) => source.id),
    outputRef: `coherence:${fromModel.length + signals.length}`,
    citations: { evidenceCap: { used: evidence.used, total: evidence.total } },
    userId: user?.id,
  })

  await supabase.from("programme_coherence_findings").delete().eq("workspace_id", workspaceId).is("decision", null)
  const rows = [...signals, ...fromModel].map((finding: CoherenceDraft) => ({
    workspace_id: workspaceId,
    kind: finding.kind,
    title: finding.title,
    explanation: finding.explanation,
    interest_ids: finding.interestIds,
    measure_ids: finding.measureIds,
    citations: finding.citations,
    origin: finding.origin,
    generation_run_id: run.data?.id ?? null,
  }))
  if (rows.length) {
    const { error } = await supabase.from("programme_coherence_findings").insert(rows)
    if (error) return { error: error.message }
  }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return listCoherenceFindings(workspaceId)
}

export async function setCoherenceDecision(
  workspaceId: string,
  findingId: string,
  decision: "keep" | "adapt" | "drop" | null,
  reason?: string,
) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const trimmed = reason?.trim() || ""
  if (decision === "drop" && !trimmed) return { error: "Give a reason for setting this aside." }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase
    .from("programme_coherence_findings")
    .update({
      decision,
      decision_reason: decision ? trimmed || null : null,
      decided_by: decision ? user?.id ?? null : null,
      decided_at: decision ? new Date().toISOString() : null,
    })
    .eq("id", findingId)
    .eq("workspace_id", workspaceId)
  if (error) return { error: error.message }
  revalidatePath(`/workspaces/${workspaceId}/programme`)
  return { data: { id: findingId, decision } }
}
