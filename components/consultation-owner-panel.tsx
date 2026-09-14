"use client"

import { useMemo, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addConsultationReply,
  applyConsultationClusterResolution,
  closeProgrammeConsultation,
  draftConsultationTopicSummary,
  openProgrammeConsultation,
  publishConsultationTopicSummary,
  reviewConsultationAppeal,
  runConsultationClusterJob,
  transitionConsultationComment,
  unclusterConsultationComment,
  type ConsultationQueue,
} from "@/lib/actions/consultation"
import type { ConsultationCommentStatus } from "@/lib/programme/consultation"
import { CONSULTATION_COMMENT_STATUSES } from "@/lib/programme/consultation"
import { notify } from "@/lib/notify"
import { useI18n } from "@/lib/i18n/use-i18n"

const STATUS_KEYS: Record<ConsultationCommentStatus, string> = {
  open: "consultationStatusOpen",
  in_discussion: "consultationStatusInDiscussion",
  accepted: "consultationStatusAccepted",
  accepted_with_modification: "consultationStatusAcceptedWithModification",
  rejected: "consultationStatusRejected",
  merged: "consultationStatusMerged",
  out_of_scope: "consultationStatusOutOfScope",
}

function isoDate(value?: string | null) {
  if (!value) return ""
  return value.slice(0, 10)
}

