"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getProgrammeBindings } from "@/lib/actions/programme"
import { getTemplateWithNodes, saveProgrammeAsTemplate } from "@/lib/actions/template"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notifyResult } from "@/lib/notify"

export function SaveProgrammeAsTemplateDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
  onSaved,
}: {
  workspaceId: string
  workspaceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [chapterTitles, setChapterTitles] = useState<string[]>([])
  const [hasTemplate, setHasTemplate] = useState(true)
  const [previewReady, setPreviewReady] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    const defaultName = t("workspace.programme.saveAsTemplateNameDefault", undefined, {
      name: workspaceName || t("space.settings.templates.newName"),
    })
    setName(defaultName)
    setPreviewReady(false)
    startTransition(async () => {
      const bindings = await getProgrammeBindings(workspaceId)
      const templateId = bindings.data?.templateId
      if (!templateId) {
        setHasTemplate(false)
        setChapterTitles([])
        setPreviewReady(true)
        return
      }
      const loaded = await getTemplateWithNodes(templateId)
      setHasTemplate(Boolean(loaded.data))
      setChapterTitles((loaded.data?.nodes || []).map((node) => node.title))
      setPreviewReady(true)
    })
  }, [open, t, workspaceId, workspaceName])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.programme.saveAsTemplateTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.programme.saveAsTemplateDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="save-template-name">{t("workspace.programme.saveAsTemplateName")}</Label>
              <Input
                id="save-template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
              />
            </div>
            {!previewReady ? null : !hasTemplate ? (
              <p className="text-sm text-destructive">{t("workspace.programme.saveAsTemplateNeedOutline")}</p>
            ) : chapterTitles.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("workspace.programme.saveAsTemplateEmpty")}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{chapterTitles.join(" · ")}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || !hasTemplate || !name.trim()}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveProgrammeAsTemplate({ workspaceId, name: name.trim() })
                  notifyResult(
                    result.error,
                    t("workspace.programme.saveAsTemplateSaved", undefined, {
                      name: result.data?.template.name || name.trim(),
                    }),
                  )
                  if (!result.error) {
                    onOpenChange(false)
                    onSaved?.()
                  }
                })
              }
            >
              {t("workspace.programme.saveAsTemplateSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}
