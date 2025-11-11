"use client"

import type React from "react"
import { useState, useMemo } from "react"
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
import { FileText, ExternalLink, Calendar, Search, MoreVertical, Archive, Trash2, ArchiveRestore } from "lucide-react"
import { deleteDocument, archiveDocument } from "@/lib/actions/document"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface DocumentsListProps {
  workspaceId: string
  initialDocuments: any[]
}

export function DocumentsList({ workspaceId, initialDocuments }: DocumentsListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [archivingDocId, setArchivingDocId] = useState<string | null>(null)
  const router = useRouter()

  const handleDelete = async (documentId: string) => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    const result = await deleteDocument(documentId, workspaceId)
    if (result.error) {
      alert(`Failed to delete document: ${result.error}`)
    } else {
      setDeletingDocId(null)
      setNeedsConfirmation(false)
      router.refresh()
    }
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      setDeletingDocId(null)
      setNeedsConfirmation(false)
    }
  }

  const handleArchive = async (documentId: string, archive: boolean) => {
    const result = await archiveDocument(documentId, workspaceId, archive)
    if (result.error) {
      alert(`Failed to ${archive ? "archive" : "unarchive"} document: ${result.error}`)
    } else {
      setArchivingDocId(null)
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="pl-10"
            disabled
          />
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
            <p className="text-center text-sm text-muted-foreground">
              Upload documents or connect external sources to get started
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => {
            const newValue = e.target.value
            setSearchQuery(newValue)
          }}
          placeholder="Search documents..."
          className="pl-10"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {searchQuery.trim() ? (
            <>
              Showing {displayDocuments.length} of {initialDocuments.length} document
              {initialDocuments.length !== 1 ? "s" : ""}
              {searchQuery.trim() && ` matching "${searchQuery}"`}
            </>
          ) : (
            <>
              {displayDocuments.length} document{displayDocuments.length !== 1 ? "s" : ""} in this workspace
            </>
          )}
        </p>
      </div>

      {displayDocuments.length > 0 ? (
        <div className="grid gap-4">
          {displayDocuments.map((doc: any) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{doc.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <span>{doc.sources?.name || "Unknown source"}</span>
                        {doc.id && (
                          <Link
                            href={`/workspaces/${workspaceId}/documents/${doc.id}`}
                            className="inline-flex items-center gap-1 hover:underline text-primary"
                          >
                            View document
                            <FileText className="h-3 w-3" />
                          </Link>
                        )}
                        {doc.url && (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline text-primary"
                          >
                            Download
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.status === "archived" && (
                      <Badge variant="outline" className="shrink-0">
                        Archived
                      </Badge>
                    )}
                    <Badge variant="secondary" className="shrink-0">
                      {doc.sources?.type === "direct_upload" ? "Uploaded" : doc.sources?.type || "Unknown"}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                          className="cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {doc.content && (
                  <p className="line-clamp-2 text-sm text-muted-foreground mb-3">
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
          ))}
        </div>
      ) : (
        <Card>
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
            <AlertDialogCancel onClick={() => setNeedsConfirmation(false)}>Cancel</AlertDialogCancel>
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
