"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProgrammeTemplatePicker } from "@/components/programme-template-picker"
import { createWorkspace } from "@/lib/actions/workspace"
import { listSpaceTemplates } from "@/lib/actions/template"
import { workspaceHomeHref, type ProgrammeTemplateSummary } from "@/lib/programme/domain"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

export type CreateProgrammeAuthority = {
  id: string
  name: string
}

interface CreateWorkspaceDialogProps {
  spaceId?: string
  spaces?: CreateProgrammeAuthority[]
  trigger?: React.ReactNode
  variant?: "button" | "icon"
}

export function CreateWorkspaceDialog({
  spaceId,
  spaces = [],
  trigger,
  variant = "button",
}: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { t } = useI18n()
  const triggerLabel = t("space.workspaces.dialog.trigger")
  const onlySpaceId = !spaceId && spaces.length === 1 ? spaces[0].id : null
  const needsAuthorityPicker = !spaceId && spaces.length > 1
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId ?? onlySpaceId ?? "")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ProgrammeTemplateSummary[]>([])

  const targetSpaceForTemplates = spaceId ?? (selectedSpaceId || onlySpaceId)

  useEffect(() => {
    if (!open || !targetSpaceForTemplates) {
      setTemplates([])
      return
    }
    let cancelled = false
    void listSpaceTemplates(targetSpaceForTemplates).then((result) => {
      if (cancelled) return
      setTemplates(result.data || [])
    })
    return () => {
      cancelled = true
    }
  }, [open, targetSpaceForTemplates])

  const resetForm = () => {
    setName("")
    setError(null)
    setSelectedSpaceId(spaceId ?? onlySpaceId ?? "")
    setTemplateId(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      resetForm()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t("space.workspaces.dialog.errorRequired"))
      return
    }

    const targetSpaceId = spaceId ?? (selectedSpaceId || onlySpaceId)
    if (!targetSpaceId) {
      setError(t("space.workspaces.dialog.authorityRequired"))
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await createWorkspace(targetSpaceId, trimmedName, undefined, "environmental_programme", {
      templateId,
    })

    if (result.error) {
      setError(result.error)
      toast.error(t("space.workspaces.dialog.toastError"), {
        description: result.error,
      })
      setIsLoading(false)
    } else {
      setOpen(false)
      resetForm()
      setIsLoading(false)
      toast.success(t("space.workspaces.dialog.toastSuccess"), {
        description: t("space.workspaces.dialog.toastSuccessDescription", undefined, {
          name: result.data?.name || trimmedName,
        }),
      })
      const created = result.data
      if (created?.id) {
        router.push(
          workspaceHomeHref({
            id: created.id,
            kind: created.kind ?? "environmental_programme",
            metadata: created.metadata as Record<string, unknown> | null,
          }),
        )
      }
    }
  }

  const defaultTrigger =
    variant === "icon" ? (
      <IconTooltip label={triggerLabel}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-5 rounded-full [&_svg]:size-3"
            aria-label={triggerLabel}
          >
            <Plus className="size-3" />
          </Button>
        </DialogTrigger>
      </IconTooltip>
    ) : (
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
    )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : defaultTrigger}
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("space.workspaces.dialog.title")}</DialogTitle>
            <DialogDescription>{t("space.workspaces.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {needsAuthorityPicker && (
              <div className="space-y-2">
                <Label htmlFor="programme-authority">{t("space.workspaces.dialog.authorityLabel")}</Label>
                <Select
                  value={selectedSpaceId}
                  onValueChange={(next) => {
                    setSelectedSpaceId(next)
                    setTemplateId(null)
                  }}
                >
                  <SelectTrigger id="programme-authority" className="w-full">
                    <SelectValue placeholder={t("space.workspaces.dialog.authorityPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {spaces.map((authority) => (
                      <SelectItem key={authority.id} value={authority.id}>
                        {authority.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="workspace-name">{t("space.workspaces.dialog.nameLabel")}</Label>
              <Input
                id="workspace-name"
                placeholder={t("space.workspaces.dialog.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t("space.workspaces.dialog.kindProgrammeHelp")}</p>
            </div>
            {targetSpaceForTemplates ? (
              <ProgrammeTemplatePicker
                templates={templates}
                value={templateId}
                onChange={setTemplateId}
                disabled={isLoading}
                help={t("space.workspaces.dialog.templateHelp")}
              />
            ) : null}
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
              {t("space.workspaces.dialog.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("space.workspaces.dialog.submitting") : t("space.workspaces.dialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
