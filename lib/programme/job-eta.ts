export type JobProgressItem = {
  status: string
}

export function estimateJobEta(input: {
  startedAt?: string | null
  now?: number
  progress: JobProgressItem[]
}): { remainingMs: number | null; remainingCount: number; doneCount: number } {
  const doneCount = input.progress.filter((item) => item.status === "ok" || item.status === "error").length
  const remainingCount = input.progress.filter((item) => item.status === "pending" || item.status === "running").length
  if (!input.startedAt || doneCount === 0 || remainingCount === 0) {
    return { remainingMs: remainingCount === 0 ? 0 : null, remainingCount, doneCount }
  }
  const elapsed = Math.max(1, (input.now ?? Date.now()) - new Date(input.startedAt).getTime())
  const perItem = elapsed / doneCount
  return { remainingMs: Math.round(perItem * remainingCount), remainingCount, doneCount }
}

export function formatEtaMs(ms: number | null): string {
  if (ms == null) return "—"
  if (ms <= 0) return "0s"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.round(seconds / 60)}m`
}
