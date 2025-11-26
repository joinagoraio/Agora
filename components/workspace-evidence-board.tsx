"use client"

import { useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch"
import { Loader2, Trash2, MessageCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { useI18n } from "@/lib/i18n/use-i18n"

type EvidencePayload = {
  type?: string
  question?: string
  answer?: string
  confidence?: "low" | "medium" | "high"
  citations?: Array<{
    title?: string
    url?: string
    page?: number
    docId?: string
    layer?: string
  }>
  saved_at?: string
  saved_from_chat?: boolean
  conversation_id?: string
  conversation_title?: string}

type WorkspaceEvidenceItem = {
  id: string
  classification: "public" | "internal" | "confidential" | null
  created_at: string
  include_in_ai_context?: boolean
  created_by?: {
    id: string
    full_name?: string
    email?: string
  } | null
  payload: EvidencePayload
}

type WorkspaceComment = {
  id: string
  workspace_item_id: string
  content: string
  created_at: string
  created_by: string
  author?: {
    id: string
    full_name?: string | null
    email?: string | null
  } | null
}

interface WorkspaceEvidenceBoardProps {
  workspaceId: string
  currentUserId: string
  initialItems: WorkspaceEvidenceItem[]
  initialComments?: Record<string, WorkspaceComment[]>
  parentSpaces?: Array<{
    id: string
    name: string
    space_type?: string | null
  }>
}

const CSRF_ERROR_MESSAGE = "Could not verify your session. Refresh and try again."

async function requestWithCsrf<T = unknown>(
  input: RequestInfo,
  init: RequestInit,
  defaultError: string,
): Promise<T> {
  const csrfToken = await fetchCsrfToken()
  if (!csrfToken) {
    throw new Error(CSRF_ERROR_MESSAGE)
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

const confidenceVariants: Record<NonNullable<EvidencePayload["confidence"]>, "default" | "secondary" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
}

const classificationLabels: Record<NonNullable<WorkspaceEvidenceItem["classification"]>, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
}

interface EvidenceCardProps {
  item: WorkspaceEvidenceItem
  workspaceId: string
  currentUserId: string
  initialComments: WorkspaceComment[]
  parentSpaces: NonNullable<WorkspaceEvidenceBoardProps["parentSpaces"]>
}

function EvidenceCard({ item, workspaceId, currentUserId, initialComments, parentSpaces }: EvidenceCardProps) {
  const [comments, setComments] = useState<WorkspaceComment[]>(initialComments)
  const [draft, setDraft] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedSpaceId, setSelectedSpaceId] = useState(parentSpaces[0]?.id ?? "")
  const [selectedClassification, setSelectedClassification] = useState<"public" | "internal" | "confidential">(
    (item.classification as "public" | "internal" | "confidential" | null) ?? "public",
  )
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null)
  const [includeInAiContext, setIncludeInAiContext] = useState(item.include_in_ai_context ?? false)
  const [isUpdatingAiContext, setIsUpdatingAiContext] = useState(false)

  const hasCitations = (item.payload?.citations?.length ?? 0) > 0
  const authorLabel =
    (item.created_by as any)?.full_name || (item.created_by as any)?.email || (item.created_by as any)?.id
  const isOwner = (item.created_by as any)?.id === currentUserId

  const handleToggleIncludeInAiContext = async (checked: boolean) => {
    setIsUpdatingAiContext(true)
    setIncludeInAiContext(checked)

    try {
      await requestWithCsrf(
        `/api/workspaces/${workspaceId}/items/${item.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeInAiContext: checked }),
        },
        "Unable to update evidence.",
      )

      // Dispatch event to notify chat interface
      window.dispatchEvent(
        new CustomEvent("workspaceContextUpdated", {
          detail: { workspaceId, type: "evidence", action: "updated" },
        }),
      )
    } catch (err) {
      setIncludeInAiContext(!checked) // Revert on error
      console.error("Failed to update evidence AI context flag:", err)
    } finally {
      setIsUpdatingAiContext(false)
    }
  }

  const handleCreateComment = async () => {
    if (!draft.trim()) {
      setError("Write a comment before submitting.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = await requestWithCsrf<{ data: WorkspaceComment }>(
        `/api/workspaces/${workspaceId}/items/${item.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        },
        "Unable to add comment.",
      )

      setComments((prev) => [payload.data, ...prev])
      setDraft("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add comment.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    setDeletingId(commentId)
    setError(null)

    try {
      await requestWithCsrf(
        `/api/workspaces/${workspaceId}/items/${item.id}/comments/${commentId}`,
        {
          method: "DELETE",
        },
        "Unable to delete comment.",
      )

      setComments((prev) => prev.filter((comment) => comment.id !== commentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete comment.")
    } finally {
      setDeletingId(null)
    }
  }

  const handlePublish = async () => {
    if (!selectedSpaceId) {
      setPublishError("Select a parent space")
      return
    }

    setIsPublishing(true)
    setPublishError(null)
    setPublishSuccess(null)

    try {
      await requestWithCsrf(
        `/api/workspaces/${workspaceId}/items/${item.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spaceId: selectedSpaceId,
            classification: selectedClassification,
          }),
        },
        "Unable to publish item.",
      )

      const targetSpace = parentSpaces.find((space) => space.id === selectedSpaceId)
      setPublishSuccess(
        targetSpace ? `Published to ${targetSpace.name}` : "Published successfully",
      )
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Unable to publish item.")
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <AccordionItem value={item.id} className="border rounded-lg mb-4 last:mb-0 last:border-b shadow">
      <AccordionTrigger className="hover:no-underline px-4">
        <div className="flex flex-wrap items-center gap-2 text-left flex-1">
          <span className="text-sm font-semibold flex-shrink-0">{item.payload?.question ?? "Saved evidence"}</span>
          {item.payload?.confidence && (
            <Badge variant={confidenceVariants[item.payload.confidence] ?? "secondary"} className="flex-shrink-0">
              {item.payload.confidence} confidence
            </Badge>
          )}
          {item.classification && (
            <Badge variant="outline" className="flex-shrink-0">
              {classificationLabels[item.classification] ?? item.classification}
            </Badge>
          )}
          <Badge 
            variant="secondary" 
            className="flex-shrink-0 text-xs font-normal bg-muted/50 text-muted-foreground"
          >
            {includeInAiContext ? "AI Context" : "Not in AI Context"}
          </Badge>
          {item.payload?.saved_from_chat && (
            <Badge variant="secondary" className="flex-shrink-0">
              <MessageCircle className="mr-1 h-3 w-3" />
              {item.payload?.conversation_title ? `From: ${item.payload.conversation_title}` : "Saved from chat"}
            </Badge>
          )}
          {item.created_at && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              Saved on {new Date(item.created_at).toLocaleString()}
            </span>
          )}
          {authorLabel && (
            <span className="text-xs text-muted-foreground flex-shrink-0">by {authorLabel}</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 px-4 pb-4">
        {item.payload?.answer && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{item.payload.answer}</ReactMarkdown>
          </div>
        )}
        {hasCitations && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Citations</h4>
              <ul className="space-y-2 text-sm">
                {item.payload?.citations?.map((citation, index) => (
                  <li key={citation.url ?? citation.docId ?? index} className="space-y-1">
                    <div className="font-medium">{citation.title ?? "Referenced source"}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {citation.layer && <Badge variant="outline">{citation.layer}</Badge>}
                      {citation.page !== undefined && citation.page !== null && <span>Page {citation.page}</span>}
                      {citation.url && (
                        <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                          View source
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <Separator />
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {includeInAiContext ? "Included in AI context" : "Excluded from AI context"}
            {isUpdatingAiContext && " · Updating..."}
          </div>
          {isOwner ? (
            <Switch
              checked={includeInAiContext}
              onCheckedChange={handleToggleIncludeInAiContext}
              disabled={isUpdatingAiContext}
              aria-label={includeInAiContext ? "Remove from AI context" : "Add to AI context"}
            />
          ) : (
            <Switch checked={includeInAiContext} disabled aria-hidden="true" />
          )}
        </div>
        {parentSpaces.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
              <div className="text-sm font-medium text-foreground">Publish to parent space</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`${item.id}-space`}>Parent space</Label>
                  <Select value={selectedSpaceId} onValueChange={setSelectedSpaceId}>
                    <SelectTrigger id={`${item.id}-space`}>
                      <SelectValue placeholder="Select space" />
                    </SelectTrigger>
                    <SelectContent>
                      {parentSpaces.map((space) => (
                        <SelectItem key={space.id} value={space.id}>
                          {space.name}
                          {space.space_type ? ` · ${space.space_type}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${item.id}-classification`}>Classification</Label>
                  <Select
                    value={selectedClassification}
                    onValueChange={(value) => setSelectedClassification(value as "public" | "internal" | "confidential")}
                  >
                    <SelectTrigger id={`${item.id}-classification`}>
                      <SelectValue placeholder="Select classification" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="confidential">Confidential</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handlePublish} disabled={isPublishing}>
                  {isPublishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    "Publish"
                  )}
                </Button>
                {publishError && <p className="text-sm text-destructive">{publishError}</p>}
                {publishSuccess && <p className="text-sm text-emerald-600">{publishSuccess}</p>}
              </div>
            </div>
          </>
        )}
        <Separator />
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Leave a comment for your team..."
            rows={3}
          />
          <div className="flex items-center justify-between gap-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleCreateComment} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                "Add comment"
              )}
            </Button>
          </div>
        </div>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to share feedback.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => {
              const isOwner = comment.created_by === currentUserId
              const authorName = comment.author?.full_name || comment.author?.email || "Member"

              return (
                <li key={comment.id} className="rounded-lg border bg-card/50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">{authorName}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleString()}
                      </div>
                    </div>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={deletingId === comment.id}
                      >
                        {deletingId === comment.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="sr-only">Delete comment</span>
                      </Button>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{comment.content}</p>
                </li>
              )
            })}
          </ul>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

export function WorkspaceEvidenceBoard({
  workspaceId,
  currentUserId,
  initialItems,
  initialComments = {},
  parentSpaces = [],
}: WorkspaceEvidenceBoardProps) {
  const { t } = useI18n()
  const evidenceItems = useMemo(
    () => initialItems.filter((item) => item.payload?.type === "evidence"),
    [initialItems],
  )

  if (evidenceItems.length === 0) {
    return (
      <Card className="shadow">
        <CardHeader>
          <CardTitle>{t("workspace.sections.evidence.emptyTitle")}</CardTitle>
          <CardDescription>{t("workspace.sections.evidence.emptyDescription")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {evidenceItems.map((item) => (
        <EvidenceCard
          key={item.id}
          item={item}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          initialComments={initialComments[item.id] ?? []}
          parentSpaces={parentSpaces}
        />
      ))}
    </Accordion>
  )
}
