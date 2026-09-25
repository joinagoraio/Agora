"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setMeasureDecision } from "@/lib/actions/measures"
import { useI18n } from "@/lib/i18n/use-i18n"
import type { NotifyKind } from "@/lib/notify"
import { cn } from "@/lib/utils"

type Decision = "keep" | "adapt" | "drop"

type Props = {
  workspaceId: string
  measureId: string
  decision: Decision | null
  reason: string | null
  decidedAt: string | null
  decidedByName?: string | null
  disabled?: boolean
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onSaved: () => void
}

export const DECISION_NOTE_TONE: Record<Decision, string> = {
  keep: "border-l-muted-foreground/50 bg-muted/40",
  adapt: "border-l-amber-500 bg-amber-50 text-amber-950",
  drop: "border-l-red-500 bg-red-50 text-red-950",
}

/** Keep, adapt, or drop, with the reason shown as a note that is easy to spot. */
export function MeasureDecisionControl({
  workspaceId,
  measureId,
  decision,
  reason,
  decidedAt,
  decidedByName,
  disabled,
  onMessage,
  onSaved,
}: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<Decision | null>(null)
  const [draftReason, setDraftReason] = useState("")

  const save = (next: Decision | null, nextReason: string) =>
    startTransition(async () => {
      const result = await setMeasureDecision(workspaceId, measureId, next, nextReason)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      setChoice(null)
      setDraftReason("")
      onMessage(next ? t(`workspace.programme.decision.saved.${next}`) : t("workspace.programme.decision.cleared"))
      onSaved()
    })

  const pick = (next: Decision) => {
    if (next === "keep") {
      save("keep", "")
      return
    }
    setChoice(next)
    setDraftReason(decision === next ? reason || "" : "")
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{t("workspace.programme.decision.title")}</span>
        <div className="flex flex-wrap gap-1">
          {(["keep", "adapt", "drop"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={decision === option ? "default" : "outline"}
              aria-pressed={decision === option}
              disabled={disabled || pending}
              onClick={() => pick(option)}
            >
              {t(`workspace.programme.decision.${option}`)}
            </Button>
          ))}
          {decision ? (
            <Button type="button" size="sm" variant="ghost" disabled={disabled || pending} onClick={() => save(null, "")}>
              {t("workspace.programme.decision.clear")}
            </Button>
          ) : null}
        </div>
      </div>
      {choice ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-64 flex-1"
            value={draftReason}
            autoFocus
            placeholder={t(`workspace.programme.decision.reasonPlaceholder.${choice}`)}
            onChange={(event) => setDraftReason(event.target.value)}
          />
          <Button type="button" size="sm" disabled={pending || (choice === "drop" && !draftReason.trim())} onClick={() => save(choice, draftReason)}>
            {t("workspace.programme.decision.confirm")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setChoice(null)}>
            {t("workspace.programme.decision.cancel")}
          </Button>
        </div>
      ) : decision ? (
        <div className={cn("rounded-r-md border-l-4 px-3 py-2 text-sm", DECISION_NOTE_TONE[decision])}>
          <p className="font-medium">{t(`workspace.programme.decision.status.${decision}`)}</p>
          {reason ? <p className="mt-0.5">{reason}</p> : null}
          {decidedAt ? (
            <p className="mt-1 text-xs opacity-75">
              {decidedByName
                ? t("workspace.programme.decision.decidedBy", undefined, {
                    name: decidedByName,
                    when: new Date(decidedAt).toLocaleString(),
                  })
                : new Date(decidedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("workspace.programme.decision.none")}</p>
      )}
    </div>
  )
}
