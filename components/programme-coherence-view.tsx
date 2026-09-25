"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listCoherenceFindings, setCoherenceDecision } from "@/lib/actions/coherence"
import { startCoherenceRun } from "@/lib/actions/programme-jobs"
import { useBackgroundJob } from "@/components/programme-jobs-provider"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  COHERENCE_KINDS,
  coherencePairCounts,
  pairKey,
  type CoherenceFinding,
  type CoherenceKind,
} from "@/lib/programme/coherence"
import type { ProgrammeCitationSource } from "@/lib/programme/citation-display"
import type { ProgrammeInterest } from "@/lib/programme/interests"
import type { NotifyKind } from "@/lib/notify"
import { cn } from "@/lib/utils"

type Props = {
  workspaceId: string
  interests: ProgrammeInterest[]
  canEdit: boolean
  citationSources: ProgrammeCitationSource[]
  onMessage: (message: string | null, kind?: NotifyKind) => void
}

const KIND_MARK: Record<CoherenceKind, string> = { reinforces: "+", shared_measure: "=", dilemma: "!" }
const KIND_TONE: Record<CoherenceKind, string> = {
  reinforces: "border-emerald-300 bg-emerald-50 text-emerald-900",
  shared_measure: "border-sky-300 bg-sky-50 text-sky-900",
  dilemma: "border-amber-300 bg-amber-50 text-amber-900",
}

