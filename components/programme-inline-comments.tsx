"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"
import { groupProgrammeCommentThreads, offsetTopWithin, stackCommentAnchors } from "@/lib/programme/comment-layout"
import type { AnchoredProgrammeComment } from "@/lib/programme/comment-anchor"

type Props = {
  rootId: string
  comments: AnchoredProgrammeComment[]
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
  placeholder: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onSelect: (blockId: string | null) => void
  onToggleResolved: (commentId: string, resolved: boolean) => void
}

export function ProgrammeInlineComments({
  rootId,
  comments,
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
  placeholder,
  onDraftChange,
  onAdd,
  onSelect,
  onToggleResolved,
}: Props) {
  const grouped = useMemo(
    () =>
      groupProgrammeCommentThreads({
        comments,
        showComments: showAll,
        activeBlockId,
        canCompose: canComment,
      }),
    [comments, showAll, activeBlockId, canComment],
  )

  const [tops, setTops] = useState<Record<string, number>>({})
  const [heights, setHeights] = useState<Record<string, number>>({})
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useLayoutEffect(() => {
    const root = document.getElementById(rootId)
    if (!root) return

    const nextTops: Record<string, number> = {}
    for (const key of grouped.keys()) {
      const selector = key.startsWith("doc:")
        ? `[data-chapter-document="${CSS.escape(key.slice(4))}"]`
        : `[data-block-id="${CSS.escape(key)}"]`
      const target = root.querySelector(selector) as HTMLElement | null
      if (target) nextTops[key] = Math.max(0, offsetTopWithin(target, root))
    }
    setTops(nextTops)

    const nextHeights: Record<string, number> = {}
    for (const key of grouped.keys()) {
      const card = cardRefs.current[key]
      if (card) nextHeights[key] = card.offsetHeight
    }
    setHeights(nextHeights)
  }, [grouped, layoutKey, rootId, draft, activeBlockId])

  const stacked = stackCommentAnchors(
    [...grouped.keys()].map((id) => ({
      id,
      preferredTop: tops[id] ?? 0,
      height: heights[id] ?? 120,
    })),
  )

  if (grouped.size === 0) return null

  return (
    <div className={railClassName ?? "pointer-events-none absolute inset-y-0 right-0 w-72"} data-programme-comments>
      {stacked.map(({ id, top }) => {
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 ml-7 h-6 px-1 text-[11px]"
                    onClick={() => onToggleResolved(comment.id, !comment.resolved)}
                  >
                    {comment.resolved ? reopenLabel : resolveLabel}
                  </Button>
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
