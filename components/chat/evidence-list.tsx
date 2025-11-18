"use client"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FileText, Plus, X } from "lucide-react"
import React from "react"

type EvidenceItem = {
  id: string
  payload?: {
    question?: string
  }
}

interface EvidenceListProps {
  available: EvidenceItem[]
  excluded: EvidenceItem[]
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  includedLabelClassName?: string
  excludedLabelClassName?: string
  emptyMessage?: string
  className?: string
}

export function EvidenceList({
  available,
  excluded,
  onRemove,
  onRestore,
  includedLabelClassName = "mb-2 text-xs font-medium text-muted-foreground",
  excludedLabelClassName = "mb-2 text-xs font-medium text-muted-foreground/70",
  emptyMessage = "No workspace evidence yet.",
  className = "space-y-2",
}: EvidenceListProps) {
  return (
    <div className={className}>
      {available.length > 0 && (
        <div>
          <p className={includedLabelClassName}>
            Included ({available.length}):
          </p>
          <EvidenceBadgeGroup items={available} variant="included" onClick={onRemove} />
        </div>
      )}

      {excluded.length > 0 && (
        <div>
          <p className={excludedLabelClassName}>
            Excluded ({excluded.length}):
          </p>
          <EvidenceBadgeGroup items={excluded} variant="excluded" onClick={onRestore} />
        </div>
      )}

      {available.length === 0 && excluded.length === 0 && (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  )
}

interface EvidenceBadgeGroupProps {
  items: EvidenceItem[]
  variant: "included" | "excluded"
  onClick: (id: string) => void
}

function EvidenceBadgeGroup({ items, variant, onClick }: EvidenceBadgeGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const question = item.payload?.question || "Saved evidence"
        const truncated = question.length > 120 ? `${question.slice(0, 120)}…` : question

        return (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <Badge
                variant={variant === "included" ? "secondary" : "outline"}
                className={variant === "included" ? "cursor-pointer hover:bg-secondary/80 pr-1" : "cursor-pointer hover:bg-accent pr-1 opacity-70"}
                onClick={() => onClick(item.id)}
              >
                <FileText className="mr-1 h-3 w-3" />
                <span className={variant === "included" ? "max-w-[220px] truncate" : "max-w-[220px] truncate line-through"}>
                  {truncated}
                </span>
                {variant === "included" ? <X className="ml-1 h-3 w-3" /> : <Plus className="ml-1 h-3 w-3" />}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs leading-relaxed">{question}</p>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}


