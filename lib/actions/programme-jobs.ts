"use server"

import { after } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { insertJob, latestJob, updateJob } from "@/lib/programme/job-store"
import {
  BACKGROUND_JOB_KINDS,
  mapBackgroundJob,
  type BackgroundJob,
  type BackgroundJobKind,
  type BackgroundJobProgress,
} from "@/lib/programme/jobs"
import { logger } from "@/lib/utils/logger"

type Supabase = Awaited<ReturnType<typeof createClient>>
type Outcome = { error?: string; result?: Record<string, number | string> }
type Step = (progress: Partial<BackgroundJobProgress>) => Promise<void>

/**
 * Starts a long AI step in the background and returns at once, so the page stays responsive
 * and the step keeps going when the user navigates away or reloads.
 */
async function startBackgroundJob(
  workspaceId: string,
  kind: BackgroundJobKind,
  initial: BackgroundJobProgress,
  run: (step: Step) => Promise<Outcome>,
): Promise<{ data?: BackgroundJob; error?: string }> {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const running = await latestJob(supabase, workspaceId, kind)
  if (running?.status === "running") return { data: running }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const inserted = await insertJob(supabase, workspaceId, kind, initial, user?.id ?? null)
  if ("error" in inserted) return { error: inserted.error }
  const jobId = inserted.id

  after(async () => {
    const client: Supabase = await createClient()
    let progress: BackgroundJobProgress = { ...initial }
    const step: Step = async (next) => {
      progress = { ...progress, ...next }
      await updateJob(client, jobId, { progress })
    }
    try {
      const outcome = await run(step)
      await updateJob(client, jobId, {
        status: outcome.error ? "failed" : "done",
        error: outcome.error ?? null,
        progress: { ...progress, current: null, result: outcome.result ?? progress.result ?? null },
      })
    } catch (error) {
      logger.error("[ProgrammeJob] Background job failed", error, { kind, workspaceId })
      await updateJob(client, jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : "The step stopped unexpectedly",
      })
    }
  })

  return { data: mapBackgroundJob({ id: jobId, kind, status: "running", progress: initial, updated_at: new Date().toISOString() }) }
}

/** The latest job of every kind, for progress on any screen. */
export async function listProgrammeJobs(workspaceId: string): Promise<{ data: Partial<Record<BackgroundJobKind, BackgroundJob>> }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("programme_jobs")
    .select("id, kind, status, progress, error, created_at, started_at, updated_at, completed_at")
    .eq("workspace_id", workspaceId)
    .in("kind", [...BACKGROUND_JOB_KINDS])
    .order("created_at", { ascending: false })
    .limit(40)
  const jobs: Partial<Record<BackgroundJobKind, BackgroundJob>> = {}
  for (const row of data || []) {
    const job = mapBackgroundJob(row as Record<string, unknown>)
    if (!jobs[job.kind]) jobs[job.kind] = job
  }
  return { data: jobs }
}

