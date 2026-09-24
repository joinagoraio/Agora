"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProgrammeCitationTooltip } from "@/components/programme-citation-tooltip"
import {
  findProgrammeInterests,
  getProgrammeInterestWorkup,
  getProgrammeWorkupHeadings,
  listProgrammeInterests,
  setProgrammeInterestSelected,
  workUpProgrammeInterest,
} from "@/lib/actions/interests"
import { useI18n } from "@/lib/i18n/use-i18n"
import { renderProgrammeCitationHtml, type ProgrammeCitationSource } from "@/lib/programme/citation-display"
import { programmeChapterProseClass } from "@/lib/programme/document-layout"
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
  const [workingIds, setWorkingIds] = useState<string[]>([])
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null)
  const [selectedOnly, setSelectedOnly] = useState(false)
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

  const workUp = async (interest: ProgrammeInterest) => {
    setWorkingIds((current) => [...current, interest.id])
    const result = await workUpProgrammeInterest(workspaceId, interest.id)
    setWorkingIds((current) => current.filter((id) => id !== interest.id))
    if (result.error || !result.data) {
      onMessage(result.error || t("workspace.programme.interests.workupError"), "error")
      return false
    }
    setInterests((current) =>
      current.map((row) => (row.id === interest.id ? { ...row, workupDocumentId: result.data!.documentId } : row)),
    )
    onChanged?.()
    return true
  }

  const workUpSelected = async () => {
    const targets = selected.filter((interest) => !interest.workupDocumentId)
    const list = targets.length > 0 ? targets : selected
    setQueue({ done: 0, total: list.length })
    for (const [index, interest] of list.entries()) {
      await workUp(interest)
      setQueue({ done: index + 1, total: list.length })
    }
    setQueue(null)
    onMessage(t("workspace.programme.interests.workedUp", undefined, { count: String(list.length) }))
  }

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

  const busy = finding || queue !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

      <Dialog open={viewing !== null} onOpenChange={(value) => (value ? null : setViewing(null))}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>{t("workspace.programme.interests.workupHint")}</DialogDescription>
          </DialogHeader>
          <ProgrammeCitationTooltip />
          <div className={programmeChapterProseClass} dangerouslySetInnerHTML={{ __html: renderedWorkup }} />
          {viewing ? (
            <div className="flex justify-end">
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