export function ProgrammeCoherenceView({ workspaceId, interests, canEdit, citationSources, onMessage }: Props) {
  const { t } = useI18n()
  const [findings, setFindings] = useState<CoherenceFinding[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pair, setPair] = useState<string | null>(null)
  const [dropping, setDropping] = useState<{ id: string; reason: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const listed = await listCoherenceFindings(workspaceId)
    setFindings(listed.data)
    setLoaded(true)
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = interests.filter((interest) => interest.selected)
  const counts = useMemo(() => coherencePairCounts(findings), [findings])
  const name = (interest: ProgrammeInterest) => [interest.reference, interest.label].filter(Boolean).join(" ")
  const byId = new Map(interests.map((interest) => [interest.id, interest]))
  const visible = pair
    ? findings.filter((finding) => {
        const [a, b] = pair.split("|")
        return finding.interestIds.includes(a!) && finding.interestIds.includes(b!)
      })
    : findings

  const compareJob = useBackgroundJob("coherence", (job) => {
    void refresh()
    setPair(null)
    if (job.status === "done") {
      onMessage(t("workspace.programme.coherence.done", undefined, { count: String(job.progress.result?.total ?? 0) }))
    } else {
      onMessage(job.error || t("workspace.programme.coherence.error"), "error")
    }
  })
  const running = compareJob.running

  const run = async () => {
    const result = await startCoherenceRun(workspaceId)
    if (result.error || !result.data) {
      onMessage(result.error || t("workspace.programme.coherence.error"), "error")
      return
    }
    compareJob.watch(result.data)
  }

  const decide = async (finding: CoherenceFinding, decision: "keep" | "drop" | null, reason?: string) => {
    if (savingId) return
    setSavingId(finding.id)
    const result = await setCoherenceDecision(workspaceId, finding.id, decision, reason)
    setSavingId(null)
    if (result.error) {
      onMessage(result.error, "error")
      return
    }
    setDropping(null)
    setFindings((current) =>
      current.map((row) =>
        row.id === finding.id
          ? { ...row, decision, decisionReason: decision ? reason || null : null, decidedAt: decision ? new Date().toISOString() : null }
          : row,
      ),
    )
  }

  const citationLabel = (citation: { documentId: string; pageNumber?: number }) => {
    const source = citationSources.find((item) => item.id === citation.documentId)
    const title = source?.label || source?.title || t("workspace.programme.coherence.source")
    return citation.pageNumber ? `${title}, p. ${citation.pageNumber}` : title
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-3">
        <Button type="button" disabled={!canEdit || running || selected.length < 2} onClick={run} data-guidance-target="compare-interests">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {findings.length ? t("workspace.programme.coherence.runAgain") : t("workspace.programme.coherence.run")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {running
            ? t("workspace.programme.coherence.running")
            : selected.length < 2
              ? t("workspace.programme.coherence.needTwo")
              : t("workspace.programme.coherence.scope", undefined, { count: String(selected.length) })}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
        {selected.length >= 2 ? (
          <div className="space-y-2" data-guidance-target="coherence-grid">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {COHERENCE_KINDS.map((kind) => (
                <span key={kind} className="flex items-center gap-1">
                  <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-semibold", KIND_TONE[kind])}>
                    {KIND_MARK[kind]}
                  </span>
                  {t(`workspace.programme.coherence.kind.${kind}`)}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th />
                    {selected.map((interest) => (
                      <th key={interest.id} title={name(interest)} className="px-1 font-medium text-muted-foreground">
                        {interest.reference || interest.label.slice(0, 6)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.map((row) => (
                    <tr key={row.id}>
                      <th className="max-w-56 truncate pr-2 text-left font-medium" title={name(row)}>
                        {name(row)}
                      </th>
                      {selected.map((column) => {
                        if (column.id === row.id) return <td key={column.id} className="h-10 min-w-[8.5rem] rounded bg-muted/40" />
                        const key = pairKey(row.id, column.id)
                        const cell = counts.get(key)
                        const total = cell ? cell.reinforces + cell.shared_measure + cell.dilemma : 0
                        return (
                          <td key={column.id} className="h-10 min-w-[8.5rem]">
                            <button
                              type="button"
                              data-guidance-target="coherence-cell"
                              disabled={total === 0}
                              aria-pressed={pair === key}
                              aria-label={`${name(row)} × ${name(column)}`}
                              title={t("workspace.programme.coherence.cellHint")}
                              className={cn(
                                "flex h-10 w-full flex-nowrap items-center justify-center gap-1 rounded border px-2 transition-colors",
                                pair === key ? "border-foreground bg-muted ring-1 ring-foreground" : "border-border hover:bg-muted/50",
                                total === 0 && "text-muted-foreground",
                              )}
                              onClick={() => setPair(pair === key ? null : key)}
                            >
                              {cell && total > 0
                                ? COHERENCE_KINDS.filter((kind) => cell[kind] > 0).map((kind) => (
                                    <span
                                      key={kind}
                                      className={cn("whitespace-nowrap rounded border px-1.5 py-0.5 font-semibold leading-none", KIND_TONE[kind])}
                                    >
                                      {KIND_MARK[kind]}
                                      {cell[kind]}
                                    </span>
                                  ))
                                : "·"}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pair ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/30 bg-muted/50 px-3 py-2 text-sm" role="status">
                <span className="min-w-0 flex-1">
                  {t("workspace.programme.coherence.showingPair", undefined, {
                    a: pair.split("|").map((id) => byId.get(id)).filter(Boolean).map((interest) => name(interest!))[0] || "",
                    b: pair.split("|").map((id) => byId.get(id)).filter(Boolean).map((interest) => name(interest!))[1] || "",
                  })}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setPair(null)} data-guidance-target="coherence-show-all">
                  <X className="h-4 w-4" />
                  {t("workspace.programme.coherence.showAll")}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("workspace.programme.coherence.cellHint")}</p>
            )}
          </div>
        ) : null}

        {!loaded ? null : visible.length === 0 ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{t("workspace.programme.coherence.empty")}</p>
        ) : (
          COHERENCE_KINDS.map((kind) => {
            const list = visible.filter((finding) => finding.kind === kind)
            if (list.length === 0) return null
            return (
              <section key={kind} className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {t(`workspace.programme.coherence.kind.${kind}`)} ({list.length})
                </h3>
                <ul className="space-y-2">
                  {list.map((finding) => (
                    <li
                      key={finding.id}
                      className={cn(
                        "space-y-2 rounded-lg border p-3",
                        finding.decision === "keep" && "border-foreground/50 bg-muted/30",
                        finding.decision === "drop" && "opacity-60",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <p className={cn("text-sm font-medium", finding.decision === "drop" && "line-through")}>{finding.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {finding.interestIds
                              .map((id) => byId.get(id))
                              .filter((interest): interest is ProgrammeInterest => Boolean(interest))
                              .map(name)
                              .join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={finding.decision === "keep" ? "default" : "outline"}
                            aria-pressed={finding.decision === "keep"}
                            data-guidance-target="coherence-keep"
                            data-guidance-state={`${finding.kind} ${finding.decision ?? "undecided"}`}
                            title={finding.decision === "keep" ? t("workspace.programme.coherence.undo") : undefined}
                            disabled={!canEdit || savingId === finding.id}
                            onClick={() => void decide(finding, finding.decision === "keep" ? null : "keep")}
                          >
                            {finding.decision === "keep" ? <Check className="h-4 w-4" /> : null}
                            {finding.decision === "keep"
                              ? t("workspace.programme.coherence.kept")
                              : t("workspace.programme.coherence.keep")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={finding.decision === "drop" ? "default" : "outline"}
                            aria-pressed={finding.decision === "drop"}
                            data-guidance-target="coherence-drop"
                            data-guidance-state={`${finding.kind} ${finding.decision ?? "undecided"}`}
                            title={finding.decision === "drop" ? t("workspace.programme.coherence.undo") : undefined}
                            disabled={!canEdit || savingId === finding.id}
                            onClick={() =>
                              finding.decision === "drop"
                                ? void decide(finding, null)
                                : setDropping({ id: finding.id, reason: "" })
                            }
                          >
                            {finding.decision === "drop"
                              ? t("workspace.programme.coherence.setAsideDone")
                              : t("workspace.programme.coherence.setAside")}
                          </Button>
                        </div>
                      </div>
                      {finding.explanation ? <p className="text-sm">{finding.explanation}</p> : null}
                      {finding.citations.length ? (
                        <ul className="space-y-1 border-l-2 pl-3 text-xs text-muted-foreground">
                          {finding.citations.map((citation, index) => (
                            <li key={`${citation.documentId}-${index}`}>
                              {citation.quote ? <span className="italic">“{citation.quote}” </span> : null}
                              <span>({citationLabel(citation)})</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {dropping?.id === finding.id ? (
                        <div className="flex flex-wrap gap-2">
                          <Input
                            className="min-w-64 flex-1"
                            autoFocus
                            data-guidance-target="coherence-reason"
                            value={dropping.reason}
                            placeholder={t("workspace.programme.coherence.reason")}
                            onChange={(event) => setDropping({ id: finding.id, reason: event.target.value })}
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={!dropping.reason.trim()}
                            data-guidance-target="coherence-drop-confirm"
                            onClick={() => void decide(finding, "drop", dropping.reason)}
                          >
                            {t("workspace.programme.decision.confirm")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDropping(null)}>
                            {t("workspace.programme.decision.cancel")}
                          </Button>
                        </div>
                      ) : finding.decisionReason ? (
                        <p className="text-xs text-muted-foreground">{finding.decisionReason}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
