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

    setIsCreating(true)
    setError(null)

    try {
      const result = await createWorkspaceDocument(workspaceId, {
        title,
        instructions: instructions.trim() || undefined,
        classification,
      })

      if (result.error || !result.data) {
        setError(result.error || "Failed to create document")
        setIsCreating(false)
        return
      }

      setOpen(false)
      router.push(`/workspaces/${workspaceId}/my-documents/${result.data.id}`)
    } catch (err) {
      console.error("[CreateWorkspaceDocumentDialog] Failed to create document:", err)
      setError(err instanceof Error ? err.message : "Failed to create document")
    } finally {
      setIsCreating(false)
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
            Draft a new document that you can edit collaboratively within this workspace.
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
            <Label htmlFor="document-instructions">AI drafting instructions (optional)</Label>
            <Textarea
              id="document-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Provide goals, tone, audience, and any key points you want the AI to consider."
              rows={5}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Instructions help the AI generate an initial draft using the workspace context and uploaded
              documents. You can refine the draft at any time in the editor.
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
                Creating...
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

