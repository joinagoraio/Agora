"use client"

import { ChevronRight } from "lucide-react"

import { useI18n } from "@/lib/i18n/use-i18n"
import type { ProgrammeInterest } from "@/lib/programme/interests"
import { parseRoleCheck } from "@/lib/programme/role-check"

type MeasureLike = {
  interest_ids?: string[] | null
  contributes_to_vision?: string[] | null
  challenge?: string | null
  specific_action?: string | null
  owner_role?: string | null
  geography?: string | null
  timeline?: string | null
  indicator?: string | null
  resources?: string | null
  role_check?: unknown
  citations?: unknown
}

type Citation = { documentId: string; sectionId?: string; pageNumber?: number }

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-1 pl-4 text-xs">{children}</div>
    </details>
  )
}

/** A measure's content as a calm two-column list; why the role and the sources open on request. */
export function MeasureSummaryLines({
  measure,
  interests,
  sourceLabel,
  citationLabel,
}: {
  measure: MeasureLike
  interests: ProgrammeInterest[]
  sourceLabel?: (documentId: string, pageNumber?: number) => string
  citationLabel?: (citation: Citation) => string
}) {
  const { t } = useI18n()
  const linked = (measure.interest_ids || [])
    .map((id) => interests.find((interest) => interest.id === id))
    .filter((interest): interest is ProgrammeInterest => Boolean(interest))
  const roleCheck = parseRoleCheck(measure.role_check)
  const citations = Array.isArray(measure.citations) ? (measure.citations as Citation[]) : []
  const rows = [
    linked.length
      ? {
          label: t("workspace.programme.measureField.interests"),
          value: linked.map((interest) => [interest.reference, interest.label].filter(Boolean).join(" ")).join(" · "),
        }
      : null,
    measure.contributes_to_vision?.length
      ? { label: t("workspace.programme.measureField.goal"), value: measure.contributes_to_vision.join("; ") }
      : null,
    measure.challenge ? { label: t("workspace.programme.measureField.challenge"), value: measure.challenge } : null,
    measure.specific_action ? { label: t("workspace.programme.measureField.action"), value: measure.specific_action } : null,
    measure.owner_role ? { label: t("workspace.programme.measureField.role"), value: measure.owner_role } : null,
    measure.geography ? { label: t("workspace.programme.measureField.geography"), value: measure.geography } : null,
    measure.timeline ? { label: t("workspace.programme.measureField.timeline"), value: measure.timeline } : null,
    measure.indicator ? { label: t("workspace.programme.measureField.indicator"), value: measure.indicator } : null,
    measure.resources ? { label: t("workspace.programme.measureField.resources"), value: measure.resources } : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row))
  if (rows.length === 0 && !roleCheck && citations.length === 0) return null
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-xs text-muted-foreground sm:pt-0.5">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        {roleCheck ? (
          <div className="contents">
            <dt className="text-xs text-muted-foreground sm:pt-0.5">{t("workspace.programme.roleCheck.label")}</dt>
            <dd className="space-y-1">
              <span className="font-medium">{t(`workspace.programme.roleCheck.actor.${roleCheck.actor}`)}</span>
              <Disclosure summary={t("workspace.programme.roleCheck.why")}>
                <p>{roleCheck.reason}</p>
                {roleCheck.quote ? (
                  <p className="mt-1 border-l-2 pl-2 text-muted-foreground">
                    “{roleCheck.quote}”
                    {roleCheck.documentId && sourceLabel ? ` (${sourceLabel(roleCheck.documentId, roleCheck.pageNumber)})` : ""}
                  </p>
                ) : null}
              </Disclosure>
            </dd>
          </div>
        ) : null}
      </dl>
      {citations.length ? (
        <Disclosure summary={t("workspace.programme.measureField.sources", undefined, { count: String(citations.length) })}>
          <ul className="space-y-0.5 text-muted-foreground">
            {citations.map((citation, index) => (
              <li key={`${citation.documentId}-${index}`}>
                {citationLabel ? citationLabel(citation) : sourceLabel?.(citation.documentId, citation.pageNumber)}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  )
}
