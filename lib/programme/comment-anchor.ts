export function paragraphArtefactId(documentId: string, blockId: string) {
  return `${documentId}:${blockId}`
}

export function parseParagraphArtefactId(artefactId: string): { documentId: string; blockId: string } | null {
  const split = artefactId.indexOf(":")
  if (split <= 0) return null
  const documentId = artefactId.slice(0, split)
  const blockId = artefactId.slice(split + 1)
  if (!documentId || !blockId) return null
  return { documentId, blockId }
}

export function isParagraphComment(artefactType: string, artefactId: string) {
  return artefactType === "section" && Boolean(parseParagraphArtefactId(artefactId))
}

export type ProgrammeCommentRecord = {
  id: string
  artefact_type: string
  artefact_id: string
  body: string
  resolved: boolean
  parentId?: string | null
  themeId?: string | null
  themeLabel?: string | null
  themeAddressed?: boolean
  authorName?: string | null
  authorAvatarUrl?: string | null
}

export type AnchoredProgrammeComment = ProgrammeCommentRecord & {
  quote: string
  chapterTitle?: string
  blockId: string | null
  documentId: string | null
}

export function toAnchoredComment(
  row: ProgrammeCommentRecord,
  chapters: Array<{ documentId: string | null; title: string }>,
  quote = "",
): AnchoredProgrammeComment | null {
  if (row.artefact_type === "section") {
    const parsed = parseParagraphArtefactId(row.artefact_id)
    if (!parsed) return null
    const chapter = chapters.find((item) => item.documentId === parsed.documentId)
    return {
      ...row,
      quote,
      chapterTitle: chapter?.title,
      blockId: parsed.blockId,
      documentId: parsed.documentId,
    }
  }
  if (row.artefact_type === "document") {
    const chapter = chapters.find((item) => item.documentId === row.artefact_id)
    if (!chapter) return null
    return {
      ...row,
      quote,
      chapterTitle: chapter.title,
      blockId: null,
      documentId: row.artefact_id,
    }
  }
  return null
}

