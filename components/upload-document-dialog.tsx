"use client"

import type React from "react"
import { useMemo, useState, useRef } from "react"
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
import { toast } from "sonner"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { useI18n } from "@/lib/i18n/use-i18n"

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

  const classificationOptions = useMemo(
    () => [
      { value: "public" as const, label: t("workspace.common.classification.public") },
      { value: "internal" as const, label: t("workspace.common.classification.internal") },
      { value: "confidential" as const, label: t("workspace.common.classification.confidential") },
    ],
    [t],
  )

  const getFileId = (file: File) => `${file.name}-${file.size}`

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...selectedFiles])
      setError(null)
      setFailedFileId(null)
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
    const csrfToken = await fetchCsrfToken()
    if (!csrfToken) {
      throw new Error(t("workspace.sources.upload.errorGeneral"))
    }

    return new Promise((resolve, reject) => {
      const fileId = getFileId(file)
      const xhr = new XMLHttpRequest()
      const formData = new FormData()

      const buildError = (message: string, code?: string): UploadError => {
        const errorInstance = new Error(message) as UploadError
        if (code) {
          errorInstance.code = code
        }
        errorInstance.fileName = file.name
        errorInstance.fileId = fileId
        return errorInstance
      }
      
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
              reject(buildError(response.error, response.errorCode))
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
            reject(new Error(t("workspace.sources.upload.errorParse")))
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            const message =
              xhr.status === 503
                ? t("workspace.sources.upload.errorUpload503")
                : error.error || t("workspace.sources.upload.errorUpload", undefined, { status: xhr.status })
            reject(buildError(message, error.errorCode))
          } catch {
            const message =
              xhr.status === 503
                ? t("workspace.sources.upload.errorUpload503")
                : t("workspace.sources.upload.errorUpload", undefined, { status: xhr.status })
            reject(buildError(message))
          }
        }
      })

      // Handle errors
      xhr.addEventListener("error", () => {
        reject(buildError(t("workspace.sources.upload.errorNetwork")))
      })

      // Handle abort
      xhr.addEventListener("abort", () => {
        reject(buildError(t("workspace.sources.upload.errorCancelled")))
      })

      // Start upload
      xhr.open("POST", `/api/documents/upload?workspaceId=${encodeURIComponent(workspaceId)}`)
      xhr.setRequestHeader("x-csrf-token", csrfToken)
      xhr.send(formData)
    })
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.sources.upload.title")}</DialogTitle>
          <DialogDescription>{t("workspace.sources.upload.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="classification">{t("workspace.common.classification.label")}</Label>
          <Select value={classification} onValueChange={(value: any) => setClassification(value)}>
            <SelectTrigger id="classification">
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
          {classification === "confidential" && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t("workspace.common.classification.confidentialNotice")}
              </AlertDescription>
            </Alert>
          )}
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
            {t("workspace.sources.upload.supportedFormats")}
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <Label>
              {t("workspace.sources.upload.selectedFiles")} ({files.length})
            </Label>
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

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-2">
            <p>{error}</p>
            {failedFile && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
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
