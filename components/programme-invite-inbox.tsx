"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { respondToProgrammeInvitation } from "@/lib/actions/workspace-invitation"
import { useI18n } from "@/lib/i18n/use-i18n"

export type ProgrammeInviteNotice = {
  id: string
  programmeName: string
  authorityName: string | null
  invitedByName: string | null
}

export function ProgrammeInviteInbox({ invites }: { invites: ProgrammeInviteNotice[] }) {
  const { t } = useI18n()
  const router = useRouter()
  const [rows, setRows] = useState(invites)
  const [busyId, setBusyId] = useState<string | null>(null)

  if (rows.length === 0) return null

  const handleRespond = async (id: string, action: "accept" | "decline") => {
    setBusyId(id)
    const result = await respondToProgrammeInvitation(id, action)
    setBusyId(null)
    if (result.error) {
      toast.error(t("dashboard.invites.error"), { description: result.error })
      return
    }
    const row = rows.find((invite) => invite.id === id)
    setRows((current) => current.filter((invite) => invite.id !== id))
    toast.success(
      action === "accept"
        ? t("dashboard.invites.accepted", undefined, { name: row?.programmeName || "" })
        : t("dashboard.invites.declined"),
    )
    if (action === "accept" && result.workspaceId) {
      router.push(`/workspaces/${result.workspaceId}/programme`)
      return
    }
    router.refresh()
  }

  return (
    <Card className="mb-6 shrink-0">
      <CardHeader className="px-6">
        <CardTitle>{t("dashboard.invites.title")}</CardTitle>
        <CardDescription>{t("dashboard.invites.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-6">
        {rows.map((invite) => (
          <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">
                {invite.authorityName
                  ? t("dashboard.invites.inAuthority", undefined, {
                      programme: invite.programmeName,
                      authority: invite.authorityName,
                    })
                  : invite.programmeName}
              </p>
              {invite.invitedByName ? (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.invites.invitedBy", undefined, { name: invite.invitedByName })}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === invite.id}
                onClick={() => void handleRespond(invite.id, "decline")}
              >
                {t("dashboard.invites.decline")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busyId === invite.id}
                onClick={() => void handleRespond(invite.id, "accept")}
              >
                {t("dashboard.invites.accept")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
