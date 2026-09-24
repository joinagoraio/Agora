"use client"

import { useI18n } from "@/lib/i18n/use-i18n"
import type { ProgrammeInterest } from "@/lib/programme/interests"

type MeasureLike = {
  interest_ids?: string[] | null
  challenge?: string | null
  resources?: string | null
  owner_role?: string | null
  role_check?: { level?: string; actor?: string; reason?: string } | null
}

/** The interest, opgave, and resources lines under a measure's title. */
export function MeasureSummaryLines({ measure, interests }: { measure: MeasureLike; interests: ProgrammeInterest[] }) {
  const { t } = useI18n()
  const linked = (measure.interest_ids || [])
    .map((id) => interests.find((interest) => interest.id === id))
    .filter((interest): interest is ProgrammeInterest => Boolean(interest))
  const rows = [
    linked.length
      ? {
          label: t("workspace.programme.measureField.interests"),
          value: linked.map((interest) => [interest.reference, interest.label].filter(Boolean).join(" ")).join(" · "),
        }
      : null,
    measure.challenge ? { label: t("workspace.programme.measureField.challenge"), value: measure.challenge } : null,
    measure.resources ? { label: t("workspace.programme.measureField.resources"), value: measure.resources } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row))
  if (rows.length === 0) return null
  return (
    <dl className="grid gap-1 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
