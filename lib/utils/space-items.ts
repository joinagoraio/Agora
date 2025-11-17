export type SpaceItemType = "policy" | "document" | "answer" | "note"
export type SpaceItemClassification = "public" | "internal" | "confidential"

export function resolveSpaceItemClassification(
  itemType: SpaceItemType,
  providedClassification?: SpaceItemClassification | null,
): SpaceItemClassification {
  if (providedClassification) {
    return providedClassification
  }

  if (itemType === "document") {
    return "public"
  }

  return "internal"
}

export function shouldSyncSpaceDocument(
  itemType: SpaceItemType,
  classification?: SpaceItemClassification | null,
  visibility?: SpaceItemClassification | null,
): boolean {
  if (itemType !== "document") {
    return false
  }

  const normalizedClassification = classification ?? "public"
  const normalizedVisibility = visibility ?? "internal"
  return normalizedClassification === "public" || normalizedVisibility === "public"
}

