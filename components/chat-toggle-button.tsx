"use client"

import { Button } from "@/components/ui/button"
import { IconTooltip } from "@/components/icon-tooltip"
import { MessageCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n/use-i18n"

interface ChatToggleButtonProps {
  onClick: () => void
  isOpen?: boolean
  className?: string
  offsetRight?: number
  offsetBottom?: number
}

export function ChatToggleButton({
  onClick,
  isOpen = false,
  className,
  offsetRight = 24,
  offsetBottom = 24,
}: ChatToggleButtonProps) {
  const { t } = useI18n()

  const label = isOpen ? t("workspace.chat.toggle.close") : t("workspace.chat.toggle.open")

  return (
    <IconTooltip
      label={label}
      className={cn(
        "fixed z-[60] h-10 w-10 rounded-full shadow-lg transition-transform hover:scale-110",
        className,
      )}
      style={{ right: offsetRight, bottom: offsetBottom }}
    >
      <Button onClick={onClick} size="lg" className="h-10 w-10 rounded-full" aria-label={label}>
        {isOpen ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
      </Button>
    </IconTooltip>
  )
}
