"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Loader2, Trash2 } from "lucide-react"

type WorkspaceNote = {
  id: string
  workspace_id: string
  content: string
  created_at: string
  updated_at: string
  created_by: string
  author?: {
    id: string
    full_name?: string | null
    email?: string | null
  } | null
}

interface WorkspaceNotesPanelProps {
  workspaceId: string
  currentUserId: string
  initialNotes: WorkspaceNote[]
}

export function WorkspaceNotesPanel({ workspaceId, currentUserId, initialNotes }: WorkspaceNotesPanelProps) {
  const [notes, setNotes] = useState<WorkspaceNote[]>(initialNotes)
  const [content, setContent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!content.trim()) {
      setError("Write a note before saving.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save note.")
      }

      setNotes((prev) => [payload.data, ...prev])
      setContent("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save note.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (noteId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes/${noteId}`, {
        method: "DELETE",
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete note.")
      }

      setNotes((prev) => prev.filter((note) => note.id !== noteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete note.")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create a workspace note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Capture key decisions, next steps, or handover notes for the team."
            rows={4}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button onClick={handleCreate} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save note"
            )}
          </Button>
        </CardFooter>
      </Card>

      {notes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No notes yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Capture insights, pending tasks, or decisions for this workspace. Notes are visible to workspace members.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => {
            const isOwner = note.created_by === currentUserId
            const authorName = note.author?.full_name || note.author?.email || "Member"

            return (
              <Card key={note.id}>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{authorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleString()}
                      {note.updated_at !== note.created_at && " · Updated"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Workspace note</Badge>
                    {isOwner && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(note.id)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete note</span>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{note.content}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}