function toWindowIso(date: string, endOfDay: boolean) {
  return endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`
}

export function ConsultationOwnerPanel({
  workspaceId,
  publicationId,
  canAdminister,
  queue,
  onChanged,
}: {
  workspaceId: string
  publicationId: string | null
  canAdminister: boolean
  queue: ConsultationQueue
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 10)
  const inThirty = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [opensAt, setOpensAt] = useState(isoDate(queue.consultation?.opensAt) || today)
  const [closesAt, setClosesAt] = useState(isoDate(queue.consultation?.closesAt) || inThirty)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [nextStatus, setNextStatus] = useState<Record<string, ConsultationCommentStatus>>({})
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [summaryDraft, setSummaryDraft] = useState(queue.topicSummary?.bodyMarkdown || "")

  const statusLabel = (status: ConsultationCommentStatus) =>
    t(`workspace.programme.${STATUS_KEYS[status]}`)

  const repliesByComment = useMemo(() => {
    const grouped: Record<string, typeof queue.replies> = {}
    for (const reply of queue.replies) {
      grouped[reply.commentId] = [...(grouped[reply.commentId] || []), reply]
    }
    return grouped
  }, [queue.replies])

  const pendingAppeals = queue.appeals.filter((appeal) => !appeal.reviewedAt)

  return (
    <div className="space-y-4 rounded-md border p-3">
      <h3 className="text-sm font-medium">{t("workspace.programme.consultationTitle")}</h3>
      <p className="text-xs text-muted-foreground">
        {t("workspace.programme.consultationCounts", undefined, {
          unresolved: String(queue.unresolvedCount),
          window: queue.consultation?.window || "closed",
        })}
      </p>
      {queue.consultation ? (
        <p className="text-xs text-muted-foreground">
          {isoDate(queue.consultation.opensAt)} – {isoDate(queue.consultation.closesAt)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("workspace.programme.consultationOpens")}</span>
          <Input type="date" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t("workspace.programme.consultationCloses")}</span>
          <Input type="date" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} />
        </label>
        <Button
          variant="outline"
          disabled={pending || !canAdminister || !publicationId || queue.windowOpen}
          onClick={() =>
            startTransition(async () => {
              if (!publicationId) {
                notify(t("workspace.programme.consultationNeedPublish"), "warning")
                return
              }
              const result = await openProgrammeConsultation({
                workspaceId,
                publicationId,
                opensAt: toWindowIso(opensAt, false),
                closesAt: toWindowIso(closesAt, true),
              })
              if (result.error) {
                notify(result.error, "error")
                return
              }
              notify(t("workspace.programme.consultationOpened"))
              onChanged()
            })
          }
        >
          {t("workspace.programme.consultationOpenAction")}
        </Button>
        {queue.consultation && queue.consultation.window !== "closed" ? (
          <Button
            variant="outline"
            disabled={pending || !canAdminister}
            onClick={() =>
              startTransition(async () => {
                const result = await closeProgrammeConsultation(workspaceId, queue.consultation!.id)
                if (result.error) {
                  notify(result.error, "error")
                  return
                }
                notify(t("workspace.programme.consultationClosed"))
                onChanged()
              })
            }
          >
            {t("workspace.programme.consultationCloseAction")}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("workspace.programme.consultationClusterTitle")}</h4>
        <p className="text-sm text-muted-foreground">{t("workspace.programme.consultationClusterBody")}</p>
        <Button
          variant="outline"
          disabled={pending || !canAdminister || queue.comments.length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await runConsultationClusterJob(workspaceId)
              if (result.error) {
                notify(result.error, "error")
                return
              }
              notify(t("workspace.programme.consultationClustered"))
              onChanged()
            })
          }
        >
          {t("workspace.programme.consultationClusterAction")}
        </Button>
        {queue.clusterJob?.error ? <p className="text-xs text-destructive">{queue.clusterJob.error}</p> : null}
        {queue.clusters.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.consultationClusterEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {queue.clusters.map((cluster) => (
              <li key={cluster.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{cluster.label}</p>
                  <span className="text-xs text-muted-foreground">{t("workspace.programme.consultationAiDraft")}</span>
                  <span className="text-xs text-muted-foreground">{cluster.memberCount}</span>
                </div>
                {cluster.summary ? <p className="text-sm">{cluster.summary}</p> : null}
                {cluster.suggestedResponse ? (
                  <p className="text-sm text-muted-foreground">
                    {t("workspace.programme.consultationSuggested")}: {cluster.suggestedResponse}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-end gap-2">
                  <Select
                    value={nextStatus[cluster.id] || cluster.suggestedStatus || "in_discussion"}
                    onValueChange={(value) =>
                      setNextStatus((prev) => ({ ...prev, [cluster.id]: value as ConsultationCommentStatus }))
                    }
                  >
                    <SelectTrigger size="sm" className="min-w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONSULTATION_COMMENT_STATUSES.filter((status) => status !== "open").map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="min-w-56 flex-1"
                    value={reasons[cluster.id] || ""}
                    onChange={(event) => setReasons((prev) => ({ ...prev, [cluster.id]: event.target.value }))}
                    placeholder={t("workspace.programme.consultationReasonPlaceholder")}
                  />
                  <Button
                    size="sm"
                    disabled={pending || !canAdminister}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await applyConsultationClusterResolution({
                          workspaceId,
                          clusterId: cluster.id,
                          toStatus: nextStatus[cluster.id] || cluster.suggestedStatus || "in_discussion",
                          reason: reasons[cluster.id] || "",
                        })
                        if (result.error) {
                          notify(result.error, "error")
                          return
                        }
                        notify(t("workspace.programme.consultationClusterApplied"))
                        onChanged()
                      })
                    }
                  >
                    {t("workspace.programme.consultationClusterApply")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("workspace.programme.consultationTopicSummary")}</h4>
        <p className="text-xs text-muted-foreground">{t("workspace.programme.consultationTopicHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending || !canAdminister}
            onClick={() =>
              startTransition(async () => {
                const result = await draftConsultationTopicSummary(workspaceId)
                if (result.error || !result.data) {
                  notify(result.error || t("workspace.programme.consultationTopicDraft"), "error")
                  return
                }
                setSummaryDraft(result.data.bodyMarkdown)
                notify(t("workspace.programme.consultationTopicDraft"))
                onChanged()
              })
            }
          >
            {t("workspace.programme.consultationTopicDraft")}
          </Button>
          <Button
            disabled={pending || !canAdminister || !summaryDraft.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await publishConsultationTopicSummary({
                  workspaceId,
                  bodyMarkdown: summaryDraft,
                })
                if (result.error) {
                  notify(result.error, "error")
                  return
                }
                notify(t("workspace.programme.consultationTopicPublished"))
                onChanged()
              })
            }
          >
            {t("workspace.programme.consultationTopicPublish")}
          </Button>
        </div>
        <Textarea value={summaryDraft} onChange={(event) => setSummaryDraft(event.target.value)} rows={8} />
      </div>

      {pendingAppeals.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t("workspace.programme.consultationAppeals")}</h4>
          <ul className="space-y-3">
            {pendingAppeals.map((appeal) => (
              <li key={appeal.id} className="space-y-2 rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{appeal.authorName || appeal.authorId}</p>
                <p className="text-sm">{appeal.body}</p>
                <Input
                  value={reasons[appeal.id] || ""}
                  onChange={(event) => setReasons((prev) => ({ ...prev, [appeal.id]: event.target.value }))}
                  placeholder={t("workspace.programme.consultationReasonPlaceholder")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending || !canAdminister}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await reviewConsultationAppeal({
                          workspaceId,
                          appealId: appeal.id,
                          outcome: "reopen",
                          reason: reasons[appeal.id] || "",
                        })
                        if (result.error) {
                          notify(result.error, "error")
                          return
                        }
                        notify(t("workspace.programme.consultationAppealReviewed"))
                        onChanged()
                      })
                    }
                  >
                    {t("workspace.programme.consultationAppealReopen")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || !canAdminister}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await reviewConsultationAppeal({
                          workspaceId,
                          appealId: appeal.id,
                          outcome: "upheld",
                          reason: reasons[appeal.id] || "",
                        })
                        if (result.error) {
                          notify(result.error, "error")
                          return
                        }
                        notify(t("workspace.programme.consultationAppealReviewed"))
                        onChanged()
                      })
                    }
                  >
                    {t("workspace.programme.consultationAppealUphold")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("workspace.programme.consultationQueue")}</h4>
        {queue.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("workspace.programme.consultationEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {queue.comments.map((comment) => (
              <li key={comment.id} className="space-y-2 rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  {comment.authorName || comment.authorId} · {statusLabel(comment.status)}
                  {comment.clusterId
                    ? ` · ${queue.clusters.find((cluster) => cluster.id === comment.clusterId)?.label || ""}`
                    : ""}
                </p>
                <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
                  {comment.quoteText}
                </blockquote>
                <p className="text-sm">{comment.body}</p>
                {(repliesByComment[comment.id] || []).map((reply) => (
                  <p key={reply.id} className="text-sm text-muted-foreground">
                    {reply.authorName || reply.authorId}: {reply.body}
                  </p>
                ))}
                <div className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{t("workspace.programme.consultationStatus")}</span>
                    <Select
                      value={nextStatus[comment.id] || comment.status}
                      onValueChange={(value) =>
                        setNextStatus((prev) => ({ ...prev, [comment.id]: value as ConsultationCommentStatus }))
                      }
                    >
                      <SelectTrigger size="sm" className="min-w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSULTATION_COMMENT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="min-w-56 flex-1 space-y-1 text-sm">
                    <span className="text-muted-foreground">{t("workspace.programme.consultationReason")}</span>
                    <Input
                      value={reasons[comment.id] || ""}
                      onChange={(event) =>
                        setReasons((prev) => ({ ...prev, [comment.id]: event.target.value }))
                      }
                      placeholder={t("workspace.programme.consultationReasonPlaceholder")}
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={pending || !canAdminister}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await transitionConsultationComment({
                          workspaceId,
                          commentId: comment.id,
                          toStatus: nextStatus[comment.id] || comment.status,
                          reason: reasons[comment.id] || "",
                        })
                        if (result.error) {
                          notify(result.error, "error")
                          return
                        }
                        notify(t("workspace.programme.consultationApply"))
                        onChanged()
                      })
                    }
                  >
                    {t("workspace.programme.consultationApply")}
                  </Button>
                  {comment.clusterId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || !canAdminister}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await unclusterConsultationComment(workspaceId, comment.id)
                          if (result.error) {
                            notify(result.error, "error")
                            return
                          }
                          onChanged()
                        })
                      }
                    >
                      {t("workspace.programme.consultationUncluster")}
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="min-w-56 flex-1"
                    value={replies[comment.id] || ""}
                    onChange={(event) => setReplies((prev) => ({ ...prev, [comment.id]: event.target.value }))}
                    placeholder={t("workspace.programme.consultationReplyPlaceholder")}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || !canAdminister}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await addConsultationReply({
                          commentId: comment.id,
                          body: replies[comment.id] || "",
                        })
                        if (result.error) {
                          notify(result.error, "error")
                          return
                        }
                        setReplies((prev) => ({ ...prev, [comment.id]: "" }))
                        notify(t("workspace.programme.consultationReplySent"))
                        onChanged()
                      })
                    }
                  >
                    {t("workspace.programme.consultationReply")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
