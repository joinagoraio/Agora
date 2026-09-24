"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setMeasurePriority } from "@/lib/actions/measures"
import { useI18n } from "@/lib/i18n/use-i18n"
import type { NotifyKind } from "@/lib/notify"
import { MEASURE_PRIORITIES, type MeasurePriority } from "@/lib/programme/measure-priority"

type Props = {
  workspaceId: string
  measureId: string
  priority: MeasurePriority | null
  reason: string | null
  disabled?: boolean
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onSaved: () => void
}

export function MeasurePriorityControl({ workspaceId, measureId, priority, reason, disabled, onMessage, onSaved }: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [draftReason, setDraftReason] = useState<string | null>(null)

  const save = (next: MeasurePriority | null, nextReason?: string) =>
    startTransition(async () => {
      const result = await setMeasurePriority(workspaceId, measureId, next, nextReason ?? reason ?? "")
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      setDraftReason(null)
      onMessage(next ? t(`workspace.programme.priority.saved.${next}`) : t("workspace.programme.priority.cleared"))
      onSaved()
    })

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("workspace.programme.priority.title")}</span>
        {MEASURE_PRIORITIES.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={priority === option ? "default" : "outline"}
            aria-pressed={priority === option}
            disabled={disabled || pending}
            onClick={() => (priority === option ? undefined : save(option))}
          >
            {t(`workspace.programme.priority.level.${option}`)}
          </Button>
        ))}
        {priority ? (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={disabled || pending} onClick={() => setDraftReason(reason || "")}>
              {reason ? t("workspace.programme.priority.editReason") : t("workspace.programme.priority.addReason")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={disabled || pending} onClick={() => save(null)}>
              {t("workspace.programme.priority.clear")}
            </Button>
          </>
        ) : null}
      </div>
      {draftReason !== null && priority ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-64 flex-1"
            value={draftReason}
            autoFocus
            placeholder={t("workspace.programme.priority.reasonPlaceholder")}
            onChange={(event) => setDraftReason(event.target.value)}
          />
          <Button type="button" size="sm" disabled={pending} onClick={() => save(priority, draftReason)}>
            {t("workspace.programme.decision.confirm")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDraftReason(null)}>
            {t("workspace.programme.decision.cancel")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {priority
            ? `${t(`workspace.programme.priority.level.${priority}`)}${reason ? `: ${reason}` : ""}`
            : t("workspace.programme.priority.none")}
        </p>
      )}
    </div>
  )
}
