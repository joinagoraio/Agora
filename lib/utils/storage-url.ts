export function getConfiguredSupabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

export function isSupabaseStorageUrl(url: string): boolean {
  if (!url.includes("/storage/v1/object/")) return false
  if (url.includes("supabase.co/storage") || url.includes("supabase.in/storage")) return true
  const origin = getConfiguredSupabaseOrigin()
  return Boolean(origin && url.startsWith(`${origin}/storage/`))
}

export function isAllowedDocumentHost(hostname: string): boolean {
  if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.in")) return true
  const origin = getConfiguredSupabaseOrigin()
  if (!origin) return false
  try {
    return new URL(origin).hostname === hostname
  } catch {
    return false
  }
}
