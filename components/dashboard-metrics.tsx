"use client"

import { FolderKanban, Layers2, MessageSquare } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/use-i18n"

export function DashboardMetrics({
  authorities,
  programmes,
  conversations,
}: {
  authorities: number
  programmes: number
  conversations: number
}) {
  const { t } = useI18n()

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
      <Card className="shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{t("dashboard.metrics.conversations.title")}</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{conversations}</div>
          <p className="text-xs text-muted-foreground">{t("dashboard.metrics.conversations.subtitle")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
