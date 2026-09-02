const STORAGE_PREFIX = "agora:ask-panel:"

export type AskPanelPreference = {
  open: boolean
  list: boolean
}

function storageKey(spaceId?: string, workspaceId?: string) {
  if (spaceId) return `${STORAGE_PREFIX}space:${spaceId}`
  if (workspaceId) return `${STORAGE_PREFIX}workspace:${workspaceId}`
  return `${STORAGE_PREFIX}default`
}

export function readAskPanelPreference(spaceId?: string, workspaceId?: string): AskPanelPreference {
  if (typeof window === "undefined") return { open: false, list: false }
  try {
    const raw = window.localStorage.getItem(storageKey(spaceId, workspaceId))
    if (!raw) return { open: false, list: false }
    const parsed = JSON.parse(raw) as Partial<AskPanelPreference>
    return { open: Boolean(parsed.open), list: Boolean(parsed.list) }
  } catch {
    return { open: false, list: false }
  }
}

export function patchAskPanelPreference(
  spaceId: string | undefined,
  workspaceId: string | undefined,
  patch: Partial<AskPanelPreference>,
) {
  if (typeof window === "undefined") return
  const next = { ...readAskPanelPreference(spaceId, workspaceId), ...patch }
  window.localStorage.setItem(storageKey(spaceId, workspaceId), JSON.stringify(next))
}
