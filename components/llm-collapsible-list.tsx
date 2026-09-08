"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

export const LLM_MODEL_PREVIEW_COUNT = 4

type Props<T> = {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  previewCount?: number
  showMoreLabel: (hiddenCount: number) => string
  showLessLabel: string
}

export function LlmCollapsibleList<T>({
  items,
  getKey,
  renderItem,
  previewCount = LLM_MODEL_PREVIEW_COUNT,
  showMoreLabel,
  showLessLabel,
}: Props<T>) {
  const [expanded, setExpanded] = useState(false)
  const hiddenCount = Math.max(0, items.length - previewCount)
  const visible = expanded || hiddenCount === 0 ? items : items.slice(0, previewCount)

  return (
    <div className="space-y-2">
      {visible.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
      {hiddenCount > 0 ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setExpanded((current) => !current)}>
          {expanded ? showLessLabel : showMoreLabel(hiddenCount)}
        </Button>
      ) : null}
    </div>
  )
}
