"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { listProgrammeComments } from "@/lib/actions/comments"
import { seedDemoColleagueNotes } from "@/lib/actions/demo-people"
import type { DemoParagraph } from "@/lib/demo/people-prompts"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify } from "@/lib/notify"

/** Once colleagues have left this many notes, the demo has enough to group. */
const ENOUGH_NOTES = 6

/** The written paragraphs on screen, with the chapter and block they belong to, for colleagues to comment on. */
function paragraphsOnScreen(): DemoParagraph[] {
  const root = document.getElementById("programme-document-scroll")
  if (!root) return []
  const result: DemoParagraph[] = []
  root.querySelectorAll<HTMLElement>("article[data-chapter-document]").forEach((article) => {
    const documentId = article.dataset.chapterDocument
    if (!documentId) return
    const chapter = article.querySelector("h1, h2, h3")?.textContent?.trim() || ""
    article.querySelectorAll<HTMLElement>("p[data-block-id], blockquote[data-block-id]").forEach((block) => {
      const text = block.textContent?.replace(/\s+/g, " ").trim() || ""
      if (text.length < 60) return
      result.push({ documentId, blockId: block.dataset.blockId!, chapter, text })
    })
  })
  return result
}

/** Demo only: lets the demo colleagues read the written chapters and leave notes, so there is something to group. */
export function DemoColleaguesBar({ workspaceId, refreshKey, onSeeded }: { workspaceId: string; refreshKey: number; onSeeded: () => void }) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState<number | null>(null)

  useEffect(() => {
    void listProgrammeComments(workspaceId).then((result) => setNotes((result.data || []).filter((row) => !row.parentId).length))
  }, [refreshKey, workspaceId])

  if (notes === null || notes >= ENOUGH_NOTES) return null
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <Users className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">{t("workspace.programme.demoColleaguesHint")}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        data-guidance-target="demo-colleague-notes"
        onClick={() =>
          startTransition(async () => {
            const result = await seedDemoColleagueNotes(workspaceId, paragraphsOnScreen())
            if (result.error || !result.data) {
              notify(result.error || t("workspace.programme.demoColleaguesFailed"), "error")
              return
            }
            notify(t("workspace.programme.demoColleaguesDone", undefined, { count: String(result.data.notes) }))
            setNotes(result.data.notes)
            onSeeded()
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {pending ? t("workspace.programme.demoColleaguesWorking") : t("workspace.programme.demoColleaguesAction")}
      </Button>
    </div>
  )
}
