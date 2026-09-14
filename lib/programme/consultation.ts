/**
 * Consultation comments attach to a published freeze, not the live editor.
 * programme_comments remain internal team notes and are not this ledger.
 */

export const CONSULTATION_COMMENT_STATUSES = [
  "open",
  "in_discussion",
  "accepted",
  "accepted_with_modification",
  "rejected",
  "merged",
  "out_of_scope",
] as const
export type ConsultationCommentStatus = (typeof CONSULTATION_COMMENT_STATUSES)[number]

export const UNRESOLVED_CONSULTATION_STATUSES = ["open", "in_discussion"] as const
export type UnresolvedConsultationStatus = (typeof UNRESOLVED_CONSULTATION_STATUSES)[number]

export const TERMINAL_CONSULTATION_STATUSES = [
  "accepted",
  "accepted_with_modification",
  "rejected",
  "merged",
  "out_of_scope",
] as const
export type TerminalConsultationStatus = (typeof TERMINAL_CONSULTATION_STATUSES)[number]

export const CONSULTATION_WINDOW_STATUSES = ["scheduled", "open", "closed"] as const
export type ConsultationWindowStatus = (typeof CONSULTATION_WINDOW_STATUSES)[number]

export const CONSULTATION_EVENT_SOURCES = ["owner", "cluster", "system"] as const
export type ConsultationEventSource = (typeof CONSULTATION_EVENT_SOURCES)[number]

const ALLOWED_TRANSITIONS: Record<ConsultationCommentStatus, ConsultationCommentStatus[]> = {
  open: [
    "in_discussion",
    "accepted",
    "accepted_with_modification",
    "rejected",
    "merged",
    "out_of_scope",
  ],
  in_discussion: [
    "open",
    "accepted",
    "accepted_with_modification",
    "rejected",
    "merged",
    "out_of_scope",
  ],
  accepted: ["in_discussion"],
  accepted_with_modification: ["in_discussion"],
  rejected: ["in_discussion"],
  merged: ["in_discussion"],
  out_of_scope: ["in_discussion"],
}

export function isConsultationCommentStatus(value: unknown): value is ConsultationCommentStatus {
  return typeof value === "string" && (CONSULTATION_COMMENT_STATUSES as readonly string[]).includes(value)
}

export function isUnresolvedConsultationStatus(value: unknown): value is UnresolvedConsultationStatus {
  return typeof value === "string" && (UNRESOLVED_CONSULTATION_STATUSES as readonly string[]).includes(value)
}

export function consultationWindowStatus(
  input: { opensAt: string; closesAt: string; closedAt?: string | null },
  now: Date = new Date(),
): ConsultationWindowStatus {
  if (input.closedAt) return "closed"
  const opens = new Date(input.opensAt)
  const closes = new Date(input.closesAt)
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) return "closed"
  if (now.getTime() < opens.getTime()) return "scheduled"
  if (now.getTime() >= closes.getTime()) return "closed"
  return "open"
}

export function assertConsultationWindow(input: { opensAt: string; closesAt: string }):
  | { ok: true }
  | { ok: false; reason: string } {
  const opens = new Date(input.opensAt)
  const closes = new Date(input.closesAt)
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) {
    return { ok: false, reason: "Consultation needs a valid opening and closing time" }
  }
  if (closes.getTime() <= opens.getTime()) {
    return { ok: false, reason: "Consultation must close after it opens" }
  }
  return { ok: true }
}

export function canSubmitConsultationComment(input: {
  signedIn: boolean
  window: { opensAt: string; closesAt: string; closedAt?: string | null }
  now?: Date
}): { ok: true } | { ok: false; reason: string } {
  if (!input.signedIn) return { ok: false, reason: "Sign in to comment on this published snapshot" }
  const status = consultationWindowStatus(input.window, input.now)
  if (status === "scheduled") return { ok: false, reason: "The comment period has not opened yet" }
  if (status === "closed") return { ok: false, reason: "The comment period is closed" }
  return { ok: true }
}

