import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  className?: string
  "aria-label"?: string
}

export function HorizontalCardRail({ children, className, "aria-label": ariaLabel }: Props) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]",
        className,
      )}
    >
      {children}
    </div>
  )
}
