"use client"

import type React from "react"
import { useState, useRef } from "react"
import { ClassificationPicker } from "@/components/classification-picker"
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
import { Upload, X, Loader2 } from "lucide-react"
import { DocumentFileTypeIcon } from "@/components/document-file-type-icon"
import { IconTooltip } from "@/components/icon-tooltip"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { useI18n } from "@/lib/i18n/use-i18n"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

type UploadError = Error & {
  code?: string
  fileName?: string
  fileId?: string
}

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
  const [failedFileId, setFailedFileId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { t } = useI18n()

  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

  const getFileId = (file: File) => `${file.name}-${file.size}`

  /** When response body is not JSON (e.g. platform 502/503/504 HTML), show server-unavailable when likely platform error */
  const getParseErrorMessage = (res: Response) => {
    const status = res.status
    const contentType = res.headers.get("content-type") ?? ""
    if (status >= 500 || status === 0) return t("workspace.sources.upload.errorServerUnavailable")
    if (contentType.includes("text/html")) return t("workspace.sources.upload.errorServerUnavailable")
    return t("workspace.sources.upload.errorParse")
  }

  const safeJsonParse = async (res: Response, step: string): Promise<any> => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      console.error(`[Upload] ${step}: status=${res.status}, content-type=${res.headers.get("content-type")}, body=${text.substring(0, 500)}`)
      throw new Error(getParseErrorMessage(res))
    }
  }

  const uploadViaSignedUrl = async (file: File, fileId: string): Promise<any> => {
    const csrfToken = await fetchCsrfToken()
    if (!csrfToken) throw new Error(t("workspace.sources.upload.errorGeneral"))

    console.log("[Upload] Step 1: requesting signed URL...")
    setUploadProgress((prev) => ({ ...prev, [fileId]: 15 }))
    const urlRes = await fetch("/api/documents/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({
        workspaceId,
        filename: file.name,
        contentType: file.type,
        classification,
        size: file.size,
      }),
    })
    console.log("[Upload] Step 1 response:", urlRes.status, urlRes.headers.get("content-type"))
    const urlBody = await safeJsonParse(urlRes, "upload-url")
    if (!urlRes.ok) {
      throw new Error(urlBody.error || `Upload URL failed: ${urlRes.status}`)
    }
    const { path, token } = urlBody
    if (!path || !token) {
      console.error("[Upload] Step 1: missing path or token in response", urlBody)
      throw new Error(t("workspace.sources.upload.errorParse"))
    }
    console.log("[Upload] Step 1 OK, path:", path)

    console.log("[Upload] Step 2: uploading to Supabase storage...")
    setUploadProgress((prev) => ({ ...prev, [fileId]: 45 }))
    const supabase = createSupabaseClient()
    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined })
    if (uploadErr) {
      console.error("[Upload] Step 2 failed:", uploadErr)
      throw new Error(uploadErr.message)
    }
    console.log("[Upload] Step 2 OK")

    console.log("[Upload] Step 3: finalizing...")
    setUploadProgress((prev) => ({ ...prev, [fileId]: 75 }))
    const finalizeRes = await fetch("/api/documents/upload-finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({
        workspaceId,
        path,
        originalName: file.name,
        classification,
        size: file.size,
        mimeType: file.type,
      }),
    })
    console.log("[Upload] Step 3 response:", finalizeRes.status, finalizeRes.headers.get("content-type"))
    const finalizeBody = await safeJsonParse(finalizeRes, "upload-finalize")
    if (!finalizeRes.ok) {
      throw new Error(finalizeBody.error || `Finalize failed: ${finalizeRes.status}`)
    }
    console.log("[Upload] Step 3 OK")
    setUploadProgress((prev) => ({ ...prev, [fileId]: 100 }))
    return finalizeBody.data
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      const overLimit = selectedFiles.filter((f) => f.size > MAX_FILE_SIZE_BYTES)
      if (overLimit.length > 0) {
        const names = overLimit.map((f) => f.name).join(", ")
        setError(
          t("workspace.sources.upload.errorFileTooLarge") +
            (overLimit.length === 1 ? ` (${names})` : ` (${overLimit.length} files: ${names})`),
        )
        toast.error(t("workspace.sources.upload.toastUploadError"), {
          description: t("workspace.sources.upload.errorFileTooLarge"),
        })
      }
      const allowed = selectedFiles.filter((f) => f.size <= MAX_FILE_SIZE_BYTES)
      setFiles((prev) => [...prev, ...allowed])
      if (allowed.length > 0) {
        setError(null)
        setFailedFileId(null)
      }
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const removedFile = prev[index]
      const updated = prev.filter((_, i) => i !== index)
      if (removedFile && getFileId(removedFile) === failedFileId) {
        setFailedFileId(null)
        setError(null)
      }
      if (updated.length === 0 && fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      return updated
    })
  }

  const uploadFileWithProgress = async (file: File): Promise<any> => {
    const fileId = getFileId(file)
    // Always use signed-URL path so file bytes never hit Vercel's body limit (avoids 413)
    return uploadViaSignedUrl(file, fileId)
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      const message = t("workspace.sources.upload.errorNoFiles")
      setError(message)
      toast.error(t("workspace.sources.upload.toastNoFiles"), { description: message })
      return
    }

    const fileNames = files.map((file) => file.name)

    setIsUploading(true)
    setError(null)
    setFailedFileId(null)
    const initialProgress: Record<string, number> = {}
    files.forEach((file) => {
      const fileId = getFileId(file)
      initialProgress[fileId] = 0
    })
    setUploadProgress(initialProgress)

    try {
      for (const file of files) {
        await uploadFileWithProgress(file)
      }

      const uploadedCount = files.length
      // Clear files and reset
      setFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setOpen(false) // Close dialog on success
      onSuccess?.()
      router.refresh()
      toast.success(
        uploadedCount === 1
          ? t("workspace.sources.upload.toastUploadOne")
          : t("workspace.sources.upload.toastUploadMany"),
        {
          description:
            uploadedCount === 1
              ? t("workspace.sources.upload.toastUploadDescOne", undefined, {
                  name: fileNames[0] || t("workspace.sources.upload.supportedFormats"),
                })
              : t("workspace.sources.upload.toastUploadDescMany", undefined, { count: uploadedCount }),
        },
      )
      
      // Dispatch custom event to notify chat interface and other components
      window.dispatchEvent(new CustomEvent("documentUploaded", { 
        detail: { workspaceId } 
      }))
    } catch (err) {
      const uploadError = err as UploadError
      const { fileName, fileId } = uploadError || {}
      const description = (() => {
        if (uploadError?.code === "FILE_TYPE_MISMATCH") {
          if (fileName) {
            return t(
              "workspace.sources.upload.errorFileTypeWithName",
              `"${fileName}" couldn't be verified. Remove it to continue.`,
              { name: fileName },
            )
          }
          return t("workspace.sources.upload.errorFileType")
        }
        if (uploadError?.message) {
          const maybeKey = uploadError.message.trim()
          if (maybeKey.startsWith("workspace.")) {
            const translated = t(maybeKey, maybeKey)
            if (translated) {
              return translated
            }
          }
          return uploadError.message
        }
        return t("workspace.sources.upload.errorGeneral")
      })()
      if (fileId) {
        setFailedFileId(fileId)
      } else {
        setFailedFileId(null)
      }
      setError(description)
      toast.error(t("workspace.sources.upload.toastUploadError"), { description })
    } finally {
      setIsUploading(false)
      setUploadProgress({})
    }
  }

  const failedFile = failedFileId ? files.find((file) => getFileId(file) === failedFileId) : null

  const handleRemoveFailedFile = () => {
    if (!failedFileId) return
    const index = files.findIndex((file) => getFileId(file) === failedFileId)
    if (index >= 0) {
      removeFile(index)
    }
    setFailedFileId(null)
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
            {t("workspace.sources.upload.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("workspace.sources.upload.title")}</DialogTitle>
          <DialogDescription>{t("workspace.sources.upload.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 min-w-0 overflow-hidden">
        <div className="space-y-2">
          <Label htmlFor="classification">{t("workspace.common.classification.label")}</Label>
          <ClassificationPicker
            value={classification}
            onChange={setClassification}
            scope="programme"
            idPrefix="programme-classification"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="file-upload">{t("workspace.sources.upload.selectFiles")}</Label>
          <Input
            id="file-upload"
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf,.doc,.docx,.txt,.md"
            className="sr-only"
            disabled={isUploading}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {files.length > 0
                ? t("workspace.sources.upload.changeFile")
                : t("workspace.sources.upload.fileButton")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {files.length === 0
                ? t("workspace.sources.upload.noFileSelected")
                : files.length === 1
                  ? t("workspace.sources.upload.fileSelectedSingle", undefined, { name: files[0].name })
                  : t("workspace.sources.upload.fileSelectedMultiple", undefined, { count: files.length })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("workspace.sources.upload.supportedFormats")} {t("workspace.sources.upload.maxFileSizeHint")}
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <Label>
              {t("workspace.sources.upload.selectedFiles")} ({files.length})
            </Label>
            <div className="space-y-2 max-h-48 overflow-y-auto overflow-x-hidden min-w-0">
              {files.map((file, index) => {
                const fileId = `${file.name}-${file.size}`
                const progress = uploadProgress[fileId] || 0
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 min-w-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <DocumentFileTypeIcon
                        document={{ mimeType: file.type, fileName: file.name }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    {!isUploading && (
                      <IconTooltip label={t("workspace.documents.upload.removeFile")}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(index)}
                          className="h-8 w-8 shrink-0"
                          aria-label={t("workspace.documents.upload.removeFile")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                    )}
                    {isUploading && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-2 min-w-0 overflow-hidden">
            <p className="break-words">{error}</p>
            {failedFile && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-destructive min-w-0">
                <span className="font-medium">&ldquo;{failedFile.name}&rdquo;</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={handleRemoveFailedFile}
                >
                  {t("workspace.sources.upload.removeFailedFile", "Remove from upload")}
                </Button>
              </div>
            )}
          </div>
        )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setFiles([])
              setError(null)
              setFailedFileId(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ""
              }
            }}
            disabled={isUploading}
          >
            {t("workspace.sources.upload.clear")}
          </Button>
          <Button type="button" onClick={handleUpload} disabled={isUploading || files.length === 0}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("workspace.sources.upload.uploadingStatus")}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {files.length > 0
                  ? t("workspace.sources.upload.uploadCount", undefined, { count: files.length })
                  : t("workspace.sources.upload.upload")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