export function assertConsultationCommentInput(input: { body: string; quoteText: string }):
  | { ok: true; body: string; quoteText: string }
  | { ok: false; reason: string } {
  const body = input.body.trim()
  const quoteText = input.quoteText.trim()
  if (!quoteText) return { ok: false, reason: "Quote the passage you are commenting on" }
  if (!body) return { ok: false, reason: "Comment cannot be empty" }
  return { ok: true, body, quoteText }
}

export function assertConsultationTransition(input: {
  from: ConsultationCommentStatus
  to: ConsultationCommentStatus
  reason?: string | null
}): { ok: true } | { ok: false; reason: string } {
  if (input.from === input.to) {
    return { ok: false, reason: "Comment is already in that status" }
  }
  if (!ALLOWED_TRANSITIONS[input.from].includes(input.to)) {
    return { ok: false, reason: `Cannot move a ${input.from} comment to ${input.to}` }
  }
  if (input.to !== "open" && !input.reason?.trim()) {
    return { ok: false, reason: "Record a reason for this decision" }
  }
  return { ok: true }
}

export function planClusterResolution(input: {
  memberIds: string[]
  correctedCommentIds: Iterable<string>
  statuses: Record<string, ConsultationCommentStatus>
  toStatus: ConsultationCommentStatus
  reason?: string | null
}): { ok: true; applyTo: string[] } | { ok: false; reason: string } {
  if (input.toStatus === "open") {
    return { ok: false, reason: "A cluster cannot reset comments to open" }
  }
  const allowedClusterStatus =
    input.toStatus === "in_discussion" ||
    TERMINAL_CONSULTATION_STATUSES.includes(input.toStatus as TerminalConsultationStatus)
  if (!allowedClusterStatus) {
    return { ok: false, reason: "Choose a decision for the cluster" }
  }
  if (!input.reason?.trim()) {
    return { ok: false, reason: "Record a reason for this decision" }
  }
  const corrected = new Set(input.correctedCommentIds)
  const applyTo = input.memberIds.filter((id) => {
    if (corrected.has(id)) return false
    return isUnresolvedConsultationStatus(input.statuses[id])
  })
  return { ok: true, applyTo }
}

export function canPublishProgrammeSnapshot(input: {
  hasFreeze: boolean
  consultationWindowOpen: boolean
  unresolvedCommentCount: number
}): { ok: true } | { ok: false; reason: string } {
  if (!input.hasFreeze) {
    return { ok: false, reason: "Freeze this programme before publishing a snapshot" }
  }
  if (input.consultationWindowOpen) {
    return { ok: false, reason: "Close the consultation period before publishing a new snapshot" }
  }
  if (input.unresolvedCommentCount > 0) {
    return {
      ok: false,
      reason: "Resolve open consultation comments before publishing a new snapshot",
    }
  }
  return { ok: true }
}

export function buildConsultationManifestSlice(input: {
  consultations: Array<{
    id: string
    publicationId: string
    opensAt: string
    closesAt: string
    closedAt: string | null
  }>
  comments: Array<{
    id: string
    consultationId: string
    status: ConsultationCommentStatus
    authorId: string
    quoteLocator: string | null
    createdAt: string
  }>
  now?: Date
}) {
  const now = input.now ?? new Date()
  return {
    consultations: input.consultations.map((row) => ({
      id: row.id,
      publicationId: row.publicationId,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      closedAt: row.closedAt,
      window: consultationWindowStatus(row, now),
    })),
    comments: input.comments.map((row) => ({
      id: row.id,
      consultationId: row.consultationId,
      status: row.status,
      authorId: row.authorId,
      quoteLocator: row.quoteLocator,
      createdAt: row.createdAt,
    })),
    unresolvedCount: input.comments.filter((row) => isUnresolvedConsultationStatus(row.status)).length,
  }
}
