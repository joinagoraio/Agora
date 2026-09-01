"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import {
  assertDestructiveAllowed,
  isPastRetention,
  parseRetentionPolicy,
  type RetentionPolicy,
} from "@/lib/programme/reliability"
import { isSpaceHelpAiDisabled } from "@/lib/guidance/help-flag"

export async function getSpaceRetentionPolicy(spaceId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("spaces").select("metadata").eq("id", spaceId).single()
  if (error || !data) {
    return {
      error: error?.message || "Space not found",
      data: parseRetentionPolicy(null),
      helpAiDisabled: false,
    }
  }
  const metadata = data.metadata as Record<string, unknown>
  return {
    data: parseRetentionPolicy(metadata),
    helpAiDisabled: isSpaceHelpAiDisabled(metadata),
  }
}

export async function updateSpaceRetentionPolicy(
  spaceId: string,
  policy: RetentionPolicy,
  extras?: { helpAiDisabled?: boolean },
) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const normalized = parseRetentionPolicy({ reliabilityPolicy: policy })
  const supabase = await createClient()
  const { data: space, error: loadError } = await supabase
    .from("spaces")
    .select("id, metadata")
    .eq("id", spaceId)
    .single()
  if (loadError || !space) return { error: loadError?.message || "Space not found" }

  const current = ((space.metadata as Record<string, unknown>) || {})
  const metadata = {
    ...current,
    reliabilityPolicy: normalized,
    helpAiDisabled: extras?.helpAiDisabled ?? isSpaceHelpAiDisabled(current),
  }

  const { error } = await supabase
    .from("spaces")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", spaceId)

  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}/settings`)
  return { data: normalized, helpAiDisabled: isSpaceHelpAiDisabled(metadata) }
}

/**
 * Build a tenant-exit export package for a space (workspaces, runs, measures, exports, policy).
 */
export async function buildTenantExitExport(spaceId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const supabase = await createClient()
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id, name, metadata, created_at")
    .eq("id", spaceId)
    .single()
  if (spaceError || !space) return { error: spaceError?.message || "Space not found" }

  const policy = parseRetentionPolicy(space.metadata as Record<string, unknown>)

  const { data: workspaces, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, kind, metadata, created_at")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: true })
  if (wsError) return { error: wsError.message }

  const workspaceIds = (workspaces || []).map((w) => w.id)
  const [runs, measures, exports, playbooks] = await Promise.all([
    workspaceIds.length
      ? supabase
          .from("generation_runs")
          .select("id, workspace_id, kind, model, created_at, source_document_ids, unused_document_ids, output_ref")
          .in("workspace_id", workspaceIds)
          .order("created_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
    workspaceIds.length
      ? supabase
          .from("programme_measures")
          .select("id, workspace_id, title, measure_type, workflow_status, effects_direction, effects_deviation, citations, created_at")
          .in("workspace_id", workspaceIds)
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
    workspaceIds.length
      ? supabase
          .from("export_jobs")
          .select("id, workspace_id, format, status, created_at, completed_at, error")
          .in("workspace_id", workspaceIds)
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("playbooks").select("id, name, workspace_kind, created_at").eq("space_id", spaceId),
  ])

  if (runs.error) return { error: runs.error.message }
  if (measures.error) return { error: measures.error.message }
  if (exports.error) return { error: exports.error.message }
  if (playbooks.error) return { error: playbooks.error.message }

  return {
    data: {
      exportedAt: new Date().toISOString(),
      space: {
        id: space.id,
        name: space.name,
        createdAt: space.created_at,
      },
      reliabilityPolicy: policy,
      workspaces: workspaces || [],
      playbooks: playbooks.data || [],
      generationRuns: runs.data || [],
      measures: measures.data || [],
      exportJobs: exports.data || [],
    },
  }
}

/**
 * Delete generation runs / export jobs past retention, unless legal hold is active.
 */
export async function pruneExpiredProgrammeArtefacts(spaceId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }

  const policyResult = await getSpaceRetentionPolicy(spaceId)
  const policy = policyResult.data
  const hold = assertDestructiveAllowed(policy)
  if (!hold.ok) return { error: hold.reason }

  const supabase = await createClient()
  const { data: workspaces, error: wsError } = await supabase.from("workspaces").select("id").eq("space_id", spaceId)
  if (wsError) return { error: wsError.message }
  const workspaceIds = (workspaces || []).map((w) => w.id)
  if (workspaceIds.length === 0) return { data: { deletedRuns: 0, deletedExports: 0 } }

  const now = new Date()
  const { data: runs } = await supabase
    .from("generation_runs")
    .select("id, created_at")
    .in("workspace_id", workspaceIds)
    .limit(5000)
  const expiredRunIds = (runs || [])
    .filter((r) => isPastRetention(r.created_at, policy.retainGenerationsDays, now))
    .map((r) => r.id)

  const { data: jobs } = await supabase
    .from("export_jobs")
    .select("id, created_at")
    .in("workspace_id", workspaceIds)
    .limit(5000)
  const expiredJobIds = (jobs || [])
    .filter((j) => isPastRetention(j.created_at, policy.retainExportsDays, now))
    .map((j) => j.id)

  let deletedRuns = 0
  let deletedExports = 0

  if (expiredRunIds.length > 0) {
    const { error, count } = await supabase
      .from("generation_runs")
      .delete({ count: "exact" })
      .in("id", expiredRunIds)
    if (error) return { error: error.message }
    deletedRuns = count ?? expiredRunIds.length
  }

  if (expiredJobIds.length > 0) {
    const { error, count } = await supabase
      .from("export_jobs")
      .delete({ count: "exact" })
      .in("id", expiredJobIds)
    if (error) return { error: error.message }
    deletedExports = count ?? expiredJobIds.length
  }

  revalidatePath(`/spaces/${spaceId}/settings`)
  return { data: { deletedRuns, deletedExports } }
}
