"use client"

import { useCallback, useSyncExternalStore } from "react"
import { LayoutGrid, List } from "lucide-react"

import { Button } from "@/components/ui/button"
import { IconTooltip } from "@/components/icon-tooltip"

export type CollectionViewMode = "list" | "grid"

/** Show cards while a collection is small; switch to a list once it grows. */
export const COLLECTION_CARD_VIEW_LIMIT = 6

const STORAGE_PREFIX = "agora:collection-view:"
const VIEW_MODE_EVENT = "agora:collection-view-change"

function isCollectionViewMode(value: string | null): value is CollectionViewMode {
  return value === "list" || value === "grid"
}

function readStoredViewMode(storageKey: string): CollectionViewMode | null {
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
    return isCollectionViewMode(value) ? value : null
  } catch {
    return null
  }
}

function subscribeToStoredViewMode(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(VIEW_MODE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(VIEW_MODE_EVENT, onStoreChange)
  }
}

export function automaticCollectionViewMode(itemCount: number): CollectionViewMode {
  return itemCount > COLLECTION_CARD_VIEW_LIMIT ? "list" : "grid"
}

export function useCollectionViewMode(itemCount: number, storageKey: string) {
  const getSnapshot = useCallback(() => readStoredViewMode(storageKey), [storageKey])
  const stored = useSyncExternalStore(subscribeToStoredViewMode, getSnapshot, () => null)

  const setViewMode = useCallback(
    (mode: CollectionViewMode) => {
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, mode)
      } catch {
        // Private mode or quota — keep the in-session custom event so the UI still updates.
      }
      window.dispatchEvent(new Event(VIEW_MODE_EVENT))
    },
    [storageKey],
  )

  return {
    viewMode: stored ?? automaticCollectionViewMode(itemCount),
    setViewMode,
  }
}

export function ViewModeToggle({
  viewMode,
  onChange,
  listLabel,
  gridLabel,
}: {
  viewMode: CollectionViewMode
  onChange: (mode: CollectionViewMode) => void
  listLabel: string
  gridLabel: string
}) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-background p-1">
      <IconTooltip label={listLabel}>
        <Button
          type="button"
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange("list")}
          aria-pressed={viewMode === "list"}
        >
          <List className="h-4 w-4" />
          <span className="sr-only">{listLabel}</span>
        </Button>
      </IconTooltip>
      <IconTooltip label={gridLabel}>
        <Button
          type="button"
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange("grid")}
          aria-pressed={viewMode === "grid"}
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="sr-only">{gridLabel}</span>
        </Button>
      </IconTooltip>
    </div>
  )
}
