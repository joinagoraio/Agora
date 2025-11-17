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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createWorkspaceDocument } from "@/lib/actions/document"
import { Loader2, Plus } from "lucide-react"

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
    if (!title.trim()) {
      setError("Please provide a title")
      return
    }

    if (!instructions.trim()) {
      setError("Please provide instructions for what the document is for. The AI will use all workspace knowledge to draft an initial version.")
      return
    }

    setIsCreating(true)
    setIsGeneratingDraft(false)
    setError(null)

    try {
      // First create the document
      setIsGeneratingDraft(true)
      const result = await createWorkspaceDocument(workspaceId, {
        title,
        instructions: instructions.trim(),
        classification,
      })

      if (result.error || !result.data) {
        setError(result.error || "Failed to create document")
        setIsCreating(false)
        setIsGeneratingDraft(false)
        return
      }

      setOpen(false)
      router.push(`/workspaces/${workspaceId}/my-documents/${result.data.id}`)
    } catch (err) {
      console.error("[CreateWorkspaceDocumentDialog] Failed to create document:", err)
      setError(err instanceof Error ? err.message : "Failed to create document")
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
            New Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create workspace document</DialogTitle>
          <DialogDescription>
            Create a new document with AI assistance. Provide instructions and the AI will draft an initial version using all workspace knowledge.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="document-title">Title</Label>
            <Input
              id="document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Policy summary for Q2 review"
              autoFocus
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-classification">Classification</Label>
            <Select
              value={classification}
              onValueChange={(value: "public" | "internal" | "confidential") => setClassification(value)}
              disabled={isCreating}
            >
              <SelectTrigger id="document-classification">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document-instructions">
              Instructions for the document <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="document-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Describe what this document is for, its purpose, audience, tone, and any key points to include. The AI will use all workspace knowledge (documents, notes, evidence) to draft an initial version."
              rows={6}
              disabled={isCreating}
              required
            />
            <p className="text-xs text-muted-foreground">
              The AI will automatically generate a first draft based on your instructions and all available workspace knowledge. You can edit and refine the draft after creation.
            </p>
          </div>

          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter className="space-x-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isGeneratingDraft ? "Generating draft..." : "Creating..."}
              </>
            ) : (
              "Create & Generate Draft"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
