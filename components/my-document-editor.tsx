"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { generateWorkspaceDocumentDraft, updateWorkspaceDocument } from "@/lib/actions/document"
import { Loader2, Save, Sparkles } from "lucide-react"
import { RichTextEditor } from "@/components/rich-text-editor"

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
      setError("Title cannot be empty")
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
    router.refresh()
  }

  const handleGenerate = async () => {
    if (isGenerating) return

    if (!instructions.trim()) {
      setGenerateError("Add drafting instructions before generating a document")
      return
    }

    setIsGenerating(true)
    setGenerateError(null)
    setSaveState("idle")
    setError(null)

    const result = await generateWorkspaceDocumentDraft(workspaceId, documentId, {
      instructions,
    })

    if (result.error || !result.data) {
      setGenerateError(result.error || "Failed to generate a draft")
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
    router.refresh()
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

  const classificationLabel = classification
    ? classification.charAt(0).toUpperCase() + classification.slice(1)
    : "Internal"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            Editing: <span className="text-primary">{title || "Untitled document"}</span>
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || !instructions.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Draft with AI
                  </>
                )}
              </Button>
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
    </div>
  )
}

