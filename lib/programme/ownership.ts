import type { ChapterWorkflowStatus } from "@/lib/programme/review-policy"

export function parseOwnerId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function parseDocumentOwnerId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  return parseOwnerId((metadata as Record<string, unknown>).documentOwnerId)
}

export function parseChapterOwnerId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  return parseOwnerId((metadata as Record<string, unknown>).chapterOwnerId)
}

const ADMIN_ACCESS_ROLES = new Set([
  "owner",
  "admin",
  "tenant_admin",
  "org_manager",
  "project_owner",
])

export function canAdministerProgramme(input: {
  actorId: string | null | undefined
  accessRole?: string | null
  documentOwnerId: string | null
}): boolean {
  if (input.accessRole && ADMIN_ACCESS_ROLES.has(input.accessRole)) return true
  return Boolean(input.actorId && input.documentOwnerId && input.actorId === input.documentOwnerId)
}

export function canWriteChapter(input: {
  actorId: string | null | undefined
  accessRole?: string | null
  documentOwnerId: string | null
  chapterOwnerId: string | null
}): boolean {
  if (canAdministerProgramme(input)) return true
  if (input.actorId && input.chapterOwnerId && input.actorId === input.chapterOwnerId) return true
  return Boolean(input.actorId && !input.chapterOwnerId && input.documentOwnerId === input.actorId)
}

export function landingOwnedChapterId(input: {
  actorId: string | null | undefined
  chapters: Array<{
    outlineNodeId: string | null
    chapterOwnerId: string | null
    workflowStatus: ChapterWorkflowStatus | string
  }>
}): string | null {
  if (!input.actorId) return null
  const owned = input.chapters.filter(
    (chapter) =>
      chapter.outlineNodeId &&
      chapter.chapterOwnerId === input.actorId &&
      chapter.workflowStatus !== "approved",
  )
  return owned.length === 1 ? owned[0].outlineNodeId : null
}

export function requiredChaptersAreApproved(input: {
  chapters: Array<{ outlineNodeId: string | null; workflowStatus: ChapterWorkflowStatus | string }>
  requiredNodeIds: string[]
}): boolean {
  if (input.requiredNodeIds.length === 0) {
    const withNodes = input.chapters.filter((chapter) => chapter.outlineNodeId)
    return withNodes.length > 0 && withNodes.every((chapter) => chapter.workflowStatus === "approved")
  }
  return input.requiredNodeIds.every((nodeId) => {
    const chapter = input.chapters.find((item) => item.outlineNodeId === nodeId)
    return chapter?.workflowStatus === "approved"
  })
}
