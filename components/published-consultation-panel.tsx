"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { QUOTE_EVENT } from "@/components/published-article"
import {
  addConsultationReply,
  submitConsultationAppeal,
  submitConsultationComment,
  type ConsultationAppealRow,
  type ConsultationClusterRow,
  type ConsultationCommentRow,
  type ConsultationReplyRow,
  type ConsultationSummary,
  type ConsultationTopicSummaryRow,
} from "@/lib/actions/consultation"
import type { ConsultationCommentStatus } from "@/lib/programme/consultation"
import { TERMINAL_CONSULTATION_STATUSES } from "@/lib/programme/consultation"
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

export function PublishedConsultationPanel({
  publicationId,
  consultation,
  canComment,
  signedIn,
  comments,
  replies,
  appeals,
  clusters,
  topicSummary,
}: {
  publicationId: string
  consultation: ConsultationSummary | null
  canComment: boolean
  signedIn: boolean
  comments: ConsultationCommentRow[]
  replies: ConsultationReplyRow[]
  appeals: ConsultationAppealRow[]
  clusters: ConsultationClusterRow[]
  topicSummary: ConsultationTopicSummaryRow | null
}) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [quoteText, setQuoteText] = useState("")
  const [body, setBody] = useState("")
  const [mine, setMine] = useState(comments)
  const [thread, setThread] = useState(replies)
  const [appealBodies, setAppealBodies] = useState<Record<string, string>>({})
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({})
  const [localAppeals, setLocalAppeals] = useState(appeals)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const onQuote = (event: Event) => {
      const quote = (event as CustomEvent<string>).detail
      if (!quote) return
      setQuoteText(quote)
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    window.addEventListener(QUOTE_EVENT, onQuote)
    return () => window.removeEventListener(QUOTE_EVENT, onQuote)
  }, [])

  const statusLabel = (status: ConsultationCommentStatus) =>
    t(`workspace.programme.${STATUS_KEYS[status]}`)

  const repliesByComment = useMemo(() => {
    const grouped: Record<string, ConsultationReplyRow[]> = {}
    for (const reply of thread) {
      grouped[reply.commentId] = [...(grouped[reply.commentId] || []), reply]
    }
    return grouped
  }, [thread])

  const windowNote =
    !consultation
      ? t("workspace.published.consultationNotOpen")
      : consultation.window === "scheduled"
        ? t("workspace.published.consultationScheduled")
        : consultation.window === "closed"
          ? t("workspace.published.consultationClosed")
          : null

  return (
    <section className="space-y-6 border-t pt-8">
      {topicSummary?.publishedAt ? (
        <div className="space-y-2" data-guidance-target="published-topic-summary">
          <h2 className="text-xl font-semibold tracking-tight">{t("workspace.published.consultationTopicsPublic")}</h2>
          <article className="prose prose-neutral max-w-none text-sm">
            <ReactMarkdown>{topicSummary.bodyMarkdown}</ReactMarkdown>
          </article>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">{t("workspace.published.consultationTitle")}</h2>
        {windowNote ? <p className="text-sm text-muted-foreground">{windowNote}</p> : null}
        {!signedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("workspace.published.consultationSignIn")}</p>
            <Button asChild>
              <Link href="/auth/login">{t("workspace.published.consultationSignInAction")}</Link>
            </Button>
          </div>
        ) : canComment ? (
          <form
            ref={formRef}
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              startTransition(async () => {
                const result = await submitConsultationComment({
                  publicationId,
                  quoteText,
                  body,
                })
                if (result.error || !result.data) {
                  notify(result.error || t("workspace.published.consultationNeedQuote"), "error")
                  return
                }
                setMine((prev) => [result.data, ...prev])
                setQuoteText("")
                setBody("")
                notify(t("workspace.published.consultationSubmitted"))
              })
            }}
          >
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t("workspace.published.consultationQuote")}</span>
              <Textarea
                value={quoteText}
                onChange={(event) => setQuoteText(event.target.value)}
                rows={3}
                placeholder={t("workspace.published.consultationQuoteHint")}
                required
                data-guidance-target="published-quote"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t("workspace.published.consultationComment")}</span>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                required
                data-guidance-target="published-comment"
              />
            </label>
            <Button type="submit" disabled={pending} data-guidance-target="published-submit">
              {t("workspace.published.consultationSubmit")}
            </Button>
          </form>
        ) : null}
      </div>

      {mine.length > 0 ? (
        <div className="space-y-3" data-guidance-target="published-mine">
          <h3 className="text-sm font-medium">{t("workspace.published.consultationYours")}</h3>
          <ul className="space-y-3">
            {mine.map((comment) => {
              const cluster = clusters.find((item) => item.id === comment.clusterId)
              const pendingAppeal = localAppeals.find(
                (appeal) => appeal.commentId === comment.id && !appeal.reviewedAt,
              )
              const canAppeal =
                TERMINAL_CONSULTATION_STATUSES.includes(comment.status as (typeof TERMINAL_CONSULTATION_STATUSES)[number]) &&
                !pendingAppeal
              return (
                <li key={comment.id} className="space-y-2 rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {statusLabel(comment.status)}
                  </p>
                  <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
                    {comment.quoteText}
                  </blockquote>
                  <p className="text-sm">{comment.body}</p>
                  {comment.latestReason ? (
                    <p className="text-sm text-muted-foreground">
                      {t("workspace.published.consultationDecision")}: {comment.latestReason}
                    </p>
                  ) : null}
                  {cluster ? (
                    <p className="text-sm text-muted-foreground">
                      {t("workspace.published.consultationTopic")}: {cluster.label}
                    </p>
                  ) : null}
                  {(repliesByComment[comment.id] || []).map((reply) => (
                    <p key={reply.id} className="text-sm text-muted-foreground">
                      {reply.authorName || reply.authorId}: {reply.body}
                    </p>
                  ))}
                  {signedIn ? (
                    <div className="space-y-2">
                      <Textarea
                        value={replyBodies[comment.id] || ""}
                        onChange={(event) =>
                          setReplyBodies((prev) => ({ ...prev, [comment.id]: event.target.value }))
                        }
                        rows={2}
                        placeholder={t("workspace.published.consultationReplyPlaceholder")}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await addConsultationReply({
                              commentId: comment.id,
                              body: replyBodies[comment.id] || "",
                            })
                            if (result.error || !result.data) {
                              notify(result.error || t("workspace.published.consultationReply"), "error")
                              return
                            }
                            setThread((prev) => [...prev, result.data])
                            setReplyBodies((prev) => ({ ...prev, [comment.id]: "" }))
                            notify(t("workspace.published.consultationReplySent"))
                          })
                        }
                      >
                        {t("workspace.published.consultationReply")}
                      </Button>
                    </div>
                  ) : null}
                  {pendingAppeal ? (
                    <p className="text-xs text-muted-foreground">{t("workspace.published.consultationAppealPending")}</p>
                  ) : null}
                  {canAppeal ? (
                    <div className="space-y-2">
                      <Textarea
                        value={appealBodies[comment.id] || ""}
                        onChange={(event) =>
                          setAppealBodies((prev) => ({ ...prev, [comment.id]: event.target.value }))
                        }
                        rows={2}
                        placeholder={t("workspace.published.consultationAppealPlaceholder")}
                        data-guidance-target="published-appeal-input"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        data-guidance-target="published-appeal-submit"
                        onClick={() =>
                          startTransition(async () => {
                            const result = await submitConsultationAppeal({
                              commentId: comment.id,
                              body: appealBodies[comment.id] || "",
                            })
                            if (result.error || !result.data) {
                              notify(result.error || t("workspace.published.consultationAppeal"), "error")
                              return
                            }
                            setLocalAppeals((prev) => [result.data, ...prev])
                            setAppealBodies((prev) => ({ ...prev, [comment.id]: "" }))
                            notify(t("workspace.published.consultationAppealSent"))
                          })
                        }
                      >
                        {t("workspace.published.consultationAppealSubmit")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
