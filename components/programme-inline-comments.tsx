"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { nestColleagueComments, type ColleagueCommentThemeRecord } from "@/lib/programme/colleague-comments"
import { groupProgrammeCommentThreads, offsetTopWithin, stackCommentAnchors } from "@/lib/programme/comment-layout"
import type { AnchoredProgrammeComment } from "@/lib/programme/comment-anchor"

type Props = {
  rootId: string
  comments: AnchoredProgrammeComment[]
  themes?: ColleagueCommentThemeRecord[]
  activeBlockId: string | null
  showAll: boolean
  draft: string
  canComment: boolean
  pending?: boolean
  layoutKey: string
  railClassName?: string
  addLabel: string
  resolveLabel: string
  reopenLabel: string
  replyLabel: string
  replyPlaceholder: string
  placeholder: string
  hint?: string
  clusterLabel?: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onReply: (parentId: string, body: string) => void
  onSelect: (blockId: string | null) => void
  onToggleResolved: (commentId: string, resolved: boolean) => void
  onCluster?: () => void
}

export function ProgrammeInlineComments({
  rootId,
  comments,
  themes = [],
  activeBlockId,
  showAll,
  draft,
  canComment,
  pending,
  layoutKey,
  railClassName,
  addLabel,
  resolveLabel,
  reopenLabel,
  replyLabel,
  replyPlaceholder,
  placeholder,
  hint,
  clusterLabel,
  onDraftChange,
  onAdd,
  onReply,
  onSelect,
  onToggleResolved,
  onCluster,
}: Props) {
  const threads = useMemo(
    () => nestColleagueComments(comments.map((comment) => ({ ...comment, parentId: comment.parentId ?? null }))),
    [comments],
  )
  const grouped = useMemo(
    () =>
      groupProgrammeCommentThreads({
        comments: threads,
        showComments: showAll,
        activeBlockId,
        canCompose: canComment,
      }),
    [threads, showAll, activeBlockId, canComment],
  )
  const openThemes = themes.filter((theme) => !theme.addressed)
  const showPrep = Boolean(showAll && (hint || onCluster || openThemes.length))

  const [tops, setTops] = useState<Record<string, number>>({})
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState("")
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useLayoutEffect(() => {
    const root = document.getElementById(rootId)
    if (!root) return

    const nextTops: Record<string, number> = {}
    if (showPrep) nextTops.__prep__ = 0
    for (const key of grouped.keys()) {
      const selector = key.startsWith("doc:")
        ? `[data-chapter-document="${CSS.escape(key.slice(4))}"]`
        : `[data-block-id="${CSS.escape(key)}"]`
      const target = root.querySelector(selector) as HTMLElement | null
      if (target) nextTops[key] = Math.max(0, offsetTopWithin(target, root))
    }
    setTops(nextTops)

    const nextHeights: Record<string, number> = {}
    for (const key of [showPrep ? "__prep__" : "", ...grouped.keys()].filter(Boolean)) {
      const card = cardRefs.current[key]
      if (card) nextHeights[key] = card.offsetHeight
    }
    setHeights(nextHeights)
  }, [grouped, layoutKey, rootId, draft, activeBlockId, showPrep, replyTo, replyDraft, openThemes.length])

  const stacked = stackCommentAnchors(
    [showPrep ? "__prep__" : "", ...grouped.keys()]
      .filter(Boolean)
      .map((id) => ({
        id,
        preferredTop: tops[id] ?? 0,
        height: heights[id] ?? 120,
      })),
  )

  if (grouped.size === 0 && !showPrep) return null

  const submitReply = (parentId: string) => {
    if (!replyDraft.trim() || pending) return
    onReply(parentId, replyDraft.trim())
    setReplyDraft("")
    setReplyTo(null)
  }

  return (
    <div className={railClassName ?? "pointer-events-none absolute inset-y-0 right-0 w-72"} data-programme-comments>
      {stacked.map(({ id, top }) => {
        if (id === "__prep__") {
          return (
            <div
              key={id}
              ref={(node) => {
                cardRefs.current[id] = node
              }}
              className="pointer-events-auto absolute right-0 z-20 w-72"
              style={{ top }}
            >
              <div className="rounded-lg border bg-amber-50/80 p-2 shadow-sm">
                {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
                {onCluster && clusterLabel ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 w-full text-[11px]"
                    disabled={pending}
                    onClick={onCluster}
                  >
                    {clusterLabel}
                  </Button>
                ) : null}
                {openThemes.map((theme) => (
                  <div key={theme.id} className="mt-2 border-t border-amber-200 pt-2">
                    <p className="text-[11px] font-medium">{theme.label}</p>
                    {theme.summary ? <p className="mt-1 text-[11px] text-muted-foreground">{theme.summary}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          )
        }
        const thread = grouped.get(id) || []
        const isActive = id === activeBlockId
        return (
          <div
            key={id}
            ref={(node) => {
              cardRefs.current[id] = node
            }}
            className="pointer-events-auto absolute right-0 z-10 w-72"
            style={{ top }}
          >
            <div
              className={cn(
                "rounded-lg border bg-white p-2 shadow-sm",
                isActive && "ring-1 ring-amber-300",
              )}
            >
              {thread.map((comment) => (
                <div key={comment.id} className="border-b px-1 py-2 last:border-b-0">
                  <button type="button" className="w-full text-left" onClick={() => onSelect(comment.blockId)}>
                    {comment.themeLabel ? (
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                        {comment.themeLabel}
                      </p>
                    ) : null}
                    {comment.quote ? (
                      <p className="mb-1 line-clamp-2 border-l-2 border-amber-300 pl-2 text-[11px] text-muted-foreground">
                        {comment.quote}
                      </p>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <UserAvatar name={comment.authorName} url={comment.authorAvatarUrl} className="mt-0.5 h-5 w-5" />
                      <p className="min-w-0 flex-1 text-xs">
                        {comment.authorName ? <span className="font-medium">{comment.authorName} </span> : null}
                        <span className={cn(comment.resolved && "text-muted-foreground line-through")}>
                          {comment.body}
                        </span>
                      </p>
                    </div>
                  </button>
                  {comment.replies?.map((reply) => (
                    <div key={reply.id} className="mt-2 ml-7 flex items-start gap-2">
                      <UserAvatar name={reply.authorName} url={reply.authorAvatarUrl} className="mt-0.5 h-4 w-4" />
                      <p className="min-w-0 flex-1 text-[11px]">
                        {reply.authorName ? <span className="font-medium">{reply.authorName} </span> : null}
                        <span className={cn(reply.resolved && "text-muted-foreground line-through")}>{reply.body}</span>
                      </p>
                    </div>
                  ))}
                  <div className="mt-1 ml-7 flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-[11px]"
                      onClick={() => onToggleResolved(comment.id, !comment.resolved)}
                    >
                      {comment.resolved ? reopenLabel : resolveLabel}
                    </Button>
                    {canComment && !comment.resolved ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1 text-[11px]"
                        onClick={() => {
                          setReplyTo(replyTo === comment.id ? null : comment.id)
                          setReplyDraft("")
                        }}
                      >
                        {replyLabel}
                      </Button>
                    ) : null}
                  </div>
                  {canComment && replyTo === comment.id ? (
                    <div className="mt-2 ml-7 flex gap-2">
                      <Input
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        placeholder={replyPlaceholder}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && replyDraft.trim() && !pending) {
                            event.preventDefault()
                            submitReply(comment.id)
                          }
                        }}
                      />
                      <Button type="button" size="sm" disabled={pending || !replyDraft.trim()} onClick={() => submitReply(comment.id)}>
                        {replyLabel}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {canComment && isActive ? (
                <div className="flex gap-2 pt-2">
                  <Input
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    placeholder={placeholder}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && draft.trim() && !pending) {
                        event.preventDefault()
                        onAdd()
                      }
                    }}
                  />
                  <Button type="button" size="sm" disabled={pending || !draft.trim()} onClick={onAdd}>
                    {addLabel}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
