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
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

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
  canManage?: boolean
  hideHeading?: boolean
}

type DraftWorkspaceNote = {
  id: string
  isDraft: true
}

async function requestWithCsrf<T = unknown>(
  input: RequestInfo,
  init: RequestInit,
  defaultError: string,
  csrfError?: string,
): Promise<T> {
  const csrfToken = await fetchCsrfToken()
  if (!csrfToken) {
    throw new Error(csrfError ?? defaultError ?? "Could not verify your session. Refresh and try again.")
  }

  const headers = new Headers(init.headers ?? undefined)
  headers.set("x-csrf-token", csrfToken)

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  })

  const responseBody = await response.text()
  let payload: any = null

  if (responseBody) {
    try {
      payload = JSON.parse(responseBody)
    } catch {
      payload = { error: responseBody }
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || defaultError)
  }

  return payload as T
}

export function WorkspaceNotesPanel({
  workspaceId,
  currentUserId,
  initialNotes,
  canManage = true,
  hideHeading = false,
}: WorkspaceNotesPanelProps) {
  const [notes, setNotes] = useState<WorkspaceNote[]>(initialNotes)
  const [draftNote, setDraftNote] = useState<DraftWorkspaceNote | null>(null)
  const [draftContent, setDraftContent] = useState("")
  const [draftIncludeInAiContext, setDraftIncludeInAiContext] = useState(true)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const { t } = useI18n()
  const csrfErrorMessage = t("workspace.sections.notes.errors.csrf")

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
      setEditError(t("workspace.sections.notes.errors.emptyContent"))
      return
    }

    setIsSavingEdit(true)
    setEditError(null)
    setGeneralError(null)

    try {
      const payload = await requestWithCsrf<{ data: WorkspaceNote }>(
        `/api/workspaces/${workspaceId}/notes/${editingNoteId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent, includeInAiContext: noteToUpdate.include_in_ai_context }),
        },
        t("workspace.sections.notes.errors.update"),
        csrfErrorMessage,
      )

      setNotes((prev) => prev.map((note) => (note.id === editingNoteId ? payload.data : note)))
      setEditingNoteId(null)
      setEditContent("")
    } catch (err) {
      const fallback = t("workspace.sections.notes.errors.update")
      setEditError(err instanceof Error ? err.message : fallback)
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
      setDraftError(t("workspace.sections.notes.errors.emptyContent"))
      return
    }

    setIsSavingDraft(true)
    setDraftError(null)

    try {
      const payload = await requestWithCsrf<{ data: WorkspaceNote }>(
        `/api/workspaces/${workspaceId}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draftContent, includeInAiContext: draftIncludeInAiContext }),
        },
        t("workspace.sections.notes.errors.create"),
        csrfErrorMessage,
      )

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
      const fallback = t("workspace.sections.notes.errors.create")
      setDraftError(err instanceof Error ? err.message : fallback)
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId)
    setGeneralError(null)

    try {
      await requestWithCsrf(
        `/api/workspaces/${workspaceId}/notes/${noteId}`,
        { method: "DELETE" },
        t("workspace.sections.notes.errors.delete"),
        csrfErrorMessage,
      )

      setNotes((prev) => prev.filter((note) => note.id !== noteId))
      emitWorkspaceContextUpdate({
        type: "note",
        action: "deleted",
        noteId,
      })
    } catch (err) {
      const fallback = t("workspace.sections.notes.errors.delete")
      setGeneralError(err instanceof Error ? err.message : fallback)
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
      const payload = await requestWithCsrf<{ data: WorkspaceNote }>(
        `/api/workspaces/${workspaceId}/notes/${noteId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeInAiContext: nextValue }),
        },
        t("workspace.sections.notes.errors.update"),
        csrfErrorMessage,
      )

      setNotes((prev) => prev.map((note) => (note.id === noteId ? payload.data : note)))
      emitWorkspaceContextUpdate({
        type: "note",
        action: "updated",
        noteId,
        includeInAiContext: payload?.data?.include_in_ai_context,
      })
    } catch (err) {
      const fallback = t("workspace.sections.notes.errors.update")
      setGeneralError(err instanceof Error ? err.message : fallback)
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
        {!hideHeading && (
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{t("workspace.sections.notes.title")}</h3>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? t("workspace.sections.notes.descriptionManage")
                : t("workspace.sections.notes.descriptionView")}
            </p>
          </div>
        )}
        {canManage && (
          <Button onClick={handleAddDraft} disabled={!!draftNote} className={hideHeading ? "ml-auto" : undefined}>
            <Plus className="mr-2 h-4 w-4" />
            {t("workspace.sections.notes.addButton")}
          </Button>
        )}
      </div>

      {generalError && <p className="text-sm text-destructive">{generalError}</p>}

      {items.length === 0 ? (
        <Card className="shadow">
          <CardContent className="py-6 text-sm text-muted-foreground">
            {canManage
              ? t("workspace.sections.notes.emptyManage")
              : t("workspace.sections.notes.emptyView")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            if ("isDraft" in item && item.isDraft) {
              // Viewers cannot create notes, so skip rendering draft cards
              if (!canManage) return null
              
              return (
                <Card key={item.id} className="flex h-full flex-col shadow">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium text-foreground">
                      {t("workspace.sections.notes.draft.title")}
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button variant="outline" onClick={handleCancelDraft} disabled={isSavingDraft}>
                        {t("common.actions.cancel")}
                      </Button>
                      <Button onClick={handleSaveDraft} disabled={isSavingDraft}>
                        {isSavingDraft ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("workspace.sections.notes.draft.saving")}
                          </>
                        ) : (
                          t("workspace.sections.notes.draft.save")
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="space-y-3 pt-4">
                    <Textarea
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                      placeholder={t("workspace.sections.notes.draft.placeholder")}
                      rows={6}
                      autoFocus
                    />
                    {draftError && <p className="text-sm text-destructive">{draftError}</p>}
                  </CardContent>
                  <CardFooter className="mt-auto justify-between gap-2 border-t px-4 py-0.5 pt-0">
                    <p className="text-sm leading-none text-muted-foreground">
                      {draftIncludeInAiContext
                        ? t("workspace.sections.notes.status.included")
                        : t("workspace.sections.notes.status.excluded")}
                    </p>
                    <Switch
                      checked={draftIncludeInAiContext}
                      onCheckedChange={(checked) => setDraftIncludeInAiContext(checked)}
                      aria-label={t("workspace.sections.notes.draft.toggleLabel")}
                    />
                  </CardFooter>
                </Card>
              )
            }

            const note = item as WorkspaceNote
            const isOwner = note.created_by === currentUserId
            const authorName =
              note.author?.full_name || note.author?.email || t("workspace.sections.notes.status.memberFallback")
            const toggleLabel = note.include_in_ai_context
              ? t("workspace.sections.notes.status.removeFromContext")
              : t("workspace.sections.notes.status.addToContext")
            const statusLabel = note.include_in_ai_context
              ? t("workspace.sections.notes.status.included")
              : t("workspace.sections.notes.status.excluded")
            const isEditing = editingNoteId === note.id

            return (
              <Card key={note.id} className="flex h-full flex-col shadow">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{authorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleString()}
                      {note.updated_at !== note.created_at && (
                        <>
                          {" · "}
                          {t("workspace.sections.notes.status.updated")}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOwner &&
                      (isEditing ? (
                        <>
                          <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSavingEdit}>
                            {t("common.actions.cancel")}
                          </Button>
                          <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
                            {isSavingEdit ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("workspace.sections.notes.edit.saving")}
                              </>
                            ) : (
                              t("common.actions.save")
                            )}
                          </Button>
                        </>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <span className="inline-flex">
                              <IconTooltip label={t("workspace.sections.notes.menu.label")}>
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
                                  <span className="sr-only">{t("workspace.sections.notes.menu.label")}</span>
                                </Button>
                              </IconTooltip>
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault()
                                handleStartEdit(note)
                              }}
                            >
                              <PenSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                              {t("workspace.sections.notes.menu.edit")}
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
                                {t("workspace.sections.notes.menu.delete")}
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
                    {updatingId === note.id ? ` · ${t("workspace.sections.notes.status.updating")}` : ""}
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
