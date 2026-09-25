"use client"

import { useCallback, useSyncExternalStore } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { IconTooltip } from "@/components/icon-tooltip"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  readStoredSectionOpen,
  subscribeToStoredSectionOpen,
  writeStoredSectionOpen,
} from "@/lib/ui/section-open"
import { cn } from "@/lib/utils"

export function useSectionOpen(storageKey: string, defaultOpen: boolean) {
  const getSnapshot = useCallback(() => readStoredSectionOpen(storageKey), [storageKey])
  const stored = useSyncExternalStore(subscribeToStoredSectionOpen, getSnapshot, () => null)
  const open = stored ?? defaultOpen

  const setOpen = useCallback(
    (next: boolean) => {
      writeStoredSectionOpen(storageKey, next)
    },
    [storageKey],
  )

  const toggle = useCallback(() => {
    setOpen(!open)
  }, [open, setOpen])

  return { open, setOpen, toggle }
}

export function SectionOpenToggle({
  open,
  onToggle,
  label,
  guidanceTarget,
}: {
  open: boolean
  onToggle: () => void
  label: string
  /** A `data-guidance-target` so the demo tour can open the section. */
  guidanceTarget?: string
}) {
  const { t } = useI18n()
  const action = open ? t("common.actions.collapse") : t("common.actions.expand")
  return (
    <IconTooltip label={action}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-expanded={open}
        aria-label={`${action} ${label}`}
        data-guidance-target={guidanceTarget}
        data-guidance-state={open ? "open" : "closed"}
        onClick={onToggle}
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
      </Button>
    </IconTooltip>
  )
}
