"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteDocument, generateWorkspaceDocumentDraft, updateWorkspaceDocument } from "@/lib/actions/document"
import { CircleStop, Loader2, MoreVertical, Save, Sparkles, Trash2 } from "lucide-react"
import { RichTextEditor } from "@/components/rich-text-editor"
import { ProgrammeCitationTooltip } from "@/components/programme-citation-tooltip"
import type { ProgrammeCitationSource } from "@/lib/programme/citation-display"
import { IconTooltip } from "@/components/icon-tooltip"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"

interface MyDocumentEditorProps {
  workspaceId: string
  documentId: string
  initialTitle: string
  initialContent: string
  classification?: "public" | "internal" | "confidential" | null
  initialInstructions?: string | null
  lastEditedAt?: string | null
  citationSources?: ProgrammeCitationSource[]
}

export function MyDocumentEditor({
  workspaceId,
  documentId,
  initialTitle,
  initialContent,
  classification,
  initialInstructions,
  lastEditedAt,
  citationSources = [],
}: MyDocumentEditorProps) {
  const router = useRouter()
  const { t } = useI18n()
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent || "")
  const [instructions, setInstructions] = useState(initialInstructions || "")
  const [baseline, setBaseline] = useState({
    title: initialTitle,
    content: initialContent || "",
    instructions: initialInstructions || "",
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(lastEditedAt ? new Date(lastEditedAt) : null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generationSources, setGenerationSources] = useState<Array<Record<string, any>> | null>(null)
  const isCancelledRef = useRef(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const hasBaselineDraft = baseline.content.trim().length > 0
  const shouldShowMissingDraftNotice =
    !hasBaselineDraft && instructions.trim().length > 0 && content.trim().length === 0 && !isGenerating

  const isDirty = useMemo(() => {
    return (
      title !== baseline.title ||
      content !== baseline.content ||
      instructions !== baseline.instructions
    )
  }, [title, content, instructions, baseline])

  const handleSave = async () => {
    if (isSaving || !isDirty) return
    if (!title.trim()) {
      const message = t("workspace.documents.editor.titleEmpty")
      setError(message)
      toast.error(t("workspace.documents.editor.titleEmptyToast"), { description: message })
      setSaveState("error")
      return
    }

    setIsSaving(true)
    setSaveState("idle")
    setError(null)

    const result = await updateWorkspaceDocument(workspaceId, documentId, {
      title,
      content,
      instructions: instructions.trim() || null,
    })

    if (result.error) {
      setError(result.error)
      toast.error(t("workspace.documents.editor.saveError"), { description: result.error })
      setSaveState("error")
      setIsSaving(false)
      return
    }

    setBaseline({
      title,
      content,
      instructions: instructions.trim(),
    })
    setSaveState("success")
    const savedAt = new Date()
    setLastSavedAt(savedAt)
    setIsSaving(false)
    toast.success(t("workspace.documents.editor.saveSuccess"), {
      description: t("workspace.documents.editor.saveSuccessDescription"),
    })
    router.refresh()
  }

  const handleGenerate = async () => {
    if (isGenerating) return

    if (!instructions.trim()) {
      const message = t("workspace.documents.editor.instructionsRequired")
      setGenerateError(message)
      toast.error(t("workspace.documents.editor.instructionsRequiredToast"), { description: message })
      return
    }

    setIsGenerating(true)
    isCancelledRef.current = false
    setGenerateError(null)
    setSaveState("idle")
    setError(null)

    const result = await generateWorkspaceDocumentDraft(workspaceId, documentId, {
      instructions,
    })

    // Check if generation was cancelled
    if (isCancelledRef.current) {
      setIsGenerating(false)
      toast.info(t("workspace.documents.editor.generationCancelled"))
      return
    }

    if (result.error || !result.data) {
      const description = result.error || t("workspace.documents.editor.generationFailedDescription")
      setGenerateError(description)
      toast.error(t("workspace.documents.editor.generationFailed"), { description })
      setIsGenerating(false)
      return
    }

    const generatedContent = result.data.content
    setContent(generatedContent)
    setBaseline({
      title,
      content: generatedContent,
      instructions: instructions.trim(),
    })
    setGenerationSources(result.data.sources || null)
    setSaveState("success")
    const savedAt = new Date()
    setLastSavedAt(savedAt)
    setIsSaving(false)
    setIsGenerating(false)
    toast.success(t("workspace.documents.editor.draftUpdated"), {
      description: t("workspace.documents.editor.draftUpdatedDescription"),
    })
    router.refresh()
  }

  const handleStopGeneration = () => {
    if (isGenerating) {
      isCancelledRef.current = true
      setIsGenerating(false)
      toast.info(t("workspace.documents.editor.stoppingGeneration"))
    }
  }

  const handleReset = () => {
    if (isSaving) return
    setTitle(baseline.title)
    setContent(baseline.content)
    setInstructions(baseline.instructions)
    setError(null)
    setSaveState("idle")
    setGenerateError(null)
    setGenerationSources(null)
  }

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)

    const result = await deleteDocument(documentId, workspaceId)

    if (result.error) {
      setDeleteError(result.error)
      toast.error(t("workspace.documents.editor.deleteError"), { description: result.error })
      setIsDeleting(false)
      return
    }

    setIsDeleting(false)
    setIsDeleteDialogOpen(false)
    toast.success(t("workspace.documents.editor.deleteSuccess"), {
      description: t("workspace.documents.editor.deleteSuccessDescription", undefined, { title: title || t("workspace.documents.editor.untitled") }),
    })
    router.push(`/workspaces/${workspaceId}`)
    router.refresh()
  }

  const classificationLabel = classification
    ? t(`workspace.common.classification.${classification}`)
    : t("workspace.common.classification.internal")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {t("common.labels.editing")}{" "}
            <span className="text-primary">{title || t("workspace.documents.editor.untitled")}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("workspace.documents.editor.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{classificationLabel}</Badge>
          <Button variant="outline" onClick={handleReset} disabled={!isDirty || isSaving}>
            {t("workspace.documents.editor.reset")}
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("workspace.documents.editor.saving")}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t("workspace.documents.editor.save")}
              </>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span className="inline-flex">
                <IconTooltip label={t("common.tooltips.moreActions")}>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("common.tooltips.moreActions")}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </IconTooltip>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="group data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4 group-data-[highlighted]:text-destructive" />
                {t("workspace.documents.editor.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 py-6">
          <div className="grid gap-2">
            <Label htmlFor="document-title">{t("workspace.documents.editor.titleLabel")}</Label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("workspace.documents.editor.titlePlaceholder")}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="document-instructions">{t("workspace.documents.editor.instructionsLabel")}</Label>
              <div className="flex items-center gap-2">
                {isGenerating && (
                  <IconTooltip label={t("workspace.documents.editor.stopGeneration")}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleStopGeneration}
                      className="h-6 w-6 p-0"
                      aria-label={t("workspace.documents.editor.stopGeneration")}
                    >
                      <CircleStop className="h-3 w-3" />
                    </Button>
                  </IconTooltip>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating || !instructions.trim()}
                  className="group"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-purple-400" />
                      {t("workspace.documents.editor.generating")}
                    </>
                  ) : (
                    <Sparkles className="h-4 w-4 text-purple-400 transition-colors group-hover:text-purple-600" />
                  )}
                </Button>
              </div>
            </div>
            <Textarea
              id="document-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={t("workspace.documents.editor.instructionsPlaceholder")}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              {t("workspace.documents.editor.instructionsHint")}
            </p>
            {generateError && <div className="text-sm text-destructive">{generateError}</div>}
            {shouldShowMissingDraftNotice && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertTitle>{t("workspace.documents.editor.noDraftTitle")}</AlertTitle>
                <AlertDescription>
                  {t("workspace.documents.editor.noDraftDescription")}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid gap-2">
            {citationSources.length ? <ProgrammeCitationTooltip /> : null}
            <Label htmlFor="document-content">{t("workspace.documents.editor.contentLabel")}</Label>
            <RichTextEditor
              workspaceId={workspaceId}
              citationSources={citationSources}
              content={content}
              onChange={setContent}
              placeholder={t("workspace.documents.editor.contentPlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              {lastSavedAt ? (
                <span>{t("workspace.documents.editor.lastSaved", undefined, { date: lastSavedAt.toLocaleString() })}</span>
              ) : (
                <span>{t("workspace.documents.editor.notSavedYet")}</span>
              )}
            </div>
            {saveState === "success" && <span className="text-emerald-600">{t("workspace.documents.editor.changesSaved")}</span>}
            {saveState === "error" && error && <span className="text-destructive">{error}</span>}
          </div>

          {saveState === "error" && error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {generationSources && generationSources.length > 0 && (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">{t("workspace.documents.editor.sourcesTitle")}</p>
              <ul className="list-disc pl-5 space-y-1">
                {generationSources.map((source, index) => (
                  <li key={source.id ?? index}>
                    {source.title || t("workspace.documents.editor.sourceWorkspaceDocument")}
                    {source.pageNumber ? ` (${t("workspace.documents.editor.sourcePage", undefined, { page: source.pageNumber })})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open)
          if (!open) {
            setDeleteError(null)
            setIsDeleting(false)
            setIsConfirmingDelete(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.documents.editor.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.documents.editor.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</div>}
          {isConfirmingDelete && (
            <p className="text-sm font-medium text-destructive">{t("workspace.documents.editor.deleteWarning")}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => {
                setIsConfirmingDelete(false)
              }}
            >
              {t("workspace.documents.editor.deleteCancel")}
            </AlertDialogCancel>
            {isConfirmingDelete ? (
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault()
                  handleDelete()
                }}
                disabled={isDeleting}
              >
                {isDeleting ? t("workspace.documents.editor.deleteDeleting") : t("workspace.documents.editor.deleteConfirm")}
              </AlertDialogAction>
            ) : (
              <Button
                type="button"
                variant="destructive"
                onClick={(event) => {
                  event.preventDefault()
                  setIsConfirmingDelete(true)
                }}
              >
                {t("workspace.documents.editor.delete")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
