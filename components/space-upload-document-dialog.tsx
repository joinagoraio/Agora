"use client"

import { type ReactNode, useState } from "react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, X } from "lucide-react"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { toast } from "sonner"

type SpaceDocument = any

interface SpaceUploadDocumentDialogProps {
  spaceId: string
  trigger?: ReactNode
  onUploaded?: (item: SpaceDocument) => void
}

export function SpaceUploadDocumentDialog({ spaceId, trigger, onUploaded }: SpaceUploadDocumentDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [notes, setNotes] = useState("")
  const [classification, setClassification] = useState<"public" | "internal" | "confidential">("public")
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)

  const handleUpload = async () => {
    if (!file) {
      const message = "Choose a file to upload."
      setError(message)
      toast.error("No file selected", { description: message })
      return
    }

    setIsUploading(true)
    setError(null)
    setSyncWarning(null)

    const formData = new FormData()
    formData.append("file", file)
    if (title.trim().length > 0) {
      formData.append("title", title.trim())
    }
    formData.append("classification", classification)
    if (notes.trim().length > 0) {
      formData.append("notes", notes.trim())
    }

    const csrfToken = await fetchCsrfToken()
    if (!csrfToken) {
      const message = "Could not verify your session. Refresh and try again."
      setError(message)
      toast.error("Upload blocked", { description: message })
      setIsUploading(false)
      return
    }

    const response = await fetch(`/api/spaces/${spaceId}/documents/upload`, {
      method: "POST",
      body: formData,
      headers: {
        "x-csrf-token": csrfToken,
      },
    })

    let payload: any = null
    try {
      payload = await response.json()
    } catch (parseError) {
      console.error("[SpaceUpload] Failed to parse response payload:", parseError)
      const message = "Upload failed: received an unexpected response from the server."
      setError(message)
      toast.error("Upload failed", { description: message })
      setIsUploading(false)
      return
    }

    if (!response.ok) {
      const message = payload.error || "Upload failed."
      setError(message)
      toast.error("Upload failed", { description: message })
      setIsUploading(false)
      return
    }

    onUploaded?.(payload.data)

    if (payload.warnings && payload.warnings.length > 0) {
      setSyncWarning(payload.warnings.join(" "))
      setIsUploading(false)
      setFile(null)
      setTitle("")
      setNotes("")
      toast.warning("Document uploaded with warnings", {
        description: payload.warnings.join(" "),
      })
      return
    }

    const uploadedName =
      payload?.data?.payload?.title ||
      payload?.data?.payload?.file_name ||
      payload?.data?.title ||
      title.trim() ||
      file?.name ||
      "Space document"

    setIsUploading(false)
    setIsOpen(false)
    setFile(null)
    setTitle("")
    setNotes("")
    setClassification("public")
    toast.success("Document uploaded", {
      description: `${uploadedName} is now available.`,
    })
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      // Reset form when dialog closes
      setFile(null)
      setTitle("")
      setNotes("")
      setClassification("public")
      setError(null)
      setSyncWarning(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? <Button>Upload document</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload scope document</DialogTitle>
          <DialogDescription>
            Add policy PDFs, memos, or supporting research. These files stay with the space and can be inherited by every workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="space-document-file">File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="space-document-file"
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.markdown"
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0] ?? null
                  setFile(selectedFile)
                  if (selectedFile) {
                    // Extract filename without extension and set as title
                    const fileName = selectedFile.name
                    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "")
                    setTitle(nameWithoutExt)
                  }
                }}
                className="flex-1"
              />
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFile(null)
                    setTitle("")
                    // Reset the file input
                    const fileInput = document.getElementById("space-document-file") as HTMLInputElement
                    if (fileInput) {
                      fileInput.value = ""
                    }
                  }}
                  className="h-10 w-10 hover:bg-red-500 group"
                >
                  <X className="h-4 w-4 group-hover:text-red-500" />
                  <span className="sr-only">Remove file</span>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PDF, Word, or text files up to the limits of your Supabase project.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-document-title">Title</Label>
            <Input
              id="space-document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g., Sustainability Directive Briefing"
            />
          </div>

          <div className="space-y-2">
            <Label>Classification</Label>
            <Select value={classification} onValueChange={(value) => setClassification(value as typeof classification)}>
              <SelectTrigger>
                <SelectValue placeholder="Select classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-document-notes">Notes (optional)</Label>
            <Textarea
              id="space-document-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add a short description to help teammates understand why this document matters."
              rows={3}
            />
          </div>

          {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          {syncWarning && (
            <p className="rounded-md bg-amber-100 p-2 text-sm text-amber-900">
              {syncWarning}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
