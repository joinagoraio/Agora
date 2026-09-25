import "server-only"

import { createClient } from "@/lib/supabase/server"
import { mapBackgroundJob, type BackgroundJob, type BackgroundJobKind, type BackgroundJobProgress } from "@/lib/programme/jobs"

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function latestJob(supabase: Supabase, workspaceId: string, kind: BackgroundJobKind): Promise<BackgroundJob | null> {
  const { data } = await supabase
    .from("programme_jobs")
    .select("id, kind, status, progress, error, created_at, started_at, updated_at, completed_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? mapBackgroundJob(data as Record<string, unknown>) : null
}

export async function insertJob(
  supabase: Supabase,
  workspaceId: string,
  kind: BackgroundJobKind,
  progress: BackgroundJobProgress,
  userId: string | null,
): Promise<{ id: string } | { error: string }> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("programme_jobs")
    .insert({
      workspace_id: workspaceId,
      kind,
      status: "running",
      progress,
      created_by: userId,
      started_at: now,
      updated_at: now,
    })
    .select("id")
    .single()
  if (error || !data) return { error: error?.message || "Could not start the job" }
  return { id: data.id as string }
}

export async function updateJob(
  supabase: Supabase,
  jobId: string,
  patch: { progress?: BackgroundJobProgress; status?: BackgroundJob["status"]; error?: string | null },
) {
  const now = new Date().toISOString()
  await supabase
    .from("programme_jobs")
    .update({
      ...(patch.progress ? { progress: patch.progress } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.status && patch.status !== "running" ? { completed_at: now } : {}),
      updated_at: now,
    })
    .eq("id", jobId)
}
