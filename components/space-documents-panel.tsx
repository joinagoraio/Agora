"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SpaceUploadDocumentDialog } from "@/components/space-upload-document-dialog"
import { Download, ExternalLink, FileText, LayoutGrid, List, Loader2, MoreVertical, Trash2, Upload } from "lucide-react"
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const { t } = useI18n()
  // Internal state for when onDocumentsChange is not provided (server component usage)
  const [internalDocuments, setInternalDocuments] = useState<SpaceDocumentItem[]>(documents ?? [])
  
  // Use internal state if no callback is provided, otherwise use prop
  const safeDocuments = onDocumentsChange ? (documents ?? []) : internalDocuments
  
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{t("space.documents.panel.title")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("space.documents.panel.description", undefined, { space: spaceName })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md bg-background p-1">
            <IconTooltip label={t("space.documents.panel.viewList")}>
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                <List className="h-4 w-4" />
                <span className="sr-only">{t("space.documents.panel.viewList")}</span>
              </Button>
            </IconTooltip>
            <IconTooltip label={t("space.documents.panel.viewGrid")}>
              <Button
                type="button"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="sr-only">{t("space.documents.panel.viewGrid")}</span>
              </Button>
            </IconTooltip>
          </div>
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

      {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {safeDocuments.length === 0 ? (
        <Card className="border-dashed shadow">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
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

            return (
              <Card key={doc.id} className="flex h-full flex-col shadow">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">{docTitle}</CardTitle>
                    {doc.classification && (
                      <Badge variant="outline">
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
                    <p className="text-sm text-muted-foreground line-clamp-5 whitespace-pre-wrap">
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
                {canManage && (
                  <CardFooter className="flex items-center justify-end gap-2">
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
                        {doc.payload?.file_url ? (
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <Link
                              href={doc.payload.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2"
                            >
                              <Download className="h-4 w-4" />
                              {t("space.documents.panel.dropdownDownload")}
                            </Link>
                          </DropdownMenuItem>
                        ) : doc.source_url ? (
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <Link
                              href={doc.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2"
                            >
                              <ExternalLink className="h-4 w-4" />
                              {t("space.documents.panel.dropdownOpenPage")}
                            </Link>
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled>
                            {t("space.documents.panel.dropdownNoUrl")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="group cursor-pointer focus:bg-destructive/10 focus:text-destructive"
                          disabled={isDeleting === doc.id}
                          onSelect={(event) => {
                            event.preventDefault()
                            if (isDeleting !== doc.id) {
                              handleDelete(doc)
                            }
                          }}
                        >
                          {isDeleting === doc.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-destructive group-focus:text-destructive" />
                          )}
                          <span className="transition-colors group-hover:text-destructive group-focus:text-destructive">
                            Delete
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardFooter>
                )}
              </Card>
            )
          })

          return viewMode === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{docCards}</div>
          ) : (
            <Card className="shadow">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {safeDocuments.map((doc) => {
                    const docTitle = doc.payload?.title || doc.payload?.file_name || t("space.documents.panel.untitled")

                    return (
                      <div
                        key={doc.id}
                        className="grid grid-cols-[3fr_5fr_2fr_2fr_auto] items-center gap-4 px-4 py-3 text-sm"
                      >
                        <div className="font-medium text-foreground">
                          {docTitle}
                          <div className="text-xs text-muted-foreground">
                            {t("space.documents.panel.uploadedLabel", undefined, {
                              date: new Date(doc.created_at).toLocaleDateString(),
                            })}
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
                        {canManage && (
                          <div className="flex justify-end">
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
                                {doc.payload?.file_url ? (
                                <DropdownMenuItem asChild className="cursor-pointer">
                                  <Link
                                    href={doc.payload.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2"
                                  >
                                    <Download className="h-4 w-4" />
                                    {t("space.documents.panel.dropdownDownload")}
                                  </Link>
                                </DropdownMenuItem>
                              ) : doc.source_url ? (
                                <DropdownMenuItem asChild className="cursor-pointer">
                                  <Link
                                    href={doc.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    {t("space.documents.panel.dropdownOpenPage")}
                                  </Link>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled>
                                  {t("space.documents.panel.dropdownNoUrl")}
                                </DropdownMenuItem>
                              )}
                                <DropdownMenuItem
                                  className="group cursor-pointer focus:bg-destructive/10 focus:text-destructive"
                                  disabled={isDeleting === doc.id}
                          onSelect={(event) => {
                                    event.preventDefault()
                                    if (isDeleting !== doc.id) {
                              handleDelete(doc)
                                    }
                                  }}
                                >
                                  {isDeleting === doc.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
                                  ) : (
                                    <Trash2 className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-destructive group-focus:text-destructive" />
                                  )}
                                  <span className="transition-colors group-hover:text-destructive group-focus:text-destructive">
                                    {t("space.documents.panel.dropdownDelete")}
                                  </span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })()
      )}
    </div>
  )
}
