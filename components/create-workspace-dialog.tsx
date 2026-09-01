"use client"

import type React from "react"

import { useState } from "react"
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
import { createWorkspace } from "@/lib/actions/workspace"
import { workspaceHomeHref } from "@/lib/programme/domain"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"

interface CreateWorkspaceDialogProps {
  spaceId: string
  trigger?: React.ReactNode
}

export function CreateWorkspaceDialog({ spaceId, trigger }: CreateWorkspaceDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { t } = useI18n()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t("space.workspaces.dialog.errorRequired"))
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await createWorkspace(spaceId, trimmedName, undefined, "environmental_programme")

    if (result.error) {
      setError(result.error)
      toast.error(t("space.workspaces.dialog.toastError"), {
        description: result.error,
      })
      setIsLoading(false)
    } else {
      setOpen(false)
      setName("")
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("space.workspaces.dialog.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("space.workspaces.dialog.title")}</DialogTitle>
            <DialogDescription>{t("space.workspaces.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
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
