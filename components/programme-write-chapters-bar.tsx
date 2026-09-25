"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useBackgroundJob } from "@/components/programme-jobs-provider"
import { cancelFillProgramme } from "@/lib/actions/programme"
import { startFillChapters } from "@/lib/actions/programme-jobs"
import { listProgrammeOutlineNodes } from "@/lib/actions/outline"
import { useI18n } from "@/lib/i18n/use-i18n"
import type { NotifyKind } from "@/lib/notify"

type Chapter = { outlineNodeId: string | null; drafted?: boolean }

type Props = {
  workspaceId: string
  spaceId: string
  templateId: string | null
  chapters: Chapter[]
  canAdminister: boolean
  onMessage: (message: string | null, kind?: NotifyKind) => void
  /** A chapter finished, or the whole run did: reload the chapters. */
  onChaptersWritten: () => void
}

/** Writes every empty required chapter in the background, with progress at the top of the document. */
export function ProgrammeWriteChaptersBar({
  workspaceId,
  spaceId,
  templateId,
  chapters,
  canAdminister,
  onMessage,
  onChaptersWritten,
}: Props) {
  const { t } = useI18n()
  const [required, setRequired] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const fill = useBackgroundJob("fill", (job) => {
    onChaptersWritten()
    if (job.status === "cancelled") onMessage(t("workspace.programme.fillCancelled"), "warning")
    else if (job.status === "failed") onMessage(job.error || t("workspace.programme.writeChapters.failed"), "error")
    else onMessage(t("workspace.programme.fillDone", undefined, { count: String(job.progress.done) }))
  })
  const running = fill.running
  const progress = fill.job?.progress
  const lastDone = useRef(progress?.done ?? 0)

  useEffect(() => {
    if (!templateId) return
    void listProgrammeOutlineNodes(templateId).then((result) =>
      setRequired(result.data.filter((node) => node.required).map((node) => node.id)),
    )
  }, [templateId])

  useEffect(() => {
    if (!running || !progress) return
    if (progress.done > lastDone.current) onChaptersWritten()
    lastDone.current = progress.done
  }, [running, progress, onChaptersWritten])

  if (!canAdminister) return null
  const writtenIds = new Set(chapters.filter((chapter) => chapter.drafted).map((chapter) => chapter.outlineNodeId))
  const empty = required.filter((id) => !writtenIds.has(id)).length
  if (!running && empty === 0) return null

  const start = async () => {
    setStarting(true)
    const result = await startFillChapters(workspaceId, spaceId)
    setStarting(false)
    if (result.error) {
      onMessage(result.error, "error")
      return
    }
    fill.watch()
    onMessage(t("workspace.programme.writeChapters.started"), "info")
  }

  const stop = () => {
    onMessage(t("workspace.programme.fillCancelRequested"), "info")
    void cancelFillProgramme(workspaceId).then((result) => {
      if (result.error) onMessage(result.error, "error")
    })
  }

  const remainingMinutes = progress ? Math.max(1, Math.ceil((progress.total - progress.done) / 2)) : 0

  return (
    <div className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm" role="status">
      {running && progress ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {t("workspace.programme.writeChapters.running", undefined, {
                done: String(progress.done),
                total: String(progress.total),
              })}
            </p>
            <p className="text-muted-foreground">
              {t("workspace.programme.writeChapters.runningDetail", undefined, { minutes: String(remainingMinutes) })}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={stop}>
            {t("workspace.programme.writeChapters.stop")}
          </Button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1">
            {t("workspace.programme.writeChapters.empty", undefined, {
              count: String(empty),
              total: String(required.length),
            })}
          </p>
          <Button type="button" size="sm" disabled={starting} data-guidance-target="write-chapters" onClick={() => void start()}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("workspace.programme.writeChapters.action")}
          </Button>
        </>
      )}
    </div>
  )
}
