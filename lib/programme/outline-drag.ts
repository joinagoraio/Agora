/** Insertion index among the remaining (non-dragged) items, from pointer Y vs item centers. */
export function outlineDragInsertIndex(centers: number[], pointerY: number): number {
  for (let i = 0; i < centers.length; i++) {
    if (pointerY < centers[i]) return i
  }
  return centers.length
}
