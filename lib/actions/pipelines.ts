"use server"

import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { generateProgrammeMeasuresFromContext, importMeasureCandidatesFromJson, listProgrammeMeasures, upsertProgrammeMeasure } from "@/lib/actions/measures"
import { runBoundAgentAnalysis } from "@/lib/actions/analysis"
import { parseMeasureCandidatesJson } from "@/lib/programme/structured-artefacts"

/** F14: selected policy prose → candidate measures (does not blind-insert without parse). */
export async function convertPolicyProseToMeasures(workspaceId: string, instructions?: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  return generateProgrammeMeasuresFromContext(workspaceId, {
    instructions:
      instructions?.trim() ||
      "Convert bound existing-policy prose into candidate measures. Prefer adapt over inventing new policy.",
    count: 6,
  })
}

/** F14: vision → ambition/goal skeleton via vision agent + graph. */
export async function generateVisionSkeleton(workspaceId: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  return runBoundAgentAnalysis({
    workspaceId,
    kind: "vision",
    instructions: "Extract ambitions, provincial interests, challenges, and goals into a coverage report and graph.",
  })
}

/** F14 / F16: merge JSON fragment with dual provenance — skip exact title duplicates. */
export async function mergeMeasureFragment(workspaceId: string, rawJson: string) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const existing = await listProgrammeMeasures(workspaceId)
  const titles = new Set((existing.data || []).map((m: { title: string }) => m.title.trim().toLowerCase()))
  const parsed = parseMeasureCandidatesJson(rawJson)
  const merged = []
  const skipped = []
  for (const measure of parsed.measures) {
    const key = measure.title.trim().toLowerCase()
    if (titles.has(key)) {
      skipped.push(measure.title)
      continue
    }
    const saved = await upsertProgrammeMeasure(workspaceId, {
      ...measure,
      narrative: [measure.narrative, "Merged from fragment import"].filter(Boolean).join("\n"),
    })
    if (saved.data) merged.push(saved.data)
  }
  if (parsed.measures.length === 0 && parsed.errors.length) {
    const imported = await importMeasureCandidatesFromJson(workspaceId, rawJson)
    return { error: imported.error, data: { merged: imported.data?.saved ?? 0, skipped, errors: imported.data?.errors ?? parsed.errors } }
  }
  return { data: { merged: merged.length, skipped, errors: parsed.errors } }
}

export async function findDuplicateMeasures(workspaceId: string) {
  const existing = await listProgrammeMeasures(workspaceId)
  const byTitle = new Map<string, Array<{ id: string; title: string; outline_node_id?: string | null }>>()
  for (const measure of existing.data || []) {
    const key = String(measure.title || "")
      .trim()
      .toLowerCase()
    const list = byTitle.get(key) || []
    list.push(measure)
    byTitle.set(key, list)
  }
  const duplicates = [...byTitle.values()].filter((list) => list.length > 1)
  return { data: duplicates }
}
