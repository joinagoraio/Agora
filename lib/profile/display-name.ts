export const PROFILE_UPDATED_EVENT = "agora:profile-updated"

export function notifyProfileUpdated() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
}

export function isPlaceholderProfileName(fullName: string | null | undefined, email: string | null | undefined) {
  const name = fullName?.trim() ?? ""
  if (!name) return true
  const local = email?.split("@")[0]?.trim() ?? ""
  return Boolean(local) && name.toLowerCase() === local.toLowerCase()
}
