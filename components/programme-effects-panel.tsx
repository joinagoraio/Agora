"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/use-i18n"
import { updateMeasureEffects } from "@/lib/actions/measures"
import { runBoundAgentAnalysis } from "@/lib/actions/analysis"
import { effectsDirectionSchema } from "@/lib/programme/structured-artefacts"
import { matchFindingToMeasure } from "@/lib/programme/analysis-reports"
import type { NotifyKind } from "@/lib/notify"

type MeasureRow = {
  id: string
  title: string
  measure_type: string
  workflow_status: string
  effects_direction: string
  effects_deviation: boolean
  effects_justification: string | null
}

type Props = {
  workspaceId: string
  measures: MeasureRow[]
  reports?: Array<{ report_type: string; findings: unknown; created_at: string }>
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onRefresh: () => void
  onGoMeasures: () => void
  recordedIds?: string[]
}

const DIRECTIONS = effectsDirectionSchema.options

export function ProgrammeEffectsPanel({
  workspaceId,
  measures,
  reports = [],
  onMessage,
  onRefresh,
  onGoMeasures,
  recordedIds = [],
}: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        effectsDirection: (typeof DIRECTIONS)[number]
        effectsDeviation: boolean
        effectsJustification: string
      }
    >
  >({})

  useEffect(() => {
    const next: typeof drafts = {}
    for (const m of measures) {
      const dir = DIRECTIONS.includes(m.effects_direction as (typeof DIRECTIONS)[number])
        ? (m.effects_direction as (typeof DIRECTIONS)[number])
        : "unknown"
      next[m.id] = {
        effectsDirection: dir,
        effectsDeviation: Boolean(m.effects_deviation),
        effectsJustification: m.effects_justification || "",
      }
    }
    setDrafts(next)
  }, [measures])

  if (measures.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("workspace.programme.effectsEmpty")} {t("workspace.programme.emptyNext.effects")}
        </p>
        <Button variant="outline" onClick={onGoMeasures}>
          {t("workspace.programme.setupGoMeasures")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("workspace.programme.effectsHint")}</p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await runBoundAgentAnalysis({ workspaceId, kind: "oer" })
            if (result.error) onMessage(result.error, "error")
            else onMessage(t("workspace.programme.oerDone"))
            onRefresh()
          })
        }
      >
        {t("workspace.programme.runOer")}
      </Button>

      {(() => {
        const latestEffects = reports.find((report) => report.report_type === "effects")
        const rows = Array.isArray(latestEffects?.findings) ? latestEffects.findings : []
        if (rows.length === 0) return null
        return (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2">{t("workspace.programme.measuresTitle")}</th>
                  <th className="p-2">{t("workspace.programme.oerTheme")}</th>
                  <th className="p-2">{t("workspace.programme.effectsDirectionLabel")}</th>
                  <th className="p-2">{t("workspace.programme.effectsDeviation")}</th>
                  <th className="p-2">{t("workspace.programme.effectsJustification")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item: {
                  id?: string
                  measureId?: string
                  summary?: string
                  oerTheme?: string
                  effectsDirection?: string
                  effectsDeviation?: boolean
                  effectsJustification?: string
                  citations?: Array<{ quote?: string }>
                }) => {
                  const measure = matchFindingToMeasure(
                    {
                      id: item.id || item.measureId || "finding",
                      summary: item.summary || "",
                      disposition: "adapt",
                      citations: [],
                      measureId: item.measureId,
                    },
                    measures,
                  )
                  return (
                    <tr key={item.id || `${item.measureId}-${item.oerTheme}`} className="border-b align-top">
                      <td className="p-2">{measure?.title || item.summary}</td>
                      <td className="p-2">{item.oerTheme || "—"}</td>
                      <td className="p-2">{item.effectsDirection || "unknown"}</td>
                      <td className="p-2">{item.effectsDeviation ? "yes" : "no"}</td>
                      <td className="p-2">{item.effectsJustification || item.citations?.[0]?.quote || "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

      <ul className="space-y-4">
        {measures.map((m) => {
          const draft = drafts[m.id]
          if (!draft) return null
          const needsJustification = draft.effectsDeviation && !draft.effectsJustification.trim()
          const matchesRecord =
            recordedIds.includes(m.id) &&
            draft.effectsDirection === (DIRECTIONS.includes(m.effects_direction as (typeof DIRECTIONS)[number])
              ? m.effects_direction
              : "unknown") &&
            draft.effectsDeviation === Boolean(m.effects_deviation) &&
            draft.effectsJustification === (m.effects_justification || "")
          const latestEffects = reports.find((report) => report.report_type === "effects")
          const finding = Array.isArray(latestEffects?.findings)
            ? latestEffects.findings.find((item: { measureId?: string; id?: string; summary?: string }) =>
                matchFindingToMeasure(
                  {
                    id: item.id || m.id,
                    summary: item.summary || m.title,
                    disposition: "adapt",
                    citations: [],
                    measureId: item.measureId,
                  },
                  [{ id: m.id, title: m.title }],
                ),
              )
            : null
          return (
            <li key={m.id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    [{m.workflow_status}] {m.measure_type}
                  </p>
                  {finding?.summary && (
                    <p className="text-xs text-muted-foreground">
                      {t("workspace.programme.oerFinding", undefined, { summary: String(finding.summary) })}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={pending || needsJustification || matchesRecord}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await updateMeasureEffects(workspaceId, m.id, {
                        effectsDirection: draft.effectsDirection,
                        effectsDeviation: draft.effectsDeviation,
                        effectsJustification: draft.effectsJustification,
                      })
                      if (result.error) {
                        onMessage(result.error, "error")
                        return
                      }
                      onMessage(t("workspace.programme.effectsSaved", undefined, { title: m.title }))
                      onRefresh()
                    })
                  }
                >
                  {matchesRecord ? t("workspace.programme.effectsSavedState") : t("workspace.programme.effectsSave")}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`dir-${m.id}`}>{t("workspace.programme.effectsDirectionLabel")}</Label>
                  <Select
                    value={draft.effectsDirection}
                    onValueChange={(value) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [m.id]: {
                          ...prev[m.id],
                          effectsDirection: value as (typeof DIRECTIONS)[number],
                        },
                      }))
                    }
                  >
                    <SelectTrigger id={`dir-${m.id}`} data-guidance-target={measures[0]?.id === m.id ? "record-effects" : undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {t(`workspace.programme.effectsDirections.${d}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-2 pb-1">
                  <input
                    id={`dev-${m.id}`}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={draft.effectsDeviation}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [m.id]: { ...prev[m.id], effectsDeviation: e.target.checked },
                      }))
                    }
                  />
                  <Label htmlFor={`dev-${m.id}`}>{t("workspace.programme.effectsDeviation")}</Label>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`just-${m.id}`}>{t("workspace.programme.effectsJustification")}</Label>
                <Textarea
                  id={`just-${m.id}`}
                  rows={3}
                  value={draft.effectsJustification}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [m.id]: { ...prev[m.id], effectsJustification: e.target.value },
                    }))
                  }
                  placeholder={t("workspace.programme.effectsJustificationPlaceholder")}
                />
                {needsJustification && (
                  <p className="text-xs text-destructive">{t("workspace.programme.effectsJustificationRequired")}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
