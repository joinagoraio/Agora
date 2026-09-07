/**
 * Pure helpers for review assignment, chapter workflow, merge, and fill jobs.
 */

export const CHAPTER_WORKFLOW_STATUSES = ["generated", "in_review", "revised", "approved"] as const
export type ChapterWorkflowStatus = (typeof CHAPTER_WORKFLOW_STATUSES)[number]

export function isChapterWorkflowStatus(value: unknown): value is ChapterWorkflowStatus {
  return typeof value === "string" && (CHAPTER_WORKFLOW_STATUSES as readonly string[]).includes(value)
}

export function parseChapterWorkflow(metadata: unknown): ChapterWorkflowStatus {
  const raw =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).programmeWorkflowStatus
      : null
  return isChapterWorkflowStatus(raw) ? raw : "generated"
}

export type ChapterListStatus = "empty" | ChapterWorkflowStatus

export function chapterListStatus(input: {
  hasDocument: boolean
  workflowStatus?: string | null
}): ChapterListStatus {
  if (!input.hasDocument) return "empty"
  return isChapterWorkflowStatus(input.workflowStatus) ? input.workflowStatus : "generated"
}

export type ProgrammePolicies = {
  distinctReviewer: boolean
  stakeholderExportRequiresFreeze: boolean
}

export function parseProgrammePolicies(metadata: unknown): ProgrammePolicies {
  const raw = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {}
  return {
    distinctReviewer: raw.distinctReviewer === true,
    stakeholderExportRequiresFreeze: raw.stakeholderExportRequiresFreeze === true,
  }
}

export function evaluateDistinctReviewerApproval(input: {
  distinctReviewer: boolean
  actorId: string | null | undefined
  assignedReviewerId: string | null | undefined
  createdBy: string | null | undefined
}): { ok: true } | { ok: false; reason: string } {
  if (!input.distinctReviewer) return { ok: true }
  if (!input.actorId) return { ok: false, reason: "Sign in to approve" }
  if (!input.assignedReviewerId) {
    return { ok: false, reason: "Distinct-reviewer policy: assign a reviewer before approval" }
  }
  if (input.assignedReviewerId === input.createdBy && input.actorId === input.createdBy) {
    return { ok: false, reason: "Distinct-reviewer policy: the author cannot approve their own item" }
  }
  if (input.actorId !== input.assignedReviewerId) {
    return { ok: false, reason: "Distinct-reviewer policy: only the assigned reviewer can approve" }
  }
  return { ok: true }
}

export type CitationLike = {
  documentId: string
  pageNumber?: number
  sectionId?: string
  quote?: string
}

export function citationKey(citation: CitationLike): string {
  return `${citation.documentId}|${citation.pageNumber ?? ""}|${citation.sectionId ?? ""}|${citation.quote ?? ""}`
}

export function mergeCitationSets(keep: CitationLike[], drop: CitationLike[]): CitationLike[] {
  const seen = new Set<string>()
  const out: CitationLike[] = []
  for (const citation of [...keep, ...drop]) {
    if (!citation?.documentId) continue
    const key = citationKey(citation)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(citation)
  }
  return out
}

export const FILL_JOB_STATUSES = ["running", "cancelled", "done", "failed"] as const
export type FillJobStatus = (typeof FILL_JOB_STATUSES)[number]
export type FillChapterStatus = "pending" | "ok" | "error" | "cancelled"

export type FillJobProgressItem = {
  nodeId: string
  title: string
  status: FillChapterStatus
  error?: string
}

export type FillJob = {
  id: string
  status: FillJobStatus
  cancelled: boolean
  progress: FillJobProgressItem[]
  startedAt: string
  updatedAt: string
}

function isFillChapterStatus(value: unknown): value is FillChapterStatus {
  return value === "pending" || value === "ok" || value === "error" || value === "cancelled"
}

export function parseFillProgress(progress: unknown): FillJobProgressItem[] {
  if (!Array.isArray(progress)) return []
  const items: FillJobProgressItem[] = []
  for (const item of progress) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (typeof row.nodeId !== "string" || typeof row.title !== "string") continue
    items.push({
      nodeId: row.nodeId,
      title: row.title,
      status: isFillChapterStatus(row.status) ? row.status : "pending",
      error: typeof row.error === "string" ? row.error : undefined,
    })
  }
  return items
}

export function parseFillJobRecord(raw: unknown): FillJob | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const job = raw as Record<string, unknown>
  if (typeof job.id !== "string" || !job.id) return null
  const status = FILL_JOB_STATUSES.includes(job.status as FillJobStatus) ? (job.status as FillJobStatus) : "running"
  return {
    id: job.id,
    status,
    cancelled: job.cancelled === true,
    progress: parseFillProgress(job.progress),
    startedAt: typeof job.startedAt === "string" ? job.startedAt : typeof job.started_at === "string" ? job.started_at : "",
    updatedAt: typeof job.updatedAt === "string" ? job.updatedAt : typeof job.updated_at === "string" ? job.updated_at : "",
  }
}

export function parseFillJob(metadata: unknown): FillJob | null {
  const raw =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).fillJob : null
  return parseFillJobRecord(raw)
}

export function remainingFillNodes<T extends { id: string }>(
  nodes: T[],
  progress: FillJobProgressItem[],
): T[] {
  const done = new Set(progress.filter((item) => item.status === "ok").map((item) => item.nodeId))
  return nodes.filter((node) => !done.has(node.id))
}

export function mergeOkFillProgress(progressLists: FillJobProgressItem[][]): FillJobProgressItem[] {
  const seen = new Set<string>()
  const reused: FillJobProgressItem[] = []
  for (const list of progressLists) {
    for (const item of list) {
      if (item.status !== "ok" || seen.has(item.nodeId)) continue
      seen.add(item.nodeId)
      reused.push(item)
    }
  }
  return reused
}
