"use client"

import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"

export type FileClassification = "public" | "internal" | "confidential"

const OPTIONS: FileClassification[] = ["public", "internal", "confidential"]

export function ClassificationPicker({
  value,
  onChange,
  scope,
  idPrefix = "classification",
}: {
  value: FileClassification
  onChange: (value: FileClassification) => void
  scope: "shared" | "programme"
  idPrefix?: string
}) {
  const { t } = useI18n()
  const helpKey = scope === "shared" ? "sharedHelp" : "programmeHelp"

  return (
    <div className="space-y-2" role="radiogroup" aria-label={t("workspace.common.classification.label")}>
      {OPTIONS.map((option) => {
        const selected = value === option
        return (
          <button
            key={option}
            id={`${idPrefix}-${option}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left",
              selected ? "border-foreground bg-muted" : "border-border hover:bg-muted/50",
            )}
          >
            <span className="block text-sm font-medium">{t(`workspace.common.classification.${option}`)}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t(`workspace.common.classification.${helpKey}.${option}`)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
