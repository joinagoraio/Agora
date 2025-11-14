"use client"

import type React from "react"
import { useState, useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { FileText, ExternalLink, Calendar, Search, MoreVertical, Archive, Trash2, ArchiveRestore, Plus, Upload, Download } from "lucide-react"
import { deleteDocument, archiveDocument } from "@/lib/actions/document"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatSourceType } from "@/lib/utils"
import { UploadDocumentDialog } from "@/components/upload-document-dialog"
import { AddFromSourceDialog } from "@/components/add-from-source-dialog"
import { FileIcon, defaultStyles } from "react-file-icon"

interface DocumentsListProps {
  workspaceId: string
  initialDocuments: any[]
  sources?: Array<{
    id: string
    name: string
    type: string
    config?: Record<string, any>
  }>
}

// Helper function to get file extension from document
function getFileExtension(doc: any): string {
  // Check metadata first
  const metadata = doc.metadata || {}
  if (metadata.type) {
    const type = String(metadata.type).toLowerCase()
    if (type.includes("pdf")) return "pdf"
    if (type.includes("word") || type.includes("msword") || type.includes("wordprocessingml")) return "docx"
    if (type.includes("html")) return "html"
    if (type.includes("text") || type.includes("plain")) return "txt"
    if (type.includes("markdown")) return "md"
    if (type.includes("spreadsheet") || type.includes("excel") || type.includes("sheet")) return "xlsx"
    if (type.includes("presentation") || type.includes("powerpoint") || type.includes("slides")) return "pptx"
    if (type.includes("image")) {
      // Try to determine image type from metadata or default to png
      if (type.includes("jpeg") || type.includes("jpg")) return "jpg"
      if (type.includes("png")) return "png"
      if (type.includes("gif")) return "gif"
      if (type.includes("svg")) return "svg"
      return "png"
    }
  }

  if (metadata.contentType) {
    const ct = String(metadata.contentType).toLowerCase()
    if (ct.includes("application/pdf")) return "pdf"
    if (ct.includes("application/msword")) return "doc"
    if (ct.includes("wordprocessingml")) return "docx"
    if (ct.includes("text/html")) return "html"
    if (ct.includes("text/plain")) return "txt"
    if (ct.includes("text/markdown")) return "md"
    if (ct.includes("spreadsheet") || ct.includes("excel") || ct.includes("sheet")) return "xlsx"
    if (ct.includes("presentation") || ct.includes("powerpoint") || ct.includes("slides")) return "pptx"
    if (ct.includes("image/jpeg")) return "jpg"
    if (ct.includes("image/png")) return "png"
    if (ct.includes("image/gif")) return "gif"
    if (ct.includes("image/svg")) return "svg"
  }

  // Check file extension from URL or title
  const filename = doc.url?.split("/").pop() || doc.title || ""
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  
  // Return the extension if it's valid, otherwise default to a generic file type
  if (ext && ["pdf", "doc", "docx", "html", "htm", "txt", "md", "markdown", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "gif", "svg"].includes(ext)) {
    return ext === "htm" ? "html" : ext === "jpeg" ? "jpg" : ext
  }
  
  return "file" // Default fallback
}

export function DocumentsList({ workspaceId, initialDocuments, sources = [] }: DocumentsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [archivingDocId, setArchivingDocId] = useState<string | null>(null)
  const router = useRouter()

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

  // Filter out direct_upload sources to get available sources for adding documents
  const availableSources = (sources || []).filter((source) => source.type !== "direct_upload")

  const handleDelete = async (documentId: string) => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    const result = await deleteDocument(documentId, workspaceId)
    if (result.error) {
      alert(`Failed to delete document: ${result.error}`)
    } else {
      emitWorkspaceContextUpdate({
        type: "document",
        action: "deleted",
        documentId,
      })
      // Close dialog and refresh after animation completes
      setDeletingDocId(null)
      setNeedsConfirmation(false)
      setTimeout(() => {
        router.refresh()
      }, 200)
    }
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      // Set state immediately to close dialog, cleanup happens after animation
      setDeletingDocId(null)
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
      alert(`Failed to ${archive ? "archive" : "unarchive"} document: ${result.error}`)
    } else {
      setArchivingDocId(null)
      emitWorkspaceContextUpdate({
        type: "document",
        action: archive ? "archived" : "unarchived",
        documentId,
      })
      router.refresh()
    }
  }

  // Filter documents client-side as user types - works from first character
  const filteredDocuments = useMemo(() => {
    const docs = initialDocuments || []
    
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
  }, [searchQuery, initialDocuments])

  const displayDocuments = filteredDocuments

  if (!initialDocuments || initialDocuments.length === 0) {
    return (
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sources..."
            className="pl-10 w-full"
            disabled
          />
        </div>

        <Card className="shadow">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
            <p className="text-center text-sm text-muted-foreground">
              Upload documents or connect external sources to get started
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {availableSources.length === 0 ? (
                <Button variant="outline" asChild>
                  <Link href={`/workspaces/${workspaceId}/sources`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Source
                  </Link>
                </Button>
              ) : (
                <AddFromSourceDialog
                  workspaceId={workspaceId}
                  sources={sources}
                  trigger={
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Add from Source
                    </Button>
                  }
                />
              )}
              <UploadDocumentDialog
                workspaceId={workspaceId}
                trigger={
                  <Button>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload documents
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search sources..."
          className="pl-10 w-full"
        />
      </div>
 
      {displayDocuments.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-4">
            {displayDocuments.map((doc: any) => {
                  const fileExtension = getFileExtension(doc)
                  return (
                  <Card key={doc.id} className="shadow hover:shadow-md transition-shadow">
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
                      <CardTitle className="text-base truncate">{doc.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        {doc.status === "archived" && (
                          <span className="text-xs text-muted-foreground">Archived</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatSourceType(doc.sources?.type)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.id && (
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2" asChild>
                        <Link
                          href={`/workspaces/${workspaceId}/documents/${doc.id}`}
                        >
                          View document
                        </Link>
                      </Button>
                    )}
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
                              Download
                            </a>
                          </DropdownMenuItem>
                        )}
                        {doc.status === "archived" ? (
                          <DropdownMenuItem
                            onClick={() => handleArchive(doc.id, false)}
                            className="cursor-pointer"
                          >
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            Unarchive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleArchive(doc.id, true)}
                            className="cursor-pointer"
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setDeletingDocId(doc.id)
                            setNeedsConfirmation(false)
                          }}
                          className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                  {doc.created_at && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Uploaded {new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
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
            <h3 className="mb-2 text-lg font-semibold">No documents found</h3>
            <p className="text-center text-sm text-muted-foreground">
              No documents match "{searchQuery}". Try different keywords.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingDocId !== null} onOpenChange={handleDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this document? The document will be removed from storage and will no longer appear in your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsConfirmation && (
            <p className="text-sm text-destructive font-medium">
              This action cannot be undone.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {needsConfirmation ? (
              <AlertDialogAction
                onClick={() => deletingDocId && handleDelete(deletingDocId)}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Confirm?
              </AlertDialogAction>
            ) : (
              <Button
                onClick={() => deletingDocId && handleDelete(deletingDocId)}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
