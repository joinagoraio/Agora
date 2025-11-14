"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { CreateWorkspaceDocumentDialog } from "@/components/create-workspace-document-dialog"
import { deleteDocument } from "@/lib/actions/document"
import { Calendar, Edit3, FileText, MoreVertical, Search, Trash2 } from "lucide-react"

interface MyDocumentsListProps {
  workspaceId: string
  initialDocuments: Array<any>
  showHeader?: boolean
}

function extractMetadataValue<T>(metadata: any, key: string, fallback: T | null = null): T | null {
  if (!metadata || typeof metadata !== "object") {
    return fallback
  }
  return (metadata[key] as T | undefined) ?? fallback
}

export function MyDocumentsList({ workspaceId, initialDocuments, showHeader = true }: MyDocumentsListProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [documentToDelete, setDocumentToDelete] = useState<any | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const documents = useMemo(() => initialDocuments || [], [initialDocuments])

  const filteredDocuments = useMemo(() => {
    if (!searchQuery) {
      return documents
    }

    const query = searchQuery.toLowerCase().trim()
    return documents.filter((doc: any) => {
      const title = String(doc?.title || "").toLowerCase()
      const content = String(doc?.content || "").toLowerCase()
      const instructions = String(extractMetadataValue<string>(doc?.metadata, "instructions", "") || "").toLowerCase()

      return title.includes(query) || content.includes(query) || instructions.includes(query)
    })
  }, [documents, searchQuery])

  const handleDelete = async () => {
    if (!documentToDelete) return

    setIsDeleting(true)
    setDeleteError(null)

    const result = await deleteDocument(documentToDelete.id, workspaceId)

    if (result.error) {
      setDeleteError(result.error)
      setIsDeleting(false)
      return
    }

    emitWorkspaceContextUpdate({
      type: "document",
      action: "deleted",
      documentId: documentToDelete.id,
    })

    setIsDeleting(false)
    // Close dialog and refresh after animation completes
    setDocumentToDelete(null)
    setTimeout(() => {
      router.refresh()
    }, 200)
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      // Set state immediately to close dialog, cleanup happens after animation
      setDocumentToDelete(null)
      setDeleteError(null)
      // Force cleanup after a brief delay to ensure portal unmounts
      setTimeout(() => {
        document.body.style.pointerEvents = ""
        document.body.style.overflow = ""
      }, 0)
    }
  }

  const renderEmptyState = () => (
    <Card className="shadow">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">No documents yet</h3>
        <p className="text-center text-sm text-muted-foreground">
          Create a document to capture your AI-assisted analysis and share it with your team.
        </p>
        <CreateWorkspaceDocumentDialog
          workspaceId={workspaceId}
          trigger={
            <Button variant="outline">
              <Edit3 className="mr-2 h-4 w-4" />
              Create your first document
            </Button>
          }
        />
      </CardContent>
    </Card>
  )

  const isSearchDisabled = documents.length === 0

  const searchInput = (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search documents..."
        className="pl-10"
        disabled={isSearchDisabled}
      />
    </div>
  )

  return (
    <section className="space-y-6">
      {showHeader && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-xl font-semibold">My Documents</h2>
                <span className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
                  ({filteredDocuments.length})
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Draft new documents with AI support and keep editable versions tied to this workspace.
              </p>
            </div>
            <CreateWorkspaceDocumentDialog workspaceId={workspaceId} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {searchInput}
      </div>

      {filteredDocuments.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="grid gap-4">
          {filteredDocuments.map((doc: any) => {
            const lastEditedAt =
              extractMetadataValue<string>(doc.metadata, "lastEditedAt") || doc.updated_at || doc.created_at
            const instructions = extractMetadataValue<string>(doc.metadata, "instructions")

            return (
              <Link key={doc.id} href={`/workspaces/${workspaceId}/my-documents/${doc.id}`} className="block">
                <Card className="shadow transition-all hover:shadow-md cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base truncate">{doc.title || "Untitled document"}</CardTitle>
                          <Badge variant="secondary" className="shrink-0">
                            {doc.classification ? doc.classification.charAt(0).toUpperCase() + doc.classification.slice(1) : "Internal"}
                          </Badge>
                        </div>
                        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {lastEditedAt && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Last edited {new Date(lastEditedAt).toLocaleString()}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            Editable draft
                          </span>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.preventDefault()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/workspaces/${workspaceId}/my-documents/${doc.id}`}>
                                <Edit3 className="mr-2 h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDocumentToDelete(doc)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  {instructions && (
                    <CardContent>
                      <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Instructions:</span> {instructions}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <AlertDialog open={Boolean(documentToDelete)} onOpenChange={handleDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the document from the workspace. You can re-create it later, but the current content will be
              lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{deleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
