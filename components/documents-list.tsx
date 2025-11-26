"use client"

import type React from "react"
import { useState, useMemo, useCallback, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  FileText,
  ExternalLink,
  Search,
  MoreVertical,
  Archive,
  Trash2,
  ArchiveRestore,
  Plus,
  Upload,
  Download,
  Plug,
  ArchiveX,
  Info,
} from "lucide-react"
import { deleteDocument, archiveDocument, getWorkspaceDocuments, getArchivedDocumentCount } from "@/lib/actions/document"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatSourceType } from "@/lib/utils"
import { UploadDocumentDialog } from "@/components/upload-document-dialog"
import { AddFromSourceDialog } from "@/components/add-from-source-dialog"
import { CreateSourceDialog } from "@/components/create-source-dialog"
import { ManageSourcesDialog } from "@/components/manage-sources-dialog"
import { FileIcon, defaultStyles } from "react-file-icon"
import { getDocumentFileExtension } from "@/lib/utils/document-files"
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"

interface DocumentsListProps {
  workspaceId: string
  initialDocuments: any[]
  initialArchivedCount?: number
  sources?: Array<{
    id: string
    name: string
    type: string
    config?: Record<string, any>
  }>
  canManage?: boolean
}

export function DocumentsList({ workspaceId, initialDocuments, initialArchivedCount = 0, sources = [], canManage = true }: DocumentsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [documentToDelete, setDocumentToDelete] = useState<any | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [archivingDocId, setArchivingDocId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [documents, setDocuments] = useState(initialDocuments)
  const [archivedCount, setArchivedCount] = useState(initialArchivedCount)
  const [isLoadingArchived, setIsLoadingArchived] = useState(false)
  const router = useRouter()
  const { t } = useI18n()
  const addSourceLabel = t("workspace.documents.list.addSource")
  const addFromSourceLabel = t("workspace.documents.list.addFromSource")
  const manageSourcesLabel = t("workspace.documents.list.manageSources")
  const emptyTitleLabel = t("workspace.documents.list.emptyTitle")
  const emptyManageDescription = t("workspace.documents.list.emptyManageDescription")
  const emptyReadOnlyDescription = t("workspace.documents.list.emptyReadOnlyDescription")
  const getSourceTypeLabel = useCallback(
    (sourceType?: string | null) => {
      if (!sourceType) return ""
      return t(`workspace.sources.card.type.${sourceType}`, formatSourceType(sourceType))
    },
    [t],
  )

  const emitWorkspaceContextUpdate = useCallback(
    (payload?: Record<string, any>) => {
      if (typeof window === "undefined") return

      window.dispatchEvent(
        new CustomEvent("workspaceContextUpdated", {
          detail: {
            workspaceId,
            ...(payload || {}),
          },
        }),
      )
    },
    [workspaceId],
  )

  // Helper to check if document is inherited
  const isInheritedDocument = useCallback((doc: any) => {
    const metadata = doc?.metadata
    if (!metadata || typeof metadata !== "object") {
      return false
    }
    const originValue = (metadata as Record<string, any>).origin
    return originValue === "space_scope"
  }, [])

  // Sync local state with server-side props when they change (e.g., after upload/refresh)
  useEffect(() => {
    // Filter out inherited documents - they're shown in the "Inherited" tab
    const nonInheritedDocs = initialDocuments.filter((doc: any) => !isInheritedDocument(doc))
    setDocuments(nonInheritedDocs)
  }, [initialDocuments, isInheritedDocument])

  useEffect(() => {
    setArchivedCount(initialArchivedCount)
  }, [initialArchivedCount])

  // Function to fetch documents from server
  const fetchDocuments = useCallback(async (includeArchived: boolean) => {
    setIsLoadingArchived(true)
    try {
      const [documentsResult, archivedCountResult] = await Promise.all([
        getWorkspaceDocuments(workspaceId, includeArchived),
        getArchivedDocumentCount(workspaceId)
      ])
      
      if (documentsResult.data) {
        // Filter out inherited documents - they're shown in the "Inherited" tab, not "Sources"
        const nonInheritedDocs = documentsResult.data.filter((doc: any) => !isInheritedDocument(doc))
        setDocuments(nonInheritedDocs)
      }
      
      // Always update archived count from the dedicated query
      setArchivedCount(archivedCountResult.count || 0)
    } catch (error) {
      console.error("Failed to fetch documents:", error)
      toast.error(t("workspace.documents.list.toastFetchError"))
    } finally {
      setIsLoadingArchived(false)
    }
  }, [workspaceId, isInheritedDocument, t])

  // Listen for document upload events and refresh the list
  useEffect(() => {
    const handleDocumentUploaded = (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.workspaceId === workspaceId) {
        // Refresh documents from server
        fetchDocuments(showArchived)
      }
    }

    window.addEventListener("documentUploaded", handleDocumentUploaded)
    return () => {
      window.removeEventListener("documentUploaded", handleDocumentUploaded)
    }
  }, [workspaceId, showArchived, fetchDocuments])

  // Filter out direct_upload sources to get available sources for adding documents
  // Filter out workspace_generated sources since they're for internal workspace documents, not external sources
  const availableSources = (sources || []).filter((source) => source.type !== "direct_upload" && source.type !== "workspace_generated")

  const handleDelete = async () => {
    if (!documentToDelete) {
      return
    }
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }

    const documentId = documentToDelete.id
    const documentTitle =
      documentToDelete.title || documentToDelete.metadata?.title || t("workspace.documents.create.trigger")

    const result = await deleteDocument(documentId, workspaceId)
    if (result.error) {
      toast.error(t("workspace.documents.list.toastDeleteError", undefined, { title: documentTitle }), {
        description: result.error,
      })
    } else {
      emitWorkspaceContextUpdate({
        type: "document",
        action: "deleted",
        documentId,
      })
      toast.success(t("workspace.documents.list.toastDeleteSuccessTitle"), {
        description: t("workspace.documents.list.toastDeleteSuccess", undefined, { title: documentTitle }),
      })
      // Close dialog and refresh after animation completes
      setDocumentToDelete(null)
      setNeedsConfirmation(false)
      setTimeout(() => {
        router.refresh()
      }, 200)
    }
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      // Set state immediately to close dialog, cleanup happens after animation
      setDocumentToDelete(null)
      setNeedsConfirmation(false)
      // Force cleanup after a brief delay to ensure portal unmounts
      setTimeout(() => {
        document.body.style.pointerEvents = ""
        document.body.style.overflow = ""
      }, 0)
    }
  }

  const handleArchive = async (documentId: string, archive: boolean) => {
    const result = await archiveDocument(documentId, workspaceId, archive)
    if (result.error) {
      toast.error(
        archive
          ? t("workspace.documents.list.toastArchiveError")
          : t("workspace.documents.list.toastUnarchiveError"),
        { description: result.error },
      )
    } else {
      setArchivingDocId(null)
      emitWorkspaceContextUpdate({
        type: "document",
        action: archive ? "archived" : "unarchived",
        documentId,
      })
      toast.success(
        archive
          ? t("workspace.documents.list.toastArchiveSuccessTitle")
          : t("workspace.documents.list.toastUnarchiveSuccessTitle"),
        {
          description: archive
            ? t("workspace.documents.list.toastArchiveSuccess")
            : t("workspace.documents.list.toastUnarchiveSuccess"),
        },
      )
      // Refresh documents list to reflect changes
      await fetchDocuments(showArchived)
    }
  }

  const toggleShowArchived = async () => {
    const newShowArchived = !showArchived
    setShowArchived(newShowArchived)
    await fetchDocuments(newShowArchived)
  }

  // Filter documents client-side as user types - works from first character
  const filteredDocuments = useMemo(() => {
    const docs = documents || []
    
    // If no search query, show all documents
    if (!searchQuery || searchQuery.trim() === "") {
      return docs
    }

    // Filter from the very first character - no minimum length required
    const query = searchQuery.toLowerCase().trim()
    
    // Filter documents - check title, content, and source name
    return docs.filter((doc: any) => {
      const title = String(doc?.title || "").toLowerCase()
      const content = String(doc?.content || "").toLowerCase()
      const sourceName = String(doc?.sources?.name || "").toLowerCase()
      
      return title.includes(query) || content.includes(query) || sourceName.includes(query)
    })
  }, [searchQuery, documents])

  const displayDocuments = filteredDocuments
  
  const activeDocuments = documents.filter((doc: any) => doc.status !== "archived")

  const archivedToggleLabel =
    archivedCount > 0
      ? showArchived
        ? t("workspace.documents.list.archivedHide", undefined, { count: archivedCount })
        : t("workspace.documents.list.archivedShow", undefined, { count: archivedCount })
      : ""

  if (!documents || documents.length === 0 || (!showArchived && activeDocuments.length === 0)) {
    return (
      <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("workspace.documents.list.searchPlaceholder")}
              className="pl-10 w-full"
              disabled
            />
          </div>
          {archivedCount > 0 && (
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={toggleShowArchived}
              disabled={isLoadingArchived}
              className="whitespace-nowrap"
            >
              <Archive className="mr-2 h-4 w-4" />
              {archivedToggleLabel}
            </Button>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {availableSources.length > 0 && (
              <ManageSourcesDialog
                workspaceId={workspaceId}
                initialSources={sources as Array<{
                  id: string
                  name: string
                  type: string
                  status: string
                  last_sync_at: string | null
                }>}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plug className="mr-2 h-4 w-4" />
                    {manageSourcesLabel}
                  </Button>
                }
              />
            )}
            {availableSources.length === 0 ? (
              <CreateSourceDialog
                workspaceId={workspaceId}
                existingSources={availableSources}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {addSourceLabel}
                  </Button>
                }
              />
            ) : (
              <AddFromSourceDialog
                workspaceId={workspaceId}
                sources={sources}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {addFromSourceLabel}
                  </Button>
                }
              />
            )}
            <UploadDocumentDialog
              workspaceId={workspaceId}
              trigger={
                <Button size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  {t("workspace.sources.upload.trigger")}
                </Button>
              }
            />
          </div>
        )}
      </div>

        <Card className="shadow">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">{emptyTitleLabel}</h3>
            <p className="text-center text-sm text-muted-foreground">
              {canManage
                ? emptyManageDescription
                : emptyReadOnlyDescription}
            </p>
            {canManage && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {availableSources.length === 0 ? (
                  <CreateSourceDialog
                    workspaceId={workspaceId}
                    existingSources={availableSources}
                    trigger={
                      <Button variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        {addSourceLabel}
                      </Button>
                    }
                  />
                ) : (
                  <AddFromSourceDialog
                    workspaceId={workspaceId}
                    sources={sources}
                    trigger={
                      <Button variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        {addFromSourceLabel}
                      </Button>
                    }
                  />
                )}
                <UploadDocumentDialog
                  workspaceId={workspaceId}
                  trigger={
                    <Button variant="outline">
                      <Upload className="mr-2 h-4 w-4" />
                      {t("workspace.sources.upload.trigger")}
                    </Button>
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("workspace.documents.list.searchPlaceholder")}
              className="pl-10 w-full"
            />
          </div>
          {archivedCount > 0 && (
            <Button
              variant={showArchived ? "default" : "outline"}
              size="sm"
              onClick={toggleShowArchived}
              disabled={isLoadingArchived}
              className="whitespace-nowrap"
            >
              <Archive className="mr-2 h-4 w-4" />
              {archivedToggleLabel}
            </Button>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {availableSources.length > 0 && (
              <ManageSourcesDialog
                workspaceId={workspaceId}
                initialSources={sources as Array<{
                  id: string
                  name: string
                  type: string
                  status: string
                  last_sync_at: string | null
                }>}
                trigger={
                  <Button variant="outline" size="sm">
                    <Plug className="mr-2 h-4 w-4" />
                    {manageSourcesLabel}
                  </Button>
                }
              />
            )}
            {availableSources.length === 0 ? (
              <CreateSourceDialog
                workspaceId={workspaceId}
                existingSources={availableSources}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {addSourceLabel}
                  </Button>
                }
              />
            ) : (
              <AddFromSourceDialog
                workspaceId={workspaceId}
                sources={sources}
                trigger={
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {addFromSourceLabel}
                  </Button>
                }
              />
            )}
            <UploadDocumentDialog
              workspaceId={workspaceId}
              trigger={
                <Button size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  {t("workspace.sources.upload.trigger")}
                </Button>
              }
            />
          </div>
        )}
      </div>
      
      {showArchived && archivedCount > 0 && (
        <Alert variant="info">
          <Info />
          <AlertDescription>{t("workspace.documents.list.archivedAlert")}</AlertDescription>
        </Alert>
      )}
 
      {displayDocuments.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-4">
            {displayDocuments.map((doc: any) => {
                  const fileExtension = getDocumentFileExtension(doc)
                  const isArchived = doc.status === "archived"
                  const sourceTypeLabel = getSourceTypeLabel(doc.sources?.type)
                  return (
                  <Card key={doc.id} className={`shadow hover:shadow-md transition-shadow ${isArchived ? "opacity-70 bg-muted/30" : ""}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 shrink-0 mt-0.5 flex items-center overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:grayscale">
                      <FileIcon
                        extension={fileExtension}
                        {...(defaultStyles[fileExtension as keyof typeof defaultStyles] || {})}
                        label={false}
                        glyphColor="#fff"
                        color="#6b7280"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 min-w-0">
                        <CardTitle className="text-base font-semibold leading-tight line-clamp-2 break-words">
                          {doc.title}
                        </CardTitle>
                        {isArchived && (
                          <Badge variant="secondary" className="text-xs">
                            <Archive className="mr-1 h-3 w-3" />
                            {t("workspace.documents.list.archivedBadge")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {sourceTypeLabel && <span>{sourceTypeLabel}</span>}
                        {doc.created_at && (
                          <>
                            <span className="text-muted-foreground/60">·</span>
                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.id && (
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" asChild>
                        <Link href={`/workspaces/${workspaceId}/documents/${doc.id}`}>
                          {t("workspace.documents.list.viewDocument")}
                        </Link>
                      </Button>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {doc.url && (
                            <DropdownMenuItem asChild>
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cursor-pointer"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                {t("workspace.documents.list.download")}
                              </a>
                            </DropdownMenuItem>
                          )}
                          {doc.status === "archived" ? (
                            <DropdownMenuItem
                              onClick={() => handleArchive(doc.id, false)}
                              className="cursor-pointer"
                            >
                              <ArchiveRestore className="mr-2 h-4 w-4" />
                              {t("workspace.documents.list.unarchive")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleArchive(doc.id, true)}
                              className="cursor-pointer"
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              {t("workspace.documents.list.archive")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setDocumentToDelete(doc)
                              setNeedsConfirmation(false)
                            }}
                            className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            <span>{t("workspace.documents.list.deleteSubmit")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {doc.content && (
                  <p className="line-clamp-2 text-xs text-muted-foreground mb-3">
                    {doc.content.substring(0, 200)}
                    {doc.content.length > 200 && "..."}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {doc.metadata?.size && (
                    <span>{(doc.metadata.size / 1024).toFixed(1)} KB</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )
          })}
          </div>
        </div>
      ) : (
        <Card className="shadow">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">{t("workspace.documents.list.noResultsTitle")}</h3>
            <p className="text-center text-sm text-muted-foreground">
              {t("workspace.documents.list.noResultsDescription", undefined, { query: searchQuery })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={documentToDelete !== null} onOpenChange={handleDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workspace.documents.list.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.documents.list.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsConfirmation && (
            <p className="text-sm text-destructive font-medium">
              {t("workspace.documents.list.deleteWarning")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("workspace.documents.create.buttonCancel")}</AlertDialogCancel>
            {needsConfirmation ? (
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("workspace.documents.list.deleteConfirm")}
              </AlertDialogAction>
            ) : (
              <Button
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("workspace.documents.list.deleteSubmit")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
