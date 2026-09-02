"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SpaceUploadDocumentDialog } from "@/components/space-upload-document-dialog"
import { Download, ExternalLink, FileText, Loader2, MoreVertical, Trash2, Upload } from "lucide-react"
import { DocumentFileTypeIcon } from "@/components/document-file-type-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"
import { ViewModeToggle, useCollectionViewMode } from "@/components/view-mode-toggle"

export type SpaceDocumentItem = {
  id: string
  classification: "public" | "internal" | "confidential" | null
  created_at: string
  payload: {
    title?: string
    summary?: string
    file_url?: string
    file_name?: string
    mime_type?: string
  }
  source_url?: string | null
}

interface SpaceDocumentsPanelProps {
  spaceId: string
  documents: SpaceDocumentItem[]
  onDocumentsChange?: (documents: SpaceDocumentItem[]) => void
  spaceName: string
  canUpload?: boolean
  canManage?: boolean
}

export function SpaceDocumentsPanel({ spaceId, documents, onDocumentsChange, spaceName, canUpload = true, canManage = true }: SpaceDocumentsPanelProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useI18n()
  // Internal state for when onDocumentsChange is not provided (server component usage)
  const [internalDocuments, setInternalDocuments] = useState<SpaceDocumentItem[]>(documents ?? [])
  
  // Use internal state if no callback is provided, otherwise use prop
  const safeDocuments = onDocumentsChange ? (documents ?? []) : internalDocuments
  const { viewMode, setViewMode } = useCollectionViewMode(safeDocuments.length, `space.${spaceId}.documents`)

  // Update internal state when documents prop changes (for server component usage)
  useEffect(() => {
    if (!onDocumentsChange && documents) {
      setInternalDocuments(documents)
    }
  }, [documents, onDocumentsChange])

  const handleUploaded = (item: SpaceDocumentItem) => {
    const updatedDocuments = [item, ...safeDocuments.filter((doc) => doc.id !== item.id)]
    if (onDocumentsChange) {
      onDocumentsChange(updatedDocuments)
    } else {
      setInternalDocuments(updatedDocuments)
    }
  }

  const handleDelete = async (doc: SpaceDocumentItem) => {
    const itemId = doc.id
    const docTitle = doc.payload?.title || doc.payload?.file_name || t("space.documents.panel.untitled")

    setError(null)
    setIsDeleting(itemId)

    try {
      console.log(`[SpaceDocumentsPanel] Deleting item ${itemId} from space ${spaceId}`)
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        const sessionMessage = t("space.documents.panel.csrfError")
        setError(sessionMessage)
        toast.error(t("space.documents.panel.toastDeleteError"), { description: sessionMessage })
        setIsDeleting(null)
        return
      }

      const response = await fetch(`/api/spaces/${spaceId}/items/${itemId}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      })

      console.log(`[SpaceDocumentsPanel] Delete response status: ${response.status}`)

      const responseText = await response.text()
      let payload: any = null
      if (responseText) {
        try {
          payload = JSON.parse(responseText)
        } catch {
          payload = { error: responseText }
        }
      }

      if (!response.ok) {
        const errorMessage =
          payload?.error || payload?.message || t("space.documents.panel.toastDeleteError")
        console.error(`[SpaceDocumentsPanel] Delete error payload:`, payload)
        setError(errorMessage)
        toast.error(t("space.documents.panel.toastDeleteError"), { description: errorMessage })
        setIsDeleting(null)
        return
      }

      if (payload?.error) {
        setError(payload.error)
        toast.error(t("space.documents.panel.toastDeleteError"), { description: payload.error })
        setIsDeleting(null)
        return
      }

      console.log(`[SpaceDocumentsPanel] Document deleted successfully, updating UI`)
      const updatedDocuments = safeDocuments.filter((doc) => doc.id !== itemId)
      if (onDocumentsChange) {
        onDocumentsChange(updatedDocuments)
      } else {
        setInternalDocuments(updatedDocuments)
      }
      setIsDeleting(null)
      toast.success(t("space.documents.panel.dropdownDelete"), {
        description: t("space.documents.panel.toastDeleteSuccess", undefined, { title: docTitle, space: spaceName }),
      })
      
      // Refresh the page to ensure server component data is updated
      setTimeout(() => {
        router.refresh()
      }, 200)
    } catch (error) {
      console.error("[SpaceDocumentsPanel] Error deleting document:", error)
      const message = error instanceof Error ? error.message : t("space.documents.panel.toastDeleteError")
      setError(message)
      toast.error(t("space.documents.panel.toastDeleteError"), { description: message })
      setIsDeleting(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-semibold text-foreground">{t("space.documents.panel.title")}</h3>
            <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
              ({safeDocuments.length})
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("space.documents.panel.description", undefined, { space: spaceName })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle
            viewMode={viewMode}
            onChange={setViewMode}
            listLabel={t("space.documents.panel.viewList")}
            gridLabel={t("space.documents.panel.viewGrid")}
          />
          {canUpload && (
            <SpaceUploadDocumentDialog
              spaceId={spaceId}
              onUploaded={handleUploaded}
              trigger={
                <Button className="gap-2">
                  <Upload className="h-4 w-4" />
                  {t("space.documents.upload.trigger")}
                </Button>
              }
            />
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
      {error && <p className="mb-2 shrink-0 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {safeDocuments.length === 0 ? (
        <Card className="border-dashed shadow">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <h4 className="text-base font-semibold text-foreground">{t("space.documents.panel.emptyTitle")}</h4>
              <p className="text-sm text-muted-foreground">{t("space.documents.panel.emptyDescription")}</p>
            </div>
            {canUpload && (
              <SpaceUploadDocumentDialog
                spaceId={spaceId}
                onUploaded={handleUploaded}
                trigger={
                  <Button variant="outline">
                    {t("space.documents.panel.emptyUploadTrigger")}
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      ) : (
        (() => {
          const docCards = safeDocuments.map((doc) => {
            const docTitle = doc.payload?.title || doc.payload?.file_name || t("space.documents.panel.untitled")
            const href = `/spaces/${spaceId}/documents/${doc.id}`
            const fileDocument = {
              mimeType: doc.payload?.mime_type,
              fileName: doc.payload?.file_name,
              title: docTitle,
              url: doc.payload?.file_url,
            }

            return (
              <Card key={doc.id} className="group relative flex h-full flex-col shadow transition-all hover:shadow-md">
                <div className="absolute right-2 top-2 z-10">
                  <DocumentMenu
                    doc={doc}
                    spaceId={spaceId}
                    canManage={canManage}
                    isDeleting={isDeleting === doc.id}
                    onDelete={handleDelete}
                  />
                </div>
                <Link href={href} className="flex min-h-0 flex-1 flex-col pr-10">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-3">
                        <DocumentFileTypeIcon document={fileDocument} className="mt-0.5" />
                        <CardTitle className="text-base font-semibold">{docTitle}</CardTitle>
                      </div>
                      {doc.classification && (
                        <Badge variant="outline" className="shrink-0">
                          {t(`workspace.common.classification.${doc.classification}` as const)}
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {t("space.documents.panel.uploadedLabel", undefined, {
                        date: new Date(doc.created_at).toLocaleDateString(),
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3">
                    {doc.payload?.summary ? (
                      <p className="line-clamp-5 whitespace-pre-wrap text-sm text-muted-foreground">
                        {doc.payload.summary}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("space.documents.panel.summaryPlaceholder")}
                      </p>
                    )}
                    <Separator />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {doc.payload?.file_name && <Badge variant="secondary">{doc.payload.file_name}</Badge>}
                      {doc.payload?.mime_type && <span>{doc.payload.mime_type}</span>}
                    </div>
                  </CardContent>
                </Link>
              </Card>
            )
          })

          return viewMode === "grid" ? (
            <div className="scrollbar-on-hover min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{docCards}</div>
            </div>
          ) : (
            <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow">
              <CardContent className="relative min-h-0 flex-1 overflow-hidden p-0">
                <ScrollArea type="hover" scrollHideDelay={0} className="h-full">
                <div className="divide-y divide-border">
                  {safeDocuments.map((doc) => {
                    const docTitle = doc.payload?.title || doc.payload?.file_name || t("space.documents.panel.untitled")
                    const fileDocument = {
                      mimeType: doc.payload?.mime_type,
                      fileName: doc.payload?.file_name,
                      title: docTitle,
                      url: doc.payload?.file_url,
                    }

                    return (
                      <div
                        key={doc.id}
                        className="group relative flex items-stretch transition-colors hover:bg-muted/50"
                      >
                        <Link
                          href={`/spaces/${spaceId}/documents/${doc.id}`}
                          className="grid min-w-0 flex-1 grid-cols-[3fr_5fr_2fr_2fr] items-center gap-4 px-4 py-3 text-sm"
                        >
                          <div className="flex min-w-0 items-start gap-3 font-medium text-foreground">
                            <DocumentFileTypeIcon document={fileDocument} className="mt-0.5" />
                            <div className="min-w-0">
                              <span className="block truncate">{docTitle}</span>
                              <div className="text-xs text-muted-foreground">
                                {t("space.documents.panel.uploadedLabel", undefined, {
                                  date: new Date(doc.created_at).toLocaleDateString(),
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="text-muted-foreground">
                            {doc.payload?.summary ? (
                              <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                                {doc.payload.summary}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {t("space.documents.panel.summaryPlaceholder")}
                              </p>
                            )}
                          </div>
                          <div>
                            {doc.classification && (
                              <Badge variant="outline">
                                {t(`workspace.common.classification.${doc.classification}` as const)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {doc.payload?.file_name && <Badge variant="secondary">{doc.payload.file_name}</Badge>}
                          </div>
                        </Link>
                        <div className="flex shrink-0 items-center pr-2">
                          <DocumentMenu
                            doc={doc}
                            spaceId={spaceId}
                            canManage={canManage}
                            isDeleting={isDeleting === doc.id}
                            onDelete={handleDelete}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )
        })()
      )}
      </div>
    </div>
  )
}

function DocumentMenu({
  doc,
  spaceId,
  canManage,
  isDeleting,
  onDelete,
}: {
  doc: SpaceDocumentItem
  spaceId: string
  canManage: boolean
  isDeleting: boolean
  onDelete: (doc: SpaceDocumentItem) => void
}) {
  const { t } = useI18n()
  const fileHref = doc.payload?.file_url ? `/api/spaces/${spaceId}/items/${doc.id}/file` : doc.source_url

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span className="inline-flex">
          <IconTooltip label={t("space.documents.panel.dropdownMenuSr")}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">{t("space.documents.panel.dropdownMenuSr")}</span>
            </Button>
          </IconTooltip>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {fileHref ? (
          <DropdownMenuItem asChild className="cursor-pointer">
            <a
              href={fileHref}
              target={doc.payload?.file_url ? undefined : "_blank"}
              rel="noopener noreferrer"
              download={doc.payload?.file_url ? doc.payload.file_name || true : undefined}
              className="flex items-center gap-2"
            >
              {doc.payload?.file_url ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
              {doc.payload?.file_url
                ? t("space.documents.panel.dropdownDownload")
                : t("space.documents.panel.dropdownOpenPage")}
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>{t("space.documents.panel.dropdownNoUrl")}</DropdownMenuItem>
        )}
        {canManage ? (
          <DropdownMenuItem
            className="group cursor-pointer focus:bg-destructive/10 focus:text-destructive"
            disabled={isDeleting}
            onSelect={(event) => {
              event.preventDefault()
              if (!isDeleting) onDelete(doc)
            }}
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-destructive group-focus:text-destructive" />
            )}
            <span className="transition-colors group-hover:text-destructive group-focus:text-destructive">
              {t("space.documents.panel.dropdownDelete")}
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
