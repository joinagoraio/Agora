"use client"

import { useState } from "react"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SpaceUploadDocumentDialog } from "@/components/space-upload-document-dialog"
import { Download, FileText, Loader2, Trash2 } from "lucide-react"

type SpaceDocumentItem = {
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
  initialDocuments: SpaceDocumentItem[]
}

export function SpaceDocumentsPanel({ spaceId, initialDocuments }: SpaceDocumentsPanelProps) {
  const [documents, setDocuments] = useState<SpaceDocumentItem[]>(initialDocuments)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleUploaded = (item: SpaceDocumentItem) => {
    setDocuments((prev) => [item, ...prev])
  }

  const handleDelete = async (itemId: string) => {
    setError(null)
    setIsDeleting(itemId)

    const response = await fetch(`/api/spaces/${spaceId}/items/${itemId}`, { method: "DELETE" })
    const payload = await response.json()

    if (!response.ok) {
      setError(payload.error || "Failed to delete document.")
      setIsDeleting(null)
      return
    }

    setDocuments((prev) => prev.filter((doc) => doc.id !== itemId))
    setIsDeleting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Scope documents</h3>
          <p className="text-sm text-muted-foreground">
            Upload strategic plans, legislation, or research that define the scope. Public documents are inherited by every workspace.
          </p>
        </div>
        <SpaceUploadDocumentDialog
          spaceId={spaceId}
          onUploaded={handleUploaded}
          trigger={
            <Button>
              Upload document
            </Button>
          }
        />
      </div>

      {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {documents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <div>
              <h4 className="text-base font-semibold text-foreground">No scope documents yet</h4>
              <p className="text-sm text-muted-foreground">
                Upload policies, directives, or briefing notes so every workspace starts with the same foundation.
              </p>
            </div>
            <SpaceUploadDocumentDialog
              spaceId={spaceId}
              onUploaded={handleUploaded}
              trigger={
                <Button variant="outline">
                  Upload a document
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.map((doc) => {
            const docTitle = doc.payload?.title || doc.payload?.file_name || "Untitled document"

            return (
              <Card key={doc.id} className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold">{docTitle}</CardTitle>
                    {doc.classification && <Badge variant="outline">{doc.classification}</Badge>}
                  </div>
                  <CardDescription>
                    Uploaded {new Date(doc.created_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {doc.payload?.summary ? (
                    <p className="text-sm text-muted-foreground line-clamp-5 whitespace-pre-wrap">{doc.payload.summary}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No summary available yet.</p>
                  )}
                  <Separator />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {doc.payload?.file_name && <Badge variant="secondary">{doc.payload.file_name}</Badge>}
                    {doc.payload?.mime_type && <span>{doc.payload.mime_type}</span>}
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between gap-3">
                  {doc.source_url ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={doc.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Download
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">No file URL</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(doc.id)}
                    disabled={isDeleting === doc.id}
                  >
                    {isDeleting === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remove
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}


