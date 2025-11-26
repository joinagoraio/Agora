"use client"

import type React from "react"
import { useMemo, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import { createWorkspaceDocument } from "@/lib/actions/document"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"

interface CreateWorkspaceDocumentDialogProps {
  workspaceId: string
  trigger?: React.ReactNode
}

export function CreateWorkspaceDocumentDialog({ workspaceId, trigger }: CreateWorkspaceDocumentDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [classification, setClassification] =
    useState<"public" | "internal" | "confidential">("internal")
  const [instructions, setInstructions] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { t } = useI18n()

  const classificationOptions = useMemo(
    () => [
      { value: "public" as const, label: t("workspace.common.classification.public") },
      { value: "internal" as const, label: t("workspace.common.classification.internal") },
      { value: "confidential" as const, label: t("workspace.common.classification.confidential") },
    ],
    [t],
  )

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      // Reset the form when closing the dialog
      setTitle("")
      setInstructions("")
      setClassification("internal")
      setError(null)
    }
    setOpen(value)
  }

  const handleCreate = async () => {
    const trimmedTitle = title.trim()
    const trimmedInstructions = instructions.trim()
    const hasInstructions = trimmedInstructions.length > 0

    if (!trimmedTitle) {
      const message = t("workspace.documents.create.errorTitleRequired")
      setError(message)
      toast.error(t("workspace.documents.create.toastTitleRequired"), { description: message })
      return
    }

    setIsCreating(true)
    setIsGeneratingDraft(hasInstructions)
    setError(null)

    try {
      // First create the document
      const result = await createWorkspaceDocument(workspaceId, {
        title: trimmedTitle,
        ...(hasInstructions ? { instructions: trimmedInstructions } : {}),
        classification,
      })

      if (result.error || !result.data) {
        setError(result.error || t("workspace.documents.create.toastErrorDescription"))
        toast.error(t("workspace.documents.create.toastErrorTitle"), {
          description: result.error || t("workspace.documents.create.toastErrorDescription"),
        })
        setIsCreating(false)
        setIsGeneratingDraft(false)
        return
      }

      const createdTitle = result.data?.title || trimmedTitle
      setOpen(false)
      toast.success(t("workspace.documents.create.toastSuccess"), {
        description: hasInstructions
          ? t("workspace.documents.create.toastSuccessDraft", undefined, { title: createdTitle })
          : t("workspace.documents.create.toastSuccessReady", undefined, { title: createdTitle }),
      })
      router.push(`/workspaces/${workspaceId}/my-documents/${result.data.id}`)
    } catch (err) {
      console.error("[CreateWorkspaceDocumentDialog] Failed to create document:", err)
      const description = err instanceof Error ? err.message : t("workspace.documents.create.toastErrorDescription")
      setError(description)
      toast.error(t("workspace.documents.create.toastErrorTitle"), {
        description,
      })
    } finally {
      setIsCreating(false)
      setIsGeneratingDraft(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t("workspace.documents.create.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.documents.create.title")}</DialogTitle>
          <DialogDescription>{t("workspace.documents.create.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="document-title">{t("workspace.documents.create.titleLabel")}</Label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("workspace.documents.create.titlePlaceholder")}
              autoFocus
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-classification">{t("workspace.common.classification.label")}</Label>
            <Select
              value={classification}
              onValueChange={(value: "public" | "internal" | "confidential") => setClassification(value)}
              disabled={isCreating}
            >
              <SelectTrigger id="document-classification">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classificationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-instructions">{t("workspace.documents.create.instructionsLabel")}</Label>
            <Textarea
              id="document-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={t("workspace.documents.create.instructionsPlaceholder")}
              rows={6}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              {t("workspace.documents.create.instructionsHint")}
            </p>
          </div>

          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter className="space-x-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            {t("workspace.documents.create.buttonCancel")}
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isGeneratingDraft
                  ? t("workspace.documents.create.generatingDraft")
                  : t("workspace.documents.create.creating")}
              </>
            ) : (
              instructions.trim()
                ? t("workspace.documents.create.buttonCreateDraft")
                : t("workspace.documents.create.buttonCreate")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
