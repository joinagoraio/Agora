"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/use-i18n"

interface WelcomeUserDialogProps {
  userId: string
  userName?: string | null
  hasSpaces: boolean
  hasWorkspaces: boolean
}

const DISMISS_KEY_PREFIX = "agora:welcome-modal-dismissed:"
const SESSION_SHOWN_KEY = "agora:welcome-modal-shown-this-session"

export function WelcomeUserDialog({ userId, userName, hasSpaces, hasWorkspaces }: WelcomeUserDialogProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const dismissStorageKey = useMemo(() => `${DISMISS_KEY_PREFIX}${userId}`, [userId])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const hasDismissed = window.localStorage.getItem(dismissStorageKey)
    const hasShownThisSession = window.sessionStorage.getItem(SESSION_SHOWN_KEY)
    const hasAccess = hasSpaces || hasWorkspaces

    const shouldShow = !hasDismissed && !hasAccess && !hasShownThisSession

    if (shouldShow) {
      setOpen(true)
      window.sessionStorage.setItem(SESSION_SHOWN_KEY, "1")
    }
  }, [dismissStorageKey, hasSpaces, hasWorkspaces])

  const handleClose = (shouldPersist = false) => {
    if (typeof window !== "undefined" && shouldPersist) {
      window.localStorage.setItem(dismissStorageKey, "1")
    }
    setOpen(false)
  }

  const greetingName = userName?.trim().length ? userName : undefined

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : handleClose(true))}>
      <DialogContent className="sm:max-w-xl border-0 bg-white text-center shadow-2xl">
        <DialogHeader className="items-center space-y-4">
          <Image src="/logo.svg" alt="Agora" width={160} height={32} priority className="h-auto w-32" />
          <DialogTitle className="w-full text-pretty text-2xl font-semibold tracking-tight text-center text-balance">
            {t("dashboard.firstRun.title", undefined, {
              name: greetingName ? t("dashboard.firstRun.titleName", undefined, { name: greetingName }) : "",
            })}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground text-balance">
            {t("dashboard.firstRun.body")}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6">
          <Button size="lg" className="w-full" onClick={() => handleClose(true)}>
            {t("dashboard.firstRun.cta")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