export async function startInterestWorkups(workspaceId: string, interestIds: string[]) {
  const supabase = await createClient()
  const { data: rows } = await supabase
    .from("programme_interests")
    .select("id, reference, label")
    .eq("workspace_id", workspaceId)
    .in("id", interestIds.length ? interestIds : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order", { ascending: true })
  const interests = rows || []
  if (interests.length === 0) return { error: "Choose at least one interest to work up." }
  const name = (row: { reference: string | null; label: string }) => [row.reference, row.label].filter(Boolean).join(" ")
  return startBackgroundJob(
    workspaceId,
    "workup",
    { done: 0, total: interests.length, current: name(interests[0]!), targetId: interests.length === 1 ? interests[0]!.id : null },
    async (step) => {
      const { workUpProgrammeInterest } = await import("@/lib/actions/interests")
      const failed: string[] = []
      for (const [index, interest] of interests.entries()) {
        await step({ done: index, current: name(interest), targetId: interest.id })
        const result = await workUpProgrammeInterest(workspaceId, interest.id)
        if (result.error) failed.push(`${name(interest)}: ${result.error}`)
      }
      await step({ done: interests.length })
      if (failed.length === interests.length) return { error: failed.join("; ") }
      return { result: { done: interests.length - failed.length, failed: failed.length } }
    },
  )
}

export async function startMeasureGeneration(
  workspaceId: string,
  options: { interestId?: string | null; instructions?: string; count?: number },
) {
  let label: string | null = null
  if (options.interestId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("programme_interests")
      .select("reference, label")
      .eq("id", options.interestId)
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    label = data ? [data.reference, data.label].filter(Boolean).join(" ") : null
  }
  return startBackgroundJob(
    workspaceId,
    "measures",
    { done: 0, total: 1, current: label, targetId: options.interestId ?? null },
    async () => {
      const { generateProgrammeMeasuresFromContext } = await import("@/lib/actions/measures")
      const result = await generateProgrammeMeasuresFromContext(workspaceId, {
        interestId: options.interestId ?? undefined,
        instructions: options.instructions,
        count: options.count ?? 4,
      })
      if (result.error || !result.data) return { error: result.error || "No measures were proposed" }
      return { result: { saved: result.data.saved, errors: result.data.errors.length } }
    },
  )
}

export async function startCoherenceRun(workspaceId: string) {
  return startBackgroundJob(workspaceId, "coherence", { done: 0, total: 1 }, async () => {
    const { runCoherenceAnalysis } = await import("@/lib/actions/coherence")
    const result = await runCoherenceAnalysis(workspaceId)
    if (result.error || !("data" in result) || !result.data) return { error: result.error || "The comparison could not run" }
    const findings = result.data
    return {
      result: {
        total: findings.length,
        dilemma: findings.filter((finding) => finding.kind === "dilemma").length,
        reinforces: findings.filter((finding) => finding.kind === "reinforces").length,
        shared: findings.filter((finding) => finding.kind === "shared_measure").length,
      },
    }
  })
}

export async function startRoleCheck(workspaceId: string) {
  return startBackgroundJob(workspaceId, "roles", { done: 0, total: 1 }, async () => {
    const { checkMeasureRoles } = await import("@/lib/actions/measures")
    const result = await checkMeasureRoles(workspaceId)
    if (result.error || !result.data) return { error: result.error || "The role check failed" }
    return { result: { checked: result.data.checked, total: result.data.total } }
  })
}

export async function startChapterRegeneration(
  workspaceId: string,
  outlineNodeId: string,
  options: { documentId: string; instructions?: string; title?: string },
) {
  return startBackgroundJob(
    workspaceId,
    "chapter",
    { done: 0, total: 1, current: options.title ?? null, targetId: outlineNodeId },
    async () => {
      const { regenerateProgrammeChapter } = await import("@/lib/actions/programme")
      const result = await regenerateProgrammeChapter(workspaceId, outlineNodeId, {
        documentId: options.documentId,
        instructions: options.instructions,
      })
      if (result.error || !result.data) return { error: result.error || "The chapter could not be written" }
      const report = result.data.groundedness
      return {
        result: {
          found: report?.verifiedCount ?? 0,
          total: report?.citationCount ?? 0,
          uncited: (report?.issues || []).filter((issue: { reason: string }) => issue.reason === "missing_citation").length,
        },
      }
    },
  )
}

/** Fill every empty required chapter in the background; progress is kept on the fill job. */
export async function startFillChapters(workspaceId: string, spaceId: string, options?: { retry?: boolean }) {
  try {
    await requireAuthAndPermission("workspace:update", { workspaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  const supabase = await createClient()
  const running = await latestJob(supabase, workspaceId, "fill")
  if (running?.status === "running") return { data: { startedAt: running.startedAt ?? running.updatedAt } }
  const startedAt = new Date().toISOString()
  after(async () => {
    try {
      const { fillProgrammeChapters } = await import("@/lib/actions/programme")
      await fillProgrammeChapters(workspaceId, spaceId, options)
    } catch (error) {
      logger.error("[ProgrammeJob] Fill failed", error, { workspaceId })
    }
  })
  return { data: { startedAt } }
}
