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
import { toast } from "sonner"

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
    const trimmedTitle = title.trim()
    const trimmedInstructions = instructions.trim()
    const hasInstructions = trimmedInstructions.length > 0

    if (!trimmedTitle) {
      const message = "Please provide a title"
      setError(message)
      toast.error("Title required", { description: message })
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
        setError(result.error || "Failed to create document")
        toast.error("Could not create document", {
          description: result.error || "Something went wrong",
        })
        setIsCreating(false)
        setIsGeneratingDraft(false)
        return
      }

      const createdTitle = result.data?.title || trimmedTitle
      setOpen(false)
      toast.success("Document created", {
        description: hasInstructions
          ? `${createdTitle} is being drafted.`
          : `${createdTitle} is ready for editing.`,
      })
      router.push(`/workspaces/${workspaceId}/my-documents/${result.data.id}`)
    } catch (err) {
      console.error("[CreateWorkspaceDocumentDialog] Failed to create document:", err)
      const description = err instanceof Error ? err.message : "Failed to create document"
      setError(description)
      toast.error("Could not create document", {
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
            New Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create workspace document</DialogTitle>
          <DialogDescription>
            Create a new document. Provide optional AI drafting instructions to generate a first version automatically, or leave blank to start from scratch.
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
            <Label htmlFor="document-instructions">Instructions for the document (optional)</Label>
            <Textarea
              id="document-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Describe what this document is for, its purpose, audience, tone, and any key points to include. Leave blank to draft manually."
              rows={6}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              When instructions are provided, the AI will automatically generate a first draft using all available workspace knowledge. You can always edit or draft manually.
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
              instructions.trim()
                ? "Create & Generate Draft"
                : "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
