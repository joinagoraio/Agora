"use client"

import { cn } from "@/lib/utils"
import { toAppAvatarUrl } from "@/lib/profile/avatar-url"

type Props = {
  name?: string | null
  url?: string | null
  className?: string
}

function initials(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function UserAvatar({ name, url, className }: Props) {
  const src = toAppAvatarUrl(url)

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cn("h-8 w-8 rounded-full object-cover", className)} />
    )
  }
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
