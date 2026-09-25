"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProgrammeCitationTooltip } from "@/components/programme-citation-tooltip"
import { ProgrammeCoherenceView } from "@/components/programme-coherence-view"
import { startInterestWorkups, startMeasureGeneration } from "@/lib/actions/programme-jobs"
import { useBackgroundJob } from "@/components/programme-jobs-provider"
import {
  findProgrammeInterests,
  getProgrammeInterestWorkup,
  getProgrammeWorkupHeadings,
  listProgrammeInterests,
  setProgrammeInterestSelected,
} from "@/lib/actions/interests"
import { useI18n } from "@/lib/i18n/use-i18n"
import { renderProgrammeCitationHtml, type ProgrammeCitationSource } from "@/lib/programme/citation-display"
import { programmeReadingProseClass } from "@/lib/programme/document-layout"
import type { ProgrammeInterest, WorkupHeading } from "@/lib/programme/interests"
import type { NotifyKind } from "@/lib/notify"
import { cn } from "@/lib/utils"

type Props = {
  workspaceId: string
  canEdit: boolean
  citationSources: ProgrammeCitationSource[]
  onMessage: (message: string | null, kind?: NotifyKind) => void
  onChanged?: () => void
}

export function ProgrammeInterestsPanel({ workspaceId, canEdit, citationSources, onMessage, onChanged }: Props) {
  const { t } = useI18n()
  const [interests, setInterests] = useState<ProgrammeInterest[]>([])
  const [headings, setHeadings] = useState<WorkupHeading[]>([])
  const [loaded, setLoaded] = useState(false)
  const [finding, setFinding] = useState(false)
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [view, setView] = useState<"interests" | "coherence">("interests")
  const [viewing, setViewing] = useState<{ interest: ProgrammeInterest; title: string; content: string; documentId: string } | null>(null)

  const refresh = useCallback(async () => {
    const [listed, heads] = await Promise.all([listProgrammeInterests(workspaceId), getProgrammeWorkupHeadings(workspaceId)])
    setInterests(listed.data)
    setHeadings(heads.data)
    setLoaded(true)
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = interests.filter((interest) => interest.selected)
  const visible = selectedOnly ? selected : interests

  const find = async () => {
    setFinding(true)
    const result = await findProgrammeInterests(workspaceId)
    setFinding(false)
    if (!("data" in result) || result.error) {
      onMessage(result.error || t("workspace.programme.interests.workupError"), "error")
      return
    }
    setInterests(result.data)
    onMessage(t("workspace.programme.interests.found", undefined, { count: String(result.data.length) }))
  }

  const toggle = async (interest: ProgrammeInterest, next: boolean) => {
    setInterests((current) => current.map((row) => (row.id === interest.id ? { ...row, selected: next } : row)))
    const result = await setProgrammeInterestSelected(workspaceId, interest.id, next)
    if (result.error) {
      onMessage(result.error, "error")
      setInterests((current) => current.map((row) => (row.id === interest.id ? { ...row, selected: !next } : row)))
    }
  }

  const workupJob = useBackgroundJob("workup", (job) => {
    void refresh()
    onChanged?.()
    if (job.status === "done") {
      onMessage(t("workspace.programme.interests.workedUp", undefined, { count: String(job.progress.result?.done ?? job.progress.total) }))
    } else {
      onMessage(job.error || t("workspace.programme.interests.workupError"), "error")
    }
  })
  const measuresJob = useBackgroundJob("measures", (job) => {
    onChanged?.()
    if (job.status === "done") {
      onMessage(
        t("workspace.programme.interests.measuresProposed", undefined, {
          count: String(job.progress.result?.saved ?? 0),
          interest: job.progress.current || "",
        }),
      )
    } else {
      onMessage(job.error || t("workspace.programme.interests.workupError"), "error")
    }
  })

  const startWorkups = async (ids: string[]) => {
    const result = await startInterestWorkups(workspaceId, ids)
    if (result.error || !result.data) {
      onMessage(result.error || t("workspace.programme.interests.workupError"), "error")
      return
    }
    workupJob.watch(result.data)
  }

  const proposeMeasures = async (interest: ProgrammeInterest) => {
    const result = await startMeasureGeneration(workspaceId, { interestId: interest.id, count: 4 })
    if (result.error || !result.data) {
      onMessage(result.error || t("workspace.programme.interests.workupError"), "error")
      return
    }
    measuresJob.watch(result.data)
  }

  const workUpSelected = () => {
    const targets = selected.filter((interest) => !interest.workupDocumentId)
    const list = targets.length > 0 ? targets : selected
    void startWorkups(list.map((interest) => interest.id))
  }
  const workUp = (interest: ProgrammeInterest) => void startWorkups([interest.id])

  const workupRunning = workupJob.running ? workupJob.job : null
  const measuresRunning = measuresJob.running ? measuresJob.job : null
  const queue = workupRunning && workupRunning.progress.total > 1 ? workupRunning.progress : null
  const workingIds = [
    ...(workupRunning?.progress.targetId ? [workupRunning.progress.targetId] : []),
    ...(measuresRunning?.progress.targetId ? [measuresRunning.progress.targetId] : []),
  ]

  const open = async (interest: ProgrammeInterest) => {
    const result = await getProgrammeInterestWorkup(workspaceId, interest.id)
    if (!result.data) {
      onMessage(t("workspace.programme.interests.workupMissing"), "warning")
      return
    }
    setViewing({ interest, title: result.data.title, content: result.data.content, documentId: result.data.documentId })
  }

  const renderedWorkup = useMemo(
    () => (viewing ? renderProgrammeCitationHtml(viewing.content, { workspaceId, sources: citationSources }) : ""),
    [viewing, workspaceId, citationSources],
  )

  const busy = finding || Boolean(workupRunning) || Boolean(measuresRunning)

  const viewSwitch = (
    <div className="flex shrink-0 gap-1 border-b px-6 pt-3" role="tablist">
      {(["interests", "coherence"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={view === option}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            view === option ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setView(option)}
        >
          {t(`workspace.programme.interests.view.${option}`)}
        </button>
      ))}
    </div>
  )

  const runningLine = workupRunning
    ? t("workspace.programme.interests.workingLine", undefined, {
        done: String(Math.min(workupRunning.progress.done + 1, workupRunning.progress.total)),
        total: String(workupRunning.progress.total),
        interest: workupRunning.progress.current || "",
      })
    : measuresRunning
      ? t("workspace.programme.interests.proposingLine", undefined, { interest: measuresRunning.progress.current || "" })
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {viewSwitch}
      <div className={cn("min-h-0 flex-1 flex-col", view === "coherence" ? "flex" : "hidden")}>
        <ProgrammeCoherenceView
          workspaceId={workspaceId}
          interests={interests}
          canEdit={canEdit}
          citationSources={citationSources}
          onMessage={onMessage}
        />
      </div>
      <div className={cn("min-h-0 flex-1 flex-col", view === "interests" ? "flex" : "hidden")}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-3">
        <Button type="button" disabled={!canEdit || busy} onClick={find}>
          {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {interests.length > 0 ? t("workspace.programme.interests.findAgain") : t("workspace.programme.interests.find")}
        </Button>
        <Button type="button" variant="outline" disabled={!canEdit || busy || selected.length === 0} onClick={workUpSelected}>
          {queue ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {queue
            ? t("workspace.programme.interests.workingUp", undefined, { done: String(queue.done + 1), total: String(queue.total) })
            : t("workspace.programme.interests.workUpSelected", undefined, { count: String(selected.length) })}
        </Button>
        {interests.length > 0 ? (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />
            {t("workspace.programme.interests.selectedOnly")}
          </label>
        ) : null}
      </div>
      {runningLine ? (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-6 py-2 text-sm" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{runningLine}</span>
          <span className="text-muted-foreground">{t("workspace.programme.interests.keepsRunning")}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.interests.loading")}</p>
        ) : interests.length === 0 ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{t("workspace.programme.interests.empty")}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("workspace.programme.interests.summary", undefined, {
                count: String(interests.length),
                selected: String(selected.length),
                headings: headings.map((heading) => heading.label).join(" · "),
              })}
            </p>
            <ul className="divide-y rounded-lg border">
              {visible.map((interest) => {
                const page = interest.citations[0]?.pageNumber
                const working = workingIds.includes(interest.id)
                return (
                  <li key={interest.id} className={cn("flex items-start gap-3 px-4 py-3", interest.selected && "bg-muted/40")}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={interest.selected}
                      disabled={!canEdit}
                      aria-label={interest.label}
                      onChange={(event) => void toggle(interest, event.target.checked)}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium">
                        {interest.reference ? <span className="mr-2 text-muted-foreground">{interest.reference}</span> : null}
                        {interest.label}
                      </p>
                      {interest.summary ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{interest.summary}</p>
                      ) : null}
                      {page ? (
                        <p className="text-xs text-muted-foreground">{t("workspace.programme.interests.page", undefined, { page: String(page) })}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {interest.workupDocumentId ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => void open(interest)}>
                          {t("workspace.programme.interests.openWorkup")}
                        </Button>
                      ) : null}
                      {interest.selected ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canEdit || working || busy}
                          onClick={() => void proposeMeasures(interest)}
                        >
                          {t("workspace.programme.interests.proposeMeasures")}
                        </Button>
                      ) : null}
                      {interest.selected ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={interest.workupDocumentId ? "ghost" : "default"}
                          disabled={!canEdit || working || busy}
                          onClick={() => void workUp(interest)}
                        >
                          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {interest.workupDocumentId
                            ? t("workspace.programme.interests.workUpAgain")
                            : t("workspace.programme.interests.workUp")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
      </div>

      <Dialog open={viewing !== null} onOpenChange={(value) => (value ? null : setViewing(null))}>
        <DialogContent
          overlayClassName="z-[90]"
          className="z-[100] flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("workspace.programme.interests.workupEyebrow")}
              {viewing?.interest.citations[0]?.pageNumber
                ? ` · ${t("workspace.programme.interests.page", undefined, { page: String(viewing.interest.citations[0].pageNumber) })}`
                : ""}
            </p>
            <DialogTitle className="text-lg">{viewing?.title}</DialogTitle>
            <DialogDescription>{t("workspace.programme.interests.workupHint")}</DialogDescription>
          </DialogHeader>
          <ProgrammeCitationTooltip />
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className={programmeReadingProseClass} dangerouslySetInnerHTML={{ __html: renderedWorkup }} />
          </div>
          {viewing ? (
            <div className="flex shrink-0 justify-end border-t px-6 py-3">
              <Button asChild variant="outline" size="sm">
                <Link href={`/workspaces/${workspaceId}/my-documents/${viewing.documentId}`}>
                  {t("workspace.programme.interests.editWorkup")}
                </Link>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
