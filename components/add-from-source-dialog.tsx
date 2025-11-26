"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Loader2 } from "lucide-react"
import { addDocumentsFromSource } from "@/lib/actions/document"
import { useRouter } from "next/navigation"
import { OverheidSearch } from "@/components/overheid-search"
import { GoogleDriveSearch } from "@/components/google-drive-search"
import { formatSourceType } from "@/lib/utils"
import { getGoogleTokens } from "@/lib/actions/auth"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"

interface AddFromSourceDialogProps {
  workspaceId: string
  sources: Array<{
    id: string
    name: string
    type: string
    config?: Record<string, any>
  }>
  trigger?: React.ReactNode
  onSuccess?: () => void
}

interface SearchResult {
  title: string
  identifier: string
  type: string
  date?: string
  description?: string
  url?: string
}

export function AddFromSourceDialog({
  workspaceId,
  sources,
  trigger,
  onSuccess,
}: AddFromSourceDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState<string>("")
  const [classification, setClassification] = useState<"public" | "internal" | "confidential">("internal")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null)
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

  // Filter out direct_upload sources since they have their own upload button
  // Filter out workspace_generated sources since they're for internal workspace documents, not external sources
  // Sort sources alphabetically by name
  const availableSources = sources
    .filter((source) => source.type !== "direct_upload" && source.type !== "workspace_generated")
    .sort((a, b) => a.name.localeCompare(b.name))

  const selectedSource = availableSources.find((c) => c.id === selectedSourceId)

  // Fetch fresh Google tokens when Google Drive source is selected
  useEffect(() => {
    const fetchGoogleToken = async () => {
      const selectedSource = availableSources.find((s) => s.id === selectedSourceId)
      if (selectedSource?.type === "google_drive") {
        try {
          const tokens = await getGoogleTokens()
          if (tokens.access_token && !tokens.error) {
            setGoogleAccessToken(tokens.access_token)
          } else {
            // Fall back to source config token
            setGoogleAccessToken(selectedSource.config?.access_token || null)
          }
        } catch (err) {
          // Fall back to source config token
          setGoogleAccessToken(selectedSource.config?.access_token || null)
        }
      } else {
        setGoogleAccessToken(null)
      }
    }

    if (open && selectedSourceId) {
      fetchGoogleToken()
    }
  }, [open, selectedSourceId, availableSources])

  const handleDocumentsSelected = async (documents: SearchResult[]) => {
    if (!selectedSourceId || documents.length === 0) {
      return
    }

    setAdding(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await addDocumentsFromSource(workspaceId, selectedSourceId, documents, classification)

      if (result.error) {
        setError(result.error)
        toast.error(t("workspace.sources.addFrom.toastFailure"), { description: result.error })
      } else if ((result.addedCount ?? 0) === 0 && documents.length > 0) {
        const message = t("workspace.sources.addFrom.toastFailureDescription")
        setError(message)
        toast.error(t("workspace.sources.addFrom.toastNoDocuments"), { description: message })
      } else {
        const count = result.addedCount ?? documents.length
        const sourceSuffix = selectedSource
          ? t("workspace.sources.addFrom.sourceSuffix", undefined, { name: selectedSource.name })
          : ""
        const successMessage = t("workspace.sources.addFrom.toastSuccessDescription", undefined, {
          count,
          source: sourceSuffix,
        })
        setSuccess(successMessage)
        toast.success(t("workspace.sources.addFrom.toastSuccess"), {
          description: successMessage,
        })
        router.refresh()
        onSuccess?.()
        
        // Dispatch custom event to notify chat interface and other components
        window.dispatchEvent(new CustomEvent("documentUploaded", { 
          detail: { workspaceId } 
        }))
        
        setTimeout(() => {
          setOpen(false)
          setSuccess(null)
        }, 2000)
      }
    } catch (err) {
      const description = err instanceof Error ? err.message : t("workspace.sources.addFrom.toastFailure")
      setError(description)
      toast.error(t("workspace.sources.addFrom.toastFailure"), { description })
    } finally {
      setAdding(false)
    }
  }

  const handleClose = (open: boolean) => {
    setOpen(open)
    if (!open) {
      // Reset state when closing
      setSelectedSourceId("")
      setError(null)
      setSuccess(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t("workspace.sources.addFrom.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="!max-w-[95vw] sm:!max-w-[1400px] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle>{t("workspace.sources.addFrom.title")}</DialogTitle>
          <DialogDescription>{t("workspace.sources.addFrom.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 pb-4">
            {/* Source Selection */}
            {availableSources.length === 0 ? (
              <Alert>
                <AlertDescription>{t("workspace.sources.addFrom.noSources")}</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="source-select">{t("workspace.sources.addFrom.selectLabel")}</Label>
                  <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                    <SelectTrigger id="source-select">
                      <SelectValue placeholder={t("workspace.sources.addFrom.selectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

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
                      <AlertDescription className="text-xs">
                        {t("workspace.common.classification.confidentialNotice")}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Placeholder when no source is selected */}
                {!selectedSourceId && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("workspace.sources.addFrom.selectSourcePrompt")}
                    </p>
                  </div>
                )}

                {/* Overheid.nl Search UI */}
                {selectedSource?.type === "overheid_nl" && (
                  <OverheidSearch
                    onDocumentsSelected={handleDocumentsSelected}
                    showSelection={true}
                  />
                )}

                {/* Google Drive Search UI */}
                {selectedSource?.type === "google_drive" && (
                  <>
                    {googleAccessToken || selectedSource.config?.access_token ? (
                      <GoogleDriveSearch
                        accessToken={googleAccessToken || selectedSource.config?.access_token || ""}
                        onDocumentsSelected={handleDocumentsSelected}
                        showSelection={true}
                      />
                    ) : (
                      <Alert variant="destructive">
                        <AlertDescription>
                          {t("workspace.sources.addFrom.missingToken")}
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}

                {/* Other source types placeholder */}
                {selectedSource && selectedSource.type !== "overheid_nl" && selectedSource.type !== "google_drive" && (
                  <Alert>
                    <AlertDescription>
                      {t("workspace.sources.addFrom.otherPlaceholder", undefined, { type: selectedSource.type })}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer with Error/Success Messages - Always visible */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-background flex-col gap-2 sm:flex-row sm:justify-start min-h-[80px] flex-shrink-0">
          <div className="flex-1 w-full min-h-[52px] flex items-start">
            {error && (
              <Alert variant="destructive" className="w-full">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="w-full">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {adding && (
              <div className="flex items-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">{t("workspace.sources.addFrom.adding")}</span>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
