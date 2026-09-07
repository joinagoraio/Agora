export function commentAnchorId(comment: { blockId: string | null; documentId?: string | null; id: string }) {
  return comment.blockId || `doc:${comment.documentId || comment.id}`
}

export function groupProgrammeCommentThreads<T extends { id: string; blockId: string | null; documentId?: string | null; resolved: boolean }>(input: {
  comments: T[]
  showComments: boolean
  activeBlockId: string | null
  canCompose: boolean
}): Map<string, T[]> {
  const map = new Map<string, T[]>()
  if (!input.showComments) return map
  for (const comment of input.comments) {
    const isActive = Boolean(input.activeBlockId) && comment.blockId === input.activeBlockId
    if (comment.resolved && !isActive) continue
    const key = commentAnchorId(comment)
    const list = map.get(key) || []
    list.push(comment)
    map.set(key, list)
  }
  if (input.canCompose && input.activeBlockId && !map.has(input.activeBlockId)) {
    map.set(input.activeBlockId, [])
  }
  return map
}

export function stackCommentAnchors(
  items: Array<{ id: string; preferredTop: number; height: number }>,
  gap = 8,
): Array<{ id: string; top: number }> {
  const sorted = [...items].sort((a, b) => a.preferredTop - b.preferredTop || a.id.localeCompare(b.id))
  let lastBottom = Number.NEGATIVE_INFINITY
  return sorted.map((item) => {
    const top =
      lastBottom === Number.NEGATIVE_INFINITY ? item.preferredTop : Math.max(item.preferredTop, lastBottom + gap)
    lastBottom = top + Math.max(item.height, 1)
    return { id: item.id, top }
  })
}

export function offsetTopWithin(element: HTMLElement, ancestor: HTMLElement): number {
  const ancestorBox = ancestor.getBoundingClientRect()
  const elementBox = element.getBoundingClientRect()
  return Math.max(0, elementBox.top - ancestorBox.top)
}
