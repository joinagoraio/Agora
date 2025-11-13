"use client"

import type React from "react"
import { useState, useRef } from "react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, Upload, FileText, X, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface UploadDocumentDialogProps {
  workspaceId: string
  onSuccess?: () => void
  trigger?: React.ReactNode
}

export function UploadDocumentDialog({ workspaceId, onSuccess, trigger }: UploadDocumentDialogProps) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [classification, setClassification] = useState<"public" | "internal" | "confidential">("internal")
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...selectedFiles])
      setError(null)
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadFileWithProgress = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
      const fileId = `${file.name}-${file.size}`
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      
      formData.append("file", file)
      formData.append("workspaceId", workspaceId)
      formData.append("classification", classification)

      let uploadComplete = false

      // Track upload progress (file transfer only, not server processing)
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && !uploadComplete) {
          // Cap at 85% during upload, remaining 15% is for server processing
          const uploadPercent = Math.round((e.loaded / e.total) * 85)
          setUploadProgress((prev) => ({
            ...prev,
            [fileId]: Math.max(prev[fileId] || 0, uploadPercent),
          }))
        }
      })

      // Track when upload completes (but server is still processing)
      xhr.upload.addEventListener("load", () => {
        uploadComplete = true
        // Set to 90% when upload transfer completes, server is processing
        setUploadProgress((prev) => ({
          ...prev,
          [fileId]: 90,
        }))
      })

      // Handle response completion
      xhr.addEventListener("loadend", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            if (response.error) {
              reject(new Error(response.error))
            } else {
              // Only set to 100% when we get the final successful response
              setUploadProgress((prev) => ({
                ...prev,
                [fileId]: 100,
              }))
              // Small delay to ensure UI updates before resolving
              setTimeout(() => resolve(response.data), 100)
            }
          } catch (err) {
            reject(new Error("Failed to parse response"))
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            reject(new Error(error.error || `Upload failed with status ${xhr.status}`))
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        }
      })

      // Handle errors
      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"))
      })

      // Handle abort
      xhr.addEventListener("abort", () => {
        reject(new Error("Upload was cancelled"))
      })

      // Start upload
      xhr.open("POST", "/api/documents/upload")
      xhr.send(formData)
    })
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      setError("Please select at least one file")
      return
    }

    setIsUploading(true)
    setError(null)
    const initialProgress: Record<string, number> = {}
    files.forEach((file) => {
      const fileId = `${file.name}-${file.size}`
      initialProgress[fileId] = 0
    })
    setUploadProgress(initialProgress)

    try {
      for (const file of files) {
        await uploadFileWithProgress(file)
      }

      // Clear files and reset
      setFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setOpen(false) // Close dialog on success
      onSuccess?.()
      router.refresh()
      
      // Dispatch custom event to notify chat interface and other components
      window.dispatchEvent(new CustomEvent("documentUploaded", { 
        detail: { workspaceId } 
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during upload")
    } finally {
      setIsUploading(false)
      setUploadProgress({})
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i]
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Documents
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>Upload files directly to this workspace</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="classification">Classification</Label>
          <Select value={classification} onValueChange={(value: any) => setClassification(value)}>
            <SelectTrigger id="classification">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="confidential">Confidential</SelectItem>
            </SelectContent>
          </Select>
          {classification === "confidential" && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Confidential documents cannot be shared externally or exported.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-upload">Select Files</Label>
          <div className="flex items-center gap-2">
            <Input
              id="file-upload"
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept=".pdf,.doc,.docx,.txt,.md"
              className="cursor-pointer"
              disabled={isUploading}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Supported formats: PDF, Word (.doc, .docx), Text (.txt), Markdown (.md)
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <Label>Selected Files ({files.length})</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {files.map((file, index) => {
                const fileId = `${file.name}-${file.size}`
                const progress = uploadProgress[fileId] || 0
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    {!isUploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {isUploading && (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFiles([])
              setError(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ""
              }
            }}
            disabled={isUploading}
          >
            Clear
          </Button>
          <Button type="button" onClick={handleUpload} disabled={isUploading || files.length === 0}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload {files.length > 0 && `(${files.length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

