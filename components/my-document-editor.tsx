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
}

export function MyDocumentEditor({
  workspaceId,
  documentId,
  initialTitle,
  initialContent,
  classification,
  initialInstructions,
  lastEditedAt,
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
      const message = "Title cannot be empty"
      setError(message)
      toast.error("Missing title", { description: message })
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
      toast.error("Failed to save document", { description: result.error })
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
    toast.success("Document saved", {
      description: "Your changes are stored.",
    })
    router.refresh()
  }

  const handleGenerate = async () => {
    if (isGenerating) return

    if (!instructions.trim()) {
      const message = "Add drafting instructions before generating a document"
      setGenerateError(message)
      toast.error("Instructions required", { description: message })
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
      toast.info("Generation cancelled")
      return
    }

    if (result.error || !result.data) {
      const description = result.error || "Failed to generate a draft"
      setGenerateError(description)
      toast.error("Draft generation failed", { description })
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
    toast.success("Draft updated", {
      description: "AI generated a fresh version.",
    })
    router.refresh()
  }

  const handleStopGeneration = () => {
    if (isGenerating) {
      isCancelledRef.current = true
      setIsGenerating(false)
      toast.info("Stopping generation...")
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
      toast.error("Failed to delete document", { description: result.error })
      setIsDeleting(false)
      return
    }

    setIsDeleting(false)
    setIsDeleteDialogOpen(false)
    toast.success("Document deleted", {
      description: `${title || "Document"} was removed.`,
    })
    router.push(`/workspaces/${workspaceId}`)
    router.refresh()
  }

  const classificationLabel = classification
    ? classification.charAt(0).toUpperCase() + classification.slice(1)
    : "Internal"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {t("common.labels.editing")}{" "}
            <span className="text-primary">{title || "Untitled document"}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Edit your draft in place. Use AI instructions to describe what you want the next draft to focus on.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{classificationLabel}</Badge>
          <Button variant="outline" onClick={handleReset} disabled={!isDirty || isSaving}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save changes
              </>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="group data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4 group-data-[highlighted]:text-destructive" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6 py-6">
          <div className="grid gap-2">
            <Label htmlFor="document-title">Title</Label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled document"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="document-instructions">AI instructions</Label>
              <div className="flex items-center gap-2">
                {isGenerating && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleStopGeneration}
                    className="h-6 w-6 p-0"
                  >
                    <CircleStop className="h-3 w-3" />
                  </Button>
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
                      Generating...
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
              placeholder="Add context, tone, or goals for AI-assisted drafting. These notes will be saved with your document."
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Keep your instructions up to date. They can be used to generate a new draft from the workspace context and
              uploaded documents.
            </p>
            {generateError && <div className="text-sm text-destructive">{generateError}</div>}
            {shouldShowMissingDraftNotice && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertTitle>No AI draft yet</AlertTitle>
                <AlertDescription>
                  The workspace AI couldn&apos;t produce an initial draft automatically. Click <strong>Draft with AI</strong> to try again using your instructions, or start writing manually.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="document-content">Document content</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Start writing your document or paste content generated by the AI assistant."
            />
          </div>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              {lastSavedAt ? (
                <span>Last saved {lastSavedAt.toLocaleString()}</span>
              ) : (
                <span>Not saved yet</span>
              )}
            </div>
            {saveState === "success" && <span className="text-emerald-600">Changes saved</span>}
            {saveState === "error" && error && <span className="text-destructive">{error}</span>}
          </div>

          {saveState === "error" && error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {generationSources && generationSources.length > 0 && (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Sources referenced by the latest draft:</p>
              <ul className="list-disc pl-5 space-y-1">
                {generationSources.map((source, index) => (
                  <li key={source.id ?? index}>
                    {source.title || "Workspace document"}
                    {source.pageNumber ? ` (page ${source.pageNumber})` : ""}
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
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document from the workspace. You can re-create it later, but the current content will be
              lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</div>}
          {isConfirmingDelete && (
            <p className="text-sm font-medium text-destructive">This action cannot be undone.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              onClick={() => {
                setIsConfirmingDelete(false)
              }}
            >
              Cancel
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
                {isDeleting ? "Deleting..." : "Confirm delete"}
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
                Delete
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
