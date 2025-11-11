"use client"

import { Button } from "@/components/ui/button"
import { MessageSquare, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatToggleButtonProps {
  onClick: () => void
  isOpen?: boolean
  className?: string
}

export function ChatToggleButton({ onClick, isOpen = false, className }: ChatToggleButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="lg"
      className={cn(
        "absolute bottom-6 right-6 z-[60] h-10 w-10 rounded-full shadow-lg transition-all hover:scale-110",
        className
      )}
    >
      {isOpen ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
      <span className="sr-only">{isOpen ? "Close chat" : "Open chat"}</span>
    </Button>
  )
}

