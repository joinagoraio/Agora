"use client"

import { type ReactNode, useMemo, useRef, useState } from "react"

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
import { IconTooltip } from "@/components/icon-tooltip"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

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
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const clearSelectedFile = () => {
    setFile(null)
    setTitle("")
    resetFileInput()
  }

  const classificationOptions = useMemo(
    () => [
      { value: "public" as const, label: t("workspace.common.classification.public") },
      { value: "internal" as const, label: t("workspace.common.classification.internal") },
      { value: "confidential" as const, label: t("workspace.common.classification.confidential") },
    ],
    [t],
  )

  const MAX_FILE_SIZE_BYTES = 9 * 1024 * 1024

  const safeJsonParse = async (res: Response, step: string): Promise<any> => {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      console.error(`[SpaceUpload] ${step}: status=${res.status}, body=${text.substring(0, 500)}`)
      const isServerError = res.status >= 500 || res.status === 0 || (res.headers.get("content-type") ?? "").includes("text/html")
      throw new Error(isServerError
        ? t("workspace.sources.upload.errorServerUnavailable")
        : t("space.documents.upload.errorParse"))
    }
  }

  const handleUpload = async () => {
    if (!file) {
      const message = t("space.documents.upload.errorNoFile")
      setError(message)
      toast.error(t("space.documents.upload.toastNoFile"), { description: message })
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const message = t("workspace.sources.upload.errorFileTooLarge")
      setError(message)
      toast.error(t("space.documents.upload.toastUploadFailed"), { description: message })
      return
    }

    setIsUploading(true)
    setError(null)
    setSyncWarning(null)

    try {
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        throw new Error(t("space.documents.upload.toastUploadBlocked"))
      }

      const urlBody = await safeJsonParse(
        await fetch(`/api/spaces/${spaceId}/documents/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        }),
        "upload-url",
      )
      if (urlBody.error) throw new Error(urlBody.error)
      const { path, token } = urlBody
      if (!path || !token) throw new Error(t("space.documents.upload.errorParse"))

      const supabase = createSupabaseClient()
      const { error: storageErr } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined })
      if (storageErr) throw new Error(storageErr.message)

      const payload = await safeJsonParse(
        await fetch(`/api/spaces/${spaceId}/documents/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({
            storagePath: path,
            title: title.trim() || file.name,
            filename: file.name,
            mimeType: file.type,
            classification,
            notes: notes.trim(),
          }),
        }),
        "upload-finalize",
      )
      if (payload.error) throw new Error(payload.error)

      onUploaded?.(payload.data)

      if (payload.warnings && payload.warnings.length > 0) {
        setSyncWarning(payload.warnings.join(" "))
        setFile(null)
        setTitle("")
        setNotes("")
        toast.warning(t("space.documents.upload.warningToast"), {
          description: payload.warnings.join(" "),
        })
        setIsUploading(false)
        return
      }

      const uploadedName =
        payload?.data?.payload?.title ||
        payload?.data?.payload?.file_name ||
        payload?.data?.title ||
        title.trim() ||
        file?.name ||
        t("space.documents.upload.trigger")

      setIsOpen(false)
      setFile(null)
      setTitle("")
      setNotes("")
      setClassification("public")
      resetFileInput()
      toast.success(t("space.documents.upload.successToast"), {
        description: t("space.documents.upload.successDescription", undefined, { name: uploadedName }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : t("space.documents.upload.toastUploadFailed")
      setError(message)
      toast.error(t("space.documents.upload.toastUploadFailed"), { description: message })
    } finally {
      setIsUploading(false)
    }
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
      resetFileInput()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? <Button>{t("space.documents.upload.trigger")}</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("space.documents.upload.title")}</DialogTitle>
          <DialogDescription>{t("space.documents.upload.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="space-document-file">{t("space.documents.upload.fileLabel")}</Label>
            <Input
              ref={fileInputRef}
              id="space-document-file"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.markdown"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null
                setFile(selectedFile)
                if (selectedFile) {
                  const fileName = selectedFile.name
                  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "")
                  setTitle(nameWithoutExt)
                }
              }}
              className="sr-only"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {file ? t("space.documents.upload.changeFile") : t("space.documents.upload.fileButton")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {file
                  ? t("space.documents.upload.fileSelected", undefined, { name: file.name })
                  : t("space.documents.upload.noFileSelected")}
              </span>
              {file && (
                <IconTooltip label={t("space.documents.upload.removeFile")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearSelectedFile}
                    className="h-10 w-10 hover:bg-red-500 group"
                    aria-label={t("space.documents.upload.removeFile")}
                  >
                    <X className="h-4 w-4 group-hover:text-white" />
                  </Button>
                </IconTooltip>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("space.documents.upload.fileHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-document-title">{t("space.documents.upload.titleLabel")}</Label>
            <Input
              id="space-document-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("space.documents.upload.titlePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("workspace.common.classification.label")}</Label>
            <Select value={classification} onValueChange={(value) => setClassification(value as typeof classification)}>
              <SelectTrigger>
                <SelectValue placeholder={t("space.documents.upload.classificationPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {classificationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-document-notes">{t("space.documents.upload.notesLabel")}</Label>
            <Textarea
              id="space-document-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("space.documents.upload.notesPlaceholder")}
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
            {t("space.documents.upload.buttonCancel")}
          </Button>
          <Button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("space.documents.upload.uploading")}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t("space.documents.upload.buttonUpload")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
