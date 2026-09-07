export function dashboardPinKey(kind: string, id: string) {
  return `${kind}:${id}`
}

/** Insertion index among the remaining items, from pointer vs item centers. */
export function collectionDragInsertIndex(
  items: Array<{ cx: number; cy: number; height: number }>,
  pointer: { x: number; y: number },
  layout: "list" | "grid",
): number {
  if (layout === "list") {
    for (let i = 0; i < items.length; i++) {
      if (pointer.y < items[i].cy) return i
    }
    return items.length
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const sameRow = Math.abs(pointer.y - item.cy) <= item.height / 2
    if (sameRow) {
      if (pointer.x < item.cx) return i
      continue
    }
    if (pointer.y < item.cy) return i
  }
  return items.length
}

export function insertItemAt<T>(items: T[], fromIndex: number, insertIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length) return items
  const rest = items.filter((_, index) => index !== fromIndex)
  const clamped = Math.max(0, Math.min(insertIndex, rest.length))
  return [...rest.slice(0, clamped), items[fromIndex], ...rest.slice(clamped)]
}

export function insertKeyedItemAt<T>(items: T[], keyOf: (item: T) => string, key: string, insertIndex: number): T[] {
  const fromIndex = items.findIndex((item) => keyOf(item) === key)
  return insertItemAt(items, fromIndex, insertIndex)
}
