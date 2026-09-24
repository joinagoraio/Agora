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
import { ProgrammeToolSplit, ProgrammeToolSwitch } from "@/components/programme-tool-sheet"
import { useI18n } from "@/lib/i18n/use-i18n"
import { updateMeasureEffects } from "@/lib/actions/measures"
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

type FindingRow = {
  id?: string
  measureId?: string
  summary?: string
  oerTheme?: string
  effectsDirection?: string
  effectsDeviation?: boolean
  effectsJustification?: string
  citations?: Array<{ quote?: string }>
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
  const [view, setView] = useState<"record" | "report">("record")
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  const directionLabel = (value: string) => t(`workspace.programme.effectsDirections.${value}`, value)
  const latestEffects = reports.find((report) => report.report_type === "effects")
  const reportRows: FindingRow[] = Array.isArray(latestEffects?.findings) ? (latestEffects.findings as FindingRow[]) : []
  const active = measures.find((measure) => measure.id === selectedId) ?? measures[0] ?? null

  if (measures.length === 0) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-muted-foreground">
          {t("workspace.programme.effectsEmpty")} {t("workspace.programme.emptyNext.effects")}
        </p>
        <Button variant="outline" onClick={onGoMeasures}>
          {t("workspace.programme.setupGoMeasures")}
        </Button>
      </div>
    )
  }

  const activeDraft = active ? drafts[active.id] : null
  const storedDirection = active && DIRECTIONS.includes(active.effects_direction as (typeof DIRECTIONS)[number])
    ? active.effects_direction
    : "unknown"
  const matchesRecord = Boolean(
    active &&
      activeDraft &&
      recordedIds.includes(active.id) &&
      activeDraft.effectsDirection === storedDirection &&
      activeDraft.effectsDeviation === Boolean(active.effects_deviation) &&
      activeDraft.effectsJustification === (active.effects_justification || ""),
  )
  const needsJustification = Boolean(activeDraft?.effectsDeviation && !activeDraft.effectsJustification.trim())
  const activeFinding = active
    ? reportRows.find((item) =>
        matchFindingToMeasure(
          {
            id: item.id || active.id,
            summary: item.summary || active.title,
            disposition: "adapt",
            citations: [],
            measureId: item.measureId,
          },
          [{ id: active.id, title: active.title }],
        ),
      )
    : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-6 pt-4">
        <ProgrammeToolSwitch
          label={t("workspace.programme.effectsViewLabel")}
          value={view}
          options={[
            { id: "record", label: t("workspace.programme.effectsView.record") },
            { id: "report", label: t("workspace.programme.effectsView.report") },
          ]}
          onChange={setView}
        />
      </div>
      {view === "report" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <section className="overflow-hidden rounded-lg border bg-background">
            <div className="border-b bg-muted px-4 py-3">
              <h3 className="text-sm font-semibold">{t("workspace.programme.effectsReportTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("workspace.programme.effectsReportHint")}</p>
            </div>
            {reportRows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t("workspace.programme.effectsReportEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-3 font-medium">{t("workspace.programme.measuresTitle")}</th>
                      <th className="p-3 font-medium">{t("workspace.programme.oerTheme")}</th>
                      <th className="p-3 font-medium">{t("workspace.programme.effectsDirectionLabel")}</th>
                      <th className="p-3 font-medium">{t("workspace.programme.effectsDeviation")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((item) => {
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
                          <td className="p-3">{measure?.title || item.summary}</td>
                          <td className="p-3">{item.oerTheme || "—"}</td>
                          <td className="p-3">{directionLabel(item.effectsDirection || "unknown")}</td>
                          <td className="p-3">
                            {item.effectsDeviation ? t("workspace.programme.effectsYes") : t("workspace.programme.effectsNo")}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <ProgrammeToolSplit
          list={
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b bg-muted px-4 py-3">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("workspace.programme.effectsListTitle")}
                </h3>
                <p className="mt-1 text-xs text-foreground">{t("workspace.programme.effectsListHint")}</p>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto bg-background text-sm">
                {measures.map((measure) => {
                  const selected = active?.id === measure.id
                  const stored = DIRECTIONS.includes(measure.effects_direction as (typeof DIRECTIONS)[number])
                    ? measure.effects_direction
                    : "unknown"
                  return (
                    <li key={measure.id} className="border-b">
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        className={`w-full border-l-2 px-4 py-3 text-left ${selected ? "border-l-foreground bg-background" : "border-l-transparent hover:bg-muted/30"}`}
                        onClick={() => setSelectedId(measure.id)}
                      >
                        <span className="block font-medium">{measure.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {directionLabel(stored)}
                          {" · "}
                          {recordedIds.includes(measure.id)
                            ? t("workspace.programme.effectsSavedState")
                            : t("workspace.programme.effectsNotRecorded")}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          }
          detail={
            active && activeDraft ? (
              <div className="p-6">
                <section className="overflow-hidden rounded-lg border bg-background">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted px-4 py-3">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">{active.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {active.measure_type}
                        {" · "}
                        {active.workflow_status}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={pending || needsJustification || matchesRecord}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await updateMeasureEffects(workspaceId, active.id, {
                            effectsDirection: activeDraft.effectsDirection,
                            effectsDeviation: activeDraft.effectsDeviation,
                            effectsJustification: activeDraft.effectsJustification,
                          })
                          if (result.error) {
                            onMessage(result.error, "error")
                            return
                          }
                          onMessage(t("workspace.programme.effectsSaved", undefined, { title: active.title }))
                          onRefresh()
                        })
                      }
                    >
                      {matchesRecord ? t("workspace.programme.effectsSavedState") : t("workspace.programme.effectsSave")}
                    </Button>
                  </div>
                  <div className="space-y-4 px-4 py-4">
                    {activeFinding?.summary ? (
                      <p className="text-sm text-muted-foreground">
                        {t("workspace.programme.oerFinding", undefined, { summary: String(activeFinding.summary) })}
                      </p>
                    ) : null}
                    <div className="space-y-1">
                      <Label htmlFor={`dir-${active.id}`}>{t("workspace.programme.effectsDirectionLabel")}</Label>
                      <Select
                        value={activeDraft.effectsDirection}
                        onValueChange={(value) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [active.id]: {
                              ...prev[active.id],
                              effectsDirection: value as (typeof DIRECTIONS)[number],
                            },
                          }))
                        }
                      >
                        <SelectTrigger id={`dir-${active.id}`} data-guidance-target="record-effects">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIRECTIONS.map((direction) => (
                            <SelectItem key={direction} value={direction}>
                              {directionLabel(direction)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 text-sm" htmlFor={`dev-${active.id}`}>
                      <input
                        id={`dev-${active.id}`}
                        type="checkbox"
                        className="h-4 w-4"
                        checked={activeDraft.effectsDeviation}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [active.id]: { ...prev[active.id], effectsDeviation: event.target.checked },
                          }))
                        }
                      />
                      {t("workspace.programme.effectsDeviation")}
                    </label>
                    {activeDraft.effectsDeviation ? (
                      <div className="space-y-1">
                        <Label htmlFor={`just-${active.id}`}>{t("workspace.programme.effectsJustification")}</Label>
                        <Textarea
                          id={`just-${active.id}`}
                          rows={3}
                          value={activeDraft.effectsJustification}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [active.id]: { ...prev[active.id], effectsJustification: event.target.value },
                            }))
                          }
                          placeholder={t("workspace.programme.effectsJustificationPlaceholder")}
                        />
                        {needsJustification ? (
                          <p className="text-xs text-destructive">{t("workspace.programme.effectsJustificationRequired")}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null
          }
        />
      )}
    </div>
  )
}
