"use client"

import { useCallback, useState } from "react"
import { Plus, Loader2, MoreVertical, PenSquare, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"

export type WorkspaceNote = {
  id: string
  workspace_id: string
  content: string
  include_in_ai_context: boolean
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

type DraftWorkspaceNote = {
  id: string
  isDraft: true
}

export function WorkspaceNotesPanel({ workspaceId, currentUserId, initialNotes }: WorkspaceNotesPanelProps) {
  const [notes, setNotes] = useState<WorkspaceNote[]>(initialNotes)
  const [draftNote, setDraftNote] = useState<DraftWorkspaceNote | null>(null)
  const [draftContent, setDraftContent] = useState("")
  const [draftIncludeInAiContext, setDraftIncludeInAiContext] = useState(true)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const handleAddDraft = () => {
    setGeneralError(null)
    setDraftError(null)

    if (draftNote) {
      return
    }

    setDraftNote({
      id: `draft-${Date.now()}`,
      isDraft: true,
    })
    setDraftContent("")
    setDraftIncludeInAiContext(true)
  }

  const handleStartEdit = (note: WorkspaceNote) => {
    setGeneralError(null)
    setEditError(null)
    setEditingNoteId(note.id)
    setEditContent(note.content)
  }

  const handleCancelEdit = () => {
    setEditingNoteId(null)
    setEditContent("")
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!editingNoteId) {
      return
    }

    const noteToUpdate = notes.find((note) => note.id === editingNoteId)

    if (!noteToUpdate) {
      return
    }

    if (!editContent.trim()) {
      setEditError("Write a note before saving.")
      return
    }

    setIsSavingEdit(true)
    setEditError(null)
    setGeneralError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes/${editingNoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent, includeInAiContext: noteToUpdate.include_in_ai_context }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update note.")
      }

      setNotes((prev) => prev.map((note) => (note.id === editingNoteId ? payload.data : note)))
      setEditingNoteId(null)
      setEditContent("")
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Unable to update note.")
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleCancelDraft = () => {
    setDraftNote(null)
    setDraftContent("")
    setDraftIncludeInAiContext(true)
    setDraftError(null)
  }

  const handleSaveDraft = async () => {
    if (!draftContent.trim()) {
      setDraftError("Write a note before saving.")
      return
    }

    setIsSavingDraft(true)
    setDraftError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draftContent, includeInAiContext: draftIncludeInAiContext }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save note.")
      }

      setNotes((prev) => [payload.data, ...prev])
      setDraftNote(null)
      setDraftContent("")
      setDraftIncludeInAiContext(true)
      emitWorkspaceContextUpdate({
        type: "note",
        action: "created",
        noteId: payload?.data?.id,
        includeInAiContext: payload?.data?.include_in_ai_context,
      })
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Unable to save note.")
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId)
    setGeneralError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes/${noteId}`, {
        method: "DELETE",
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Unable to delete note.")
      }

      setNotes((prev) => prev.filter((note) => note.id !== noteId))
      emitWorkspaceContextUpdate({
        type: "note",
        action: "deleted",
        noteId,
      })
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "Unable to delete note.")
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleInclude = async (noteId: string, nextValue: boolean) => {
    const previousNote = notes.find((note) => note.id === noteId)

    if (!previousNote || updatingId === noteId || previousNote.include_in_ai_context === nextValue) {
      return
    }

    setUpdatingId(noteId)
    setGeneralError(null)
    setNotes((prev) =>
      prev.map((note) => (note.id === noteId ? { ...note, include_in_ai_context: nextValue } : note)),
    )

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInAiContext: nextValue }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update note.")
      }

      setNotes((prev) => prev.map((note) => (note.id === noteId ? payload.data : note)))
      emitWorkspaceContextUpdate({
        type: "note",
        action: "updated",
        noteId,
        includeInAiContext: payload?.data?.include_in_ai_context,
      })
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "Unable to update note.")
      if (previousNote) {
        setNotes((prev) =>
          prev.map((note) => (note.id === noteId ? { ...note, include_in_ai_context: previousNote.include_in_ai_context } : note)),
        )
      }
    } finally {
      setUpdatingId(null)
    }
  }

  const items: Array<WorkspaceNote | DraftWorkspaceNote> = draftNote ? [draftNote, ...notes] : notes

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Workspace Notes</h3>
          <p className="text-sm text-muted-foreground">
            Capture research logs, to-do lists, and team context that evolves over time.
          </p>
        </div>
        <Button onClick={handleAddDraft} disabled={!!draftNote}>
          <Plus className="mr-2 h-4 w-4" />
          Add Note
        </Button>
      </div>

      {generalError && <p className="text-sm text-destructive">{generalError}</p>}

      {items.length === 0 ? (
        <Card className="shadow">
          <CardContent className="py-6 text-sm text-muted-foreground">
            No notes yet. Capture insights, pending tasks, or decisions for this workspace.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            if ("isDraft" in item && item.isDraft) {
              return (
                <Card key={item.id} className="flex h-full flex-col shadow">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium text-foreground">New note</div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button variant="outline" onClick={handleCancelDraft} disabled={isSavingDraft}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveDraft} disabled={isSavingDraft}>
                        {isSavingDraft ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Note"
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="space-y-3 pt-4">
                    <Textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      placeholder="Capture key decisions, next steps, or handover notes for the team."
                      rows={6}
                      autoFocus
                    />
                    {draftError && <p className="text-sm text-destructive">{draftError}</p>}
                  </CardContent>
                  <CardFooter className="mt-auto justify-between gap-2 border-t px-4 py-0.5 pt-0">
                    <p className="text-sm leading-none text-muted-foreground">
                      {draftIncludeInAiContext ? "Included in AI context" : "Excluded from AI context"}
                    </p>
                    <Switch
                      checked={draftIncludeInAiContext}
                      onCheckedChange={(checked) => setDraftIncludeInAiContext(checked)}
                      aria-label="Toggle AI context inclusion for new note"
                    />
                  </CardFooter>
                </Card>
              )
            }

            const note = item as WorkspaceNote
            const isOwner = note.created_by === currentUserId
            const authorName = note.author?.full_name || note.author?.email || "Member"
            const toggleLabel = note.include_in_ai_context ? "Remove from AI context" : "Add to AI context"
            const statusLabel = note.include_in_ai_context ? "Included in AI context" : "Excluded from AI context"
            const isEditing = editingNoteId === note.id

            return (
              <Card key={note.id} className="flex h-full flex-col shadow">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{authorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleString()}
                      {note.updated_at !== note.created_at && " · Updated"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner &&
                      (isEditing ? (
                        <>
                          <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSavingEdit}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
                            {isSavingEdit ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              disabled={deletingId === note.id}
                            >
                              {deletingId === note.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                              <span className="sr-only">Open note menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault()
                                handleStartEdit(note)
                              }}
                            >
                              <PenSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                              Edit note
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="group cursor-pointer focus:bg-destructive/10 focus:text-destructive"
                              disabled={deletingId === note.id}
                              onSelect={(event) => {
                                event.preventDefault()
                                if (deletingId !== note.id) {
                                  handleDelete(note.id)
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-destructive group-focus:text-destructive" />
                              <span className="transition-colors group-hover:text-destructive group-focus:text-destructive">
                                Delete note
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ))}
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="flex-1 pt-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={6} />
                      {editError && <p className="text-sm text-destructive">{editError}</p>}
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{note.content}</p>
                  )}
                </CardContent>
                <CardFooter className="mt-auto justify-between gap-2 border-t px-4 py-0.5 pt-0">
                  <div className="text-sm leading-none text-muted-foreground">
                    {statusLabel}
                    {updatingId === note.id ? " · Updating..." : ""}
                  </div>
                  {isOwner ? (
                    <Switch
                      checked={note.include_in_ai_context}
                      onCheckedChange={(checked) => handleToggleInclude(note.id, checked)}
                      disabled={updatingId === note.id || isEditing || isSavingEdit}
                      aria-label={toggleLabel}
                    />
                  ) : (
                    <Switch checked={note.include_in_ai_context} disabled aria-hidden="true" />
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
