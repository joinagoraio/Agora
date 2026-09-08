"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  getSpaceRetentionPolicy,
  updateSpaceRetentionPolicy,
  buildTenantExitExport,
  pruneExpiredProgrammeArtefacts,
} from "@/lib/actions/reliability"
import type { RetentionPolicy } from "@/lib/programme/reliability"

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

function FlagRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export function SpaceComplianceSettings({ spaceId, hideIntro = false }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [savedPolicy, setSavedPolicy] = useState<RetentionPolicy | null>(null)
  const [helpAiDisabled, setHelpAiDisabled] = useState(false)
  const [savedHelpAiDisabled, setSavedHelpAiDisabled] = useState(false)
  const [confirmPrune, setConfirmPrune] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await getSpaceRetentionPolicy(spaceId)
      if (result.data) {
        setPolicy(result.data)
        setSavedPolicy(result.data)
      }
      const helpOff = Boolean(result.helpAiDisabled)
      setHelpAiDisabled(helpOff)
      setSavedHelpAiDisabled(helpOff)
      if (result.error) toast.error(result.error)
    })
  }, [spaceId])

  const dirty = useMemo(() => {
    if (!policy || !savedPolicy) return false
    return (
      helpAiDisabled !== savedHelpAiDisabled ||
      policy.retainGenerationsDays !== savedPolicy.retainGenerationsDays ||
      policy.retainExportsDays !== savedPolicy.retainExportsDays ||
      policy.legalHold !== savedPolicy.legalHold ||
      policy.noTrainOnCustomerContent !== savedPolicy.noTrainOnCustomerContent ||
      policy.dataResidency !== savedPolicy.dataResidency
    )
  }, [helpAiDisabled, policy, savedHelpAiDisabled, savedPolicy])

  if (!policy || !savedPolicy) {
    return <p className="text-sm text-muted-foreground">{t("space.settings.compliance.loading")}</p>
  }

  const save = () =>
    startTransition(async () => {
      const result = await updateSpaceRetentionPolicy(spaceId, policy, { helpAiDisabled })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setPolicy(result.data)
        setSavedPolicy(result.data)
      }
      setSavedHelpAiDisabled(helpAiDisabled)
      toast.success(t("space.settings.compliance.saved"))
      router.refresh()
    })

  const exportPackage = () =>
    startTransition(async () => {
      const result = await buildTenantExitExport(spaceId)
      if (result.error || !result.data) {
        toast.error(result.error || t("space.settings.compliance.exportFailed"))
        return
      }
      const name = result.data.space.name.replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || spaceId.slice(0, 8)
      downloadJson(`tenant-exit-${name}.json`, result.data)
      toast.success(t("space.settings.compliance.exportDone"))
    })

  const prune = () =>
    startTransition(async () => {
      setConfirmPrune(false)
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

  return (
    <div className="space-y-8">
      {hideIntro ? null : (
        <div>
          <h2 className="text-lg font-medium">{t("space.settings.compliance.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("space.settings.compliance.description")}</p>
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{t("space.settings.compliance.retentionTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("space.settings.compliance.retentionHint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="retain-gens">{t("space.settings.compliance.retainGenerations")}</Label>
            <Input
              id="retain-gens"
              type="number"
              min={30}
              max={3650}
              disabled={pending}
              value={policy.retainGenerationsDays}
              onChange={(e) =>
                setPolicy({ ...policy, retainGenerationsDays: Number(e.target.value) || policy.retainGenerationsDays })
              }
            />
            <p className="text-xs text-muted-foreground">{t("space.settings.compliance.retainGenerationsHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="retain-exports">{t("space.settings.compliance.retainExports")}</Label>
            <Input
              id="retain-exports"
              type="number"
              min={30}
              max={3650}
              disabled={pending}
              value={policy.retainExportsDays}
              onChange={(e) =>
                setPolicy({ ...policy, retainExportsDays: Number(e.target.value) || policy.retainExportsDays })
              }
            />
            <p className="text-xs text-muted-foreground">{t("space.settings.compliance.retainExportsHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || savedPolicy.legalHold}
            onClick={() => setConfirmPrune(true)}
          >
            {t("space.settings.compliance.prune")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("space.settings.compliance.pruneHint")}</p>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-medium">{t("space.settings.compliance.holdsTitle")}</h3>
        <FlagRow
          id="legal-hold"
          label={t("space.settings.compliance.legalHold")}
          hint={t("space.settings.compliance.legalHoldHint")}
          checked={policy.legalHold}
          disabled={pending}
          onCheckedChange={(checked) => setPolicy({ ...policy, legalHold: checked })}
        />
        {policy.legalHold ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="status">
            {t("space.settings.compliance.legalHoldActive")}
          </p>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">{t("space.settings.compliance.policyTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("space.settings.compliance.policyHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="residency">{t("space.settings.compliance.residency")}</Label>
          <Select
            value={policy.dataResidency}
            disabled={pending}
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
        <FlagRow
          id="no-train"
          label={t("space.settings.compliance.noTrain")}
          hint={t("space.settings.compliance.noTrainHint")}
          checked={policy.noTrainOnCustomerContent}
          disabled={pending}
          onCheckedChange={(checked) => setPolicy({ ...policy, noTrainOnCustomerContent: checked })}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h3 className="text-sm font-medium">{t("space.settings.compliance.helpTitle")}</h3>
        <FlagRow
          id="help-ai"
          label={t("space.settings.compliance.helpAiDisabled")}
          hint={t("space.settings.compliance.helpAiDisabledHint")}
          checked={helpAiDisabled}
          disabled={pending}
          onCheckedChange={setHelpAiDisabled}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">{t("space.settings.compliance.exportTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("space.settings.compliance.exportHint")}</p>
        </div>
        <Button type="button" variant="outline" disabled={pending} onClick={exportPackage}>
          {t("space.settings.compliance.tenantExport")}
        </Button>
      </section>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" disabled={pending || !dirty} onClick={save}>
          {t("space.settings.compliance.save")}
        </Button>
      </div>

      <AlertDialog open={confirmPrune} onOpenChange={setConfirmPrune}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("space.settings.compliance.pruneConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("space.settings.compliance.pruneConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={prune}>
              {t("space.settings.compliance.pruneConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
