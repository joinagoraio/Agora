export const AVATAR_APP_PREFIX = "/media/avatars/"

const STORAGE_PUBLIC_AVATAR =
  /\/storage\/v1\/object\/public\/avatars\/([^?]+)(\?.*)?$/

export function toAppAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith(AVATAR_APP_PREFIX) || url.startsWith("/")) {
    return url
  }
  const match = url.match(STORAGE_PUBLIC_AVATAR)
  if (!match) return url
  return `${AVATAR_APP_PREFIX}${match[1]}${match[2] ?? ""}`
}

export function isAvatarStoragePath(path: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.(png|jpe?g|webp)$/i.test(path)
}
