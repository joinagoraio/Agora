export const BACKGROUND_JOB_KINDS = ["workup", "measures", "coherence", "roles", "chapter", "fill"] as const
export type BackgroundJobKind = (typeof BACKGROUND_JOB_KINDS)[number]

export type BackgroundJobStatus = "running" | "done" | "failed" | "cancelled"

export type BackgroundJobProgress = {
  done: number
  total: number
  /** What the job is working on now, for example an interest or chapter title. */
  current?: string | null
  /** The subject the job was started for, for example an interest or chapter id. */
  targetId?: string | null
  /** Short result figures for the finished message. */
  result?: Record<string, number | string> | null
}

export type BackgroundJob = {
  id: string
  kind: BackgroundJobKind
  status: BackgroundJobStatus
  progress: BackgroundJobProgress
  error: string | null
  startedAt: string | null
  updatedAt: string
  completedAt: string | null
}

/** A job that stopped updating this long ago is treated as stopped, for example after a server restart. */
export const STALE_JOB_MS = 20 * 60 * 1000

function asProgress(raw: unknown): BackgroundJobProgress {
  if (Array.isArray(raw)) {
    const items = raw as Array<{ status?: string; title?: string }>
    const done = items.filter((item) => item.status === "ok" || item.status === "error").length
    const current = items.find((item) => item.status === "pending")?.title ?? null
    return { done, total: items.length, current }
  }
  if (!raw || typeof raw !== "object") return { done: 0, total: 0 }
  const row = raw as Record<string, unknown>
  return {
    done: typeof row.done === "number" ? row.done : 0,
    total: typeof row.total === "number" ? row.total : 0,
    current: typeof row.current === "string" ? row.current : null,
    targetId: typeof row.targetId === "string" ? row.targetId : null,
    result: row.result && typeof row.result === "object" ? (row.result as Record<string, number | string>) : null,
  }
}

export function mapBackgroundJob(row: Record<string, unknown>, now = Date.now()): BackgroundJob {
  const updatedAt = String(row.updated_at || row.created_at || new Date(now).toISOString())
  let status = (["running", "done", "failed", "cancelled"].includes(String(row.status)) ? row.status : "failed") as BackgroundJobStatus
  if (row.status === "pending") status = "running"
  let error = typeof row.error === "string" ? row.error : null
  if (status === "running" && now - new Date(updatedAt).getTime() > STALE_JOB_MS) {
    status = "failed"
    error = error || "stale"
  }
  return {
    id: String(row.id),
    kind: row.kind as BackgroundJobKind,
    status,
    progress: asProgress(row.progress),
    error,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    updatedAt,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
  }
}
