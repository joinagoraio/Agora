"use client"

import { useEffect, useState } from "react"
import { User } from "lucide-react"

import { cn } from "@/lib/utils"
import { toAppAvatarUrl } from "@/lib/profile/avatar-url"

type Props = {
  name?: string | null
  url?: string | null
  className?: string
}

export function UserAvatar({ name, url, className }: Props) {
  const src = toAppAvatarUrl(url)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary",
          className,
        )}
        aria-label={name?.trim() || "User"}
      >
        <User className="h-1/2 w-1/2" />
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn("h-8 w-8 rounded-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  )
}
