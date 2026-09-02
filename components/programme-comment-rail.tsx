"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserAvatar } from "@/components/user-avatar"
import { cn } from "@/lib/utils"

export type ProgrammeCommentRow = {
  id: string
  artefact_type: string
  artefact_id: string
  body: string
  resolved: boolean
  authorName?: string | null
  authorAvatarUrl?: string | null
  quote: string
  chapterTitle?: string
  blockId: string | null
}

type Props = {
  comments: ProgrammeCommentRow[]
  activeBlockId: string | null
  draft: string
  canComment: boolean
  pending?: boolean
  emptyHint: string
  addLabel: string
  resolveLabel: string
  reopenLabel: string
  placeholder: string
  title: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onSelect: (blockId: string | null, commentId: string) => void
  onToggleResolved: (commentId: string, resolved: boolean) => void
}

export function ProgrammeCommentRail({
  comments,
  activeBlockId,
  draft,
  canComment,
  pending,
  emptyHint,
  addLabel,
  resolveLabel,
  reopenLabel,
  placeholder,
  title,
  onDraftChange,
  onAdd,
  onSelect,
  onToggleResolved,
}: Props) {
  const visible = comments.filter((comment) => !comment.resolved || comment.blockId === activeBlockId)

  return (
    <aside className="hidden h-full w-72 shrink-0 flex-col border-l bg-white lg:flex">
      <div className="px-3 py-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {visible.length === 0 ? <p className="text-xs text-muted-foreground">{emptyHint}</p> : null}
        {visible.map((comment) => (
          <button
            key={comment.id}
            type="button"
            onClick={() => onSelect(comment.blockId, comment.id)}
            className={cn(
              "w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50",
              comment.blockId && comment.blockId === activeBlockId && "bg-amber-50",
            )}
          >
            {comment.quote ? (
              <p className="mb-1 line-clamp-2 border-l-2 border-amber-300 pl-2 text-[11px] text-muted-foreground">
                {comment.quote}
              </p>
            ) : comment.chapterTitle ? (
              <p className="mb-1 text-[11px] text-muted-foreground">{comment.chapterTitle}</p>
            ) : null}
            <div className="flex items-start gap-2">
              <UserAvatar name={comment.authorName} url={comment.authorAvatarUrl} className="mt-0.5 h-5 w-5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  {comment.authorName ? <span className="font-medium">{comment.authorName} </span> : null}
                  <span className={cn(comment.resolved && "text-muted-foreground line-through")}>{comment.body}</span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-6 px-1 text-[11px]"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleResolved(comment.id, !comment.resolved)
                  }}
                >
                  {comment.resolved ? reopenLabel : resolveLabel}
                </Button>
              </div>
            </div>
          </button>
        ))}
      </div>
      {canComment ? (
        <div className="flex gap-2 px-3 py-3">
          <Input
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft.trim()) {
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
    </aside>
  )
}
