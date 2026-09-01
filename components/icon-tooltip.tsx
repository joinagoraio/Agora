"use client"

import type { CSSProperties, ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  children: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  className?: string
  style?: CSSProperties
}

export function IconTooltip({ label, children, side = "bottom", className, style }: Props) {
  if (!label) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)} style={style}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
