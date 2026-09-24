"use client"

import { useEffect, useState } from "react"
import { Bot, FolderKanban, Layers2, Settings } from "lucide-react"

import { prefetchTenantLlmAdminState, TenantLlmAdmin } from "@/components/tenant-llm-admin"
import { isWelcomeUserDialogOpen } from "@/components/welcome-user-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IconTooltip } from "@/components/icon-tooltip"
import { useI18n } from "@/lib/i18n/use-i18n"

const MODELS_NOTICE_KEY_PREFIX = "agora:models-settings-notice-dismissed:"

export function DashboardMetrics({
  authorities,
  programmes,
  agents,
  tenantId,
  canManageModels = false,
  userId,
  holdNotice = false,
}: {
  authorities: number
  programmes: number
  agents: number
  tenantId?: string | null
  canManageModels?: boolean
  userId?: string | null
  holdNotice?: boolean
}) {
  const { t } = useI18n()
  const [modelsOpen, setModelsOpen] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(true)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const emptyAccount = authorities === 0 && programmes === 0
  const noticeStorageKey = userId ? `${MODELS_NOTICE_KEY_PREFIX}${userId}` : null

  useEffect(() => {
    if (!canManageModels || !emptyAccount || !noticeStorageKey || typeof window === "undefined") {
      setNoticeDismissed(true)
      return
    }
    setNoticeDismissed(window.localStorage.getItem(noticeStorageKey) === "1")
    setWelcomeOpen(isWelcomeUserDialogOpen())
    const onOpen = () => setWelcomeOpen(true)
    const onClose = () => setWelcomeOpen(false)
    window.addEventListener("agora:welcome-open", onOpen)
    window.addEventListener("agora:welcome-closed", onClose)
    return () => {
      window.removeEventListener("agora:welcome-open", onOpen)
      window.removeEventListener("agora:welcome-closed", onClose)
    }
  }, [canManageModels, emptyAccount, noticeStorageKey])

  const showNotice =
    canManageModels && emptyAccount && !holdNotice && !noticeDismissed && !welcomeOpen && !modelsOpen

  const dismissNotice = () => {
    if (noticeStorageKey && typeof window !== "undefined") {
      window.localStorage.setItem(noticeStorageKey, "1")
    }
    setNoticeDismissed(true)
  }

  useEffect(() => {
    if (!canManageModels || !tenantId) return
    void prefetchTenantLlmAdminState(tenantId)
  }, [canManageModels, tenantId])

  return (
    <div className="grid shrink-0 gap-6 sm:grid-cols-3">
      <Card className="shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("dashboard.metrics.authorities.title")}</CardTitle>
          <Layers2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{authorities}</div>
          <p className="text-xs text-muted-foreground">{t("dashboard.metrics.authorities.subtitle")}</p>
        </CardContent>
      </Card>
      <Card className="shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("dashboard.metrics.programmes.title")}</CardTitle>
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{programmes}</div>
          <p className="text-xs text-muted-foreground">{t("dashboard.metrics.programmes.subtitle")}</p>
        </CardContent>
      </Card>
      <Card className="relative shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("dashboard.metrics.agents.title")}</CardTitle>
          <Bot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{agents}</div>
          <p className={canManageModels && tenantId ? "pr-10 text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>
            {t("dashboard.metrics.agents.subtitle")}
          </p>
          {canManageModels && tenantId ? (
            <IconTooltip label={t("dashboard.metrics.agents.settings")} className="absolute right-3 bottom-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  dismissNotice()
                  setModelsOpen(true)
                }}
                aria-label={t("dashboard.metrics.agents.settings")}
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
              </Button>
            </IconTooltip>
          ) : null}
          {showNotice ? (
            <div className="absolute top-[calc(100%+0.5rem)] right-3 z-20 w-64 rounded-lg border bg-popover p-3 text-left shadow-lg">
              <span aria-hidden className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-t border-l bg-popover" />
              <p className="text-sm text-foreground">{t("dashboard.metrics.agents.notice")}</p>
              <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 px-2" onClick={dismissNotice}>
                {t("dashboard.metrics.agents.noticeDismiss")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canManageModels && tenantId ? (
        <Dialog open={modelsOpen} onOpenChange={setModelsOpen}>
          <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-2xl">
            <DialogHeader className="shrink-0">
              <DialogTitle>{t("admin.agents.modelsDialogTitle")}</DialogTitle>
              <DialogDescription>{t("admin.agents.modelsDialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <TenantLlmAdmin tenantId={tenantId} embedded />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
