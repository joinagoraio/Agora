"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  getSpaceRetentionPolicy,
  updateSpaceRetentionPolicy,
  buildTenantExitExport,
  pruneExpiredProgrammeArtefacts,
} from "@/lib/actions/reliability"
import type { RetentionPolicy } from "@/lib/programme/reliability"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

type Props = {
  spaceId: string
  hideIntro?: boolean
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SpaceComplianceSettings({ spaceId, hideIntro = false }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [helpAiDisabled, setHelpAiDisabled] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await getSpaceRetentionPolicy(spaceId)
      if (result.data) setPolicy(result.data)
      setHelpAiDisabled(Boolean(result.helpAiDisabled))
      if (result.error) toast.error(result.error)
    })
  }, [spaceId])

  if (!policy) {
    return <p className="text-sm text-muted-foreground">{t("space.settings.compliance.loading")}</p>
  }

  return (
    <div className="space-y-4">
      {hideIntro ? null : (
      <div>
        <h2 className="text-lg font-medium">{t("space.settings.compliance.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("space.settings.compliance.description")}</p>
      </div>
      )}
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="retain-gens">{t("space.settings.compliance.retainGenerations")}</Label>
            <Input
              id="retain-gens"
              type="number"
              min={30}
              max={3650}
              value={policy.retainGenerationsDays}
              onChange={(e) =>
                setPolicy({ ...policy, retainGenerationsDays: Number(e.target.value) || policy.retainGenerationsDays })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retain-exports">{t("space.settings.compliance.retainExports")}</Label>
            <Input
              id="retain-exports"
              type="number"
              min={30}
              max={3650}
              value={policy.retainExportsDays}
              onChange={(e) =>
                setPolicy({ ...policy, retainExportsDays: Number(e.target.value) || policy.retainExportsDays })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="residency">{t("space.settings.compliance.residency")}</Label>
            <Select
              value={policy.dataResidency}
              onValueChange={(value) =>
                setPolicy({
                  ...policy,
                  dataResidency: value as RetentionPolicy["dataResidency"],
                })
              }
            >
              <SelectTrigger id="residency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eu">{t("space.settings.compliance.residencyEu")}</SelectItem>
                <SelectItem value="us">{t("space.settings.compliance.residencyUs")}</SelectItem>
                <SelectItem value="unspecified">{t("space.settings.compliance.residencyUnspecified")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col justify-end gap-3 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={policy.legalHold}
                onChange={(e) => setPolicy({ ...policy, legalHold: e.target.checked })}
              />
              {t("space.settings.compliance.legalHold")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={policy.noTrainOnCustomerContent}
                onChange={(e) => setPolicy({ ...policy, noTrainOnCustomerContent: e.target.checked })}
              />
              {t("space.settings.compliance.noTrain")}
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={helpAiDisabled}
                onChange={(e) => setHelpAiDisabled(e.target.checked)}
              />
              <span>
                {t("space.settings.compliance.helpAiDisabled")}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("space.settings.compliance.helpAiDisabledHint")}
                </span>
              </span>
            </label>
          </div>
        </div>

        {policy.legalHold && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="status">
            {t("space.settings.compliance.legalHoldActive")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateSpaceRetentionPolicy(spaceId, policy, { helpAiDisabled })
                if (result.error) {
                  toast.error(result.error)
                  return
                }
                if (result.data) setPolicy(result.data)
                toast.success(t("space.settings.compliance.saved"))
                router.refresh()
              })
            }
          >
            {t("space.settings.compliance.save")}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await buildTenantExitExport(spaceId)
                if (result.error || !result.data) {
                  toast.error(result.error || t("space.settings.compliance.exportFailed"))
                  return
                }
                downloadJson(`tenant-exit-${spaceId.slice(0, 8)}.json`, result.data)
                toast.success(t("space.settings.compliance.exportDone"))
              })
            }
          >
            {t("space.settings.compliance.tenantExport")}
          </Button>
          <Button
            variant="outline"
            disabled={pending || policy.legalHold}
            onClick={() =>
              startTransition(async () => {
                const result = await pruneExpiredProgrammeArtefacts(spaceId)
                if (result.error) {
                  toast.error(result.error)
                  return
                }
                toast.success(
                  t("space.settings.compliance.pruned", undefined, {
                    runs: String(result.data?.deletedRuns ?? 0),
                    exports: String(result.data?.deletedExports ?? 0),
                  }),
                )
              })
            }
          >
            {t("space.settings.compliance.prune")}
          </Button>
        </div>
      </div>
    </div>
  )
}
