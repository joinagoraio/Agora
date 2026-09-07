"use client"

import { useState } from "react"
import { Bot, FolderKanban, Layers2, Settings } from "lucide-react"

import { TenantLlmAdmin } from "@/components/tenant-llm-admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IconTooltip } from "@/components/icon-tooltip"
import { useI18n } from "@/lib/i18n/use-i18n"

export function DashboardMetrics({
  authorities,
  programmes,
  agents,
  tenantId,
  canManageModels = false,
}: {
  authorities: number
  programmes: number
  agents: number
  tenantId?: string | null
  canManageModels?: boolean
}) {
  const { t } = useI18n()
  const [modelsOpen, setModelsOpen] = useState(false)

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
            <IconTooltip label={t("dashboard.metrics.agents.settings")}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 bottom-3 h-8 w-8"
                onClick={() => setModelsOpen(true)}
                aria-label={t("dashboard.metrics.agents.settings")}
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
              </Button>
            </IconTooltip>
          ) : null}
        </CardContent>
      </Card>

      {canManageModels && tenantId ? (
        <Dialog open={modelsOpen} onOpenChange={setModelsOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("admin.agents.modelsDialogTitle")}</DialogTitle>
              <DialogDescription>{t("admin.agents.modelsDialogDescription")}</DialogDescription>
            </DialogHeader>
            <TenantLlmAdmin tenantId={tenantId} embedded />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
