"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface WelcomeUserDialogProps {
  userId: string
  userName?: string | null
  hasSpaces: boolean
}

const DISMISS_KEY_PREFIX = "agora:welcome-modal-dismissed:"
const VISITED_KEY_PREFIX = "agora:welcome-modal-visited:"

export function WelcomeUserDialog({ userId, userName, hasSpaces }: WelcomeUserDialogProps) {
  const [open, setOpen] = useState(false)
  const [isReturning, setIsReturning] = useState<boolean>(false)

  const dismissStorageKey = useMemo(() => `${DISMISS_KEY_PREFIX}${userId}`, [userId])
  const visitedStorageKey = useMemo(() => `${VISITED_KEY_PREFIX}${userId}`, [userId])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const hasVisited = !!window.localStorage.getItem(visitedStorageKey)
    const hasDismissed = window.localStorage.getItem(dismissStorageKey)

    setIsReturning(hasVisited)
    const shouldShow = !hasDismissed || (!hasSpaces && hasVisited)
    setOpen(shouldShow)
  }, [dismissStorageKey, visitedStorageKey, hasSpaces])

  const handleClose = (shouldPersist = false) => {
    if (typeof window !== "undefined") {
      if (shouldPersist) {
        window.localStorage.setItem(dismissStorageKey, "1")
      }
      window.localStorage.setItem(visitedStorageKey, "1")
      setIsReturning(true)
    }
    setOpen(false)
  }

  const greetingName = userName?.trim().length ? userName : undefined
  const greetingPrefix = isReturning ? "Welcome back" : "Welcome"
  const descriptionContent = isReturning ? (
    hasSpaces ? (
      <span className="inline-block whitespace-nowrap">
        Great to see you again. Dive back into your spaces and pick up where you left off.
      </span>
    ) : (
      <span className="inline-block whitespace-nowrap">
        Great to see you again. Create your first space to get started with Agora.
      </span>
    )
  ) : (
    <span className="inline-block whitespace-nowrap">
      Thanks for joining Agora. Let’s get your first space set up and connected.
    </span>
  )

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : handleClose(true))}>
      <DialogContent className="sm:max-w-xl border-0 bg-white text-center shadow-2xl">
        <DialogHeader className="items-center space-y-4">
          <Image src="/logo.svg" alt="Agora" width={160} height={32} priority className="h-auto w-32" />
          <DialogTitle className="w-full text-pretty text-3xl font-semibold tracking-tight text-center text-balance">
            {greetingPrefix}
            {greetingName ? `, ${greetingName}` : ""}!
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground text-balance">
            {descriptionContent}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Connect sources, explore spaces, and collaborate with your team using AI-powered search.
          </p>
          <Button size="lg" className="w-full" onClick={() => handleClose(true)}>
            Let’s go
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

