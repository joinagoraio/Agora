"use client"

import { useMemo, useState } from "react"
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
}

function extractMetadataValue<T>(metadata: any, key: string, fallback: T | null = null): T | null {
  if (!metadata || typeof metadata !== "object") {
    return fallback
  }
  return (metadata[key] as T | undefined) ?? fallback
}

export function MyDocumentsList({ workspaceId, initialDocuments }: MyDocumentsListProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [documentToDelete, setDocumentToDelete] = useState<any | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">No documents yet</h3>
          <p className="text-sm text-muted-foreground">
            Create a document to capture your AI-assisted analysis and share it with your team.
          </p>
        </div>
        <CreateWorkspaceDocumentDialog
          workspaceId={workspaceId}
          trigger={
            <Button>
              <Edit3 className="mr-2 h-4 w-4" />
              Create your first document
            </Button>
          }
        />
      </CardContent>
    </Card>
  )

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">My Documents</h2>
          <p className="text-sm text-muted-foreground">
            Draft new documents with AI support and keep editable versions tied to this workspace.
          </p>
        </div>
        <CreateWorkspaceDocumentDialog workspaceId={workspaceId} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search my documents..."
          className="pl-10"
        />
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
              <Card key={doc.id} className="transition-all hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
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
                </CardHeader>
                <CardContent className="space-y-3">
                  {instructions && (
                    <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Instructions:</span> {instructions}
                    </div>
                  )}
                  {doc.content && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{doc.content.substring(0, 320)}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/workspaces/${workspaceId}/my-documents/${doc.id}`}>
                        <Edit3 className="mr-2 h-4 w-4" />
                        Continue editing
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
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

