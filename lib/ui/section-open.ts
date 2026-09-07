const STORAGE_PREFIX = "agora:section-open:"
const SECTION_OPEN_EVENT = "agora:section-open-change"

export function sectionOpenStorageKey(storageKey: string) {
  return `${STORAGE_PREFIX}${storageKey}`
}

export function parseSectionOpen(value: string | null | undefined): boolean | null {
  if (value === "open") return true
  if (value === "closed") return false
  return null
}

export function serializeSectionOpen(open: boolean) {
  return open ? "open" : "closed"
}

export function readStoredSectionOpen(storageKey: string): boolean | null {
  try {
    return parseSectionOpen(window.localStorage.getItem(sectionOpenStorageKey(storageKey)))
  } catch {
    return null
  }
}

export function writeStoredSectionOpen(storageKey: string, open: boolean) {
  try {
    window.localStorage.setItem(sectionOpenStorageKey(storageKey), serializeSectionOpen(open))
  } catch {
    // Private mode or quota — the custom event still updates this tab.
  }
  window.dispatchEvent(new Event(SECTION_OPEN_EVENT))
}

export function subscribeToStoredSectionOpen(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(SECTION_OPEN_EVENT, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(SECTION_OPEN_EVENT, onStoreChange)
  }
}
