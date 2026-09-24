"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"
import {
  insertOutlineNodeAt,
  outlinePurposePlainText,
  type ProgrammeOutlineNode,
} from "@/lib/programme/domain"
import { outlineDragInsertIndex } from "@/lib/programme/outline-drag"
import {
  createBlankProgrammeOutline,
  insertProgrammeOutlineNode,
  listProgrammeOutlineNodes,
  reorderProgrammeOutlineNodes,
  updateProgrammeOutlineNode,
} from "@/lib/actions/outline"
import type { NotifyKind } from "@/lib/notify"
import { ArrowDown, ArrowUp, GripVertical, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  workspaceId: string
  spaceId: string
  templateId: string | null
  canEdit?: boolean
  onTemplateBound: (templateId: string) => void
  onNodesChange?: (nodes: ProgrammeOutlineNode[]) => void
  onMessage: (message: string, kind?: NotifyKind) => void
}

type Draft = { title: string; purpose: string }

type DragPreview = {
  id: string
  width: number
}

function OutlineChapterPreview({ title, purpose }: { title: string; purpose: string }) {
  return (
    <div className="relative flex items-start gap-2">
      <span className="mt-1.5 text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xl font-semibold tracking-tight">{title || "\u00a0"}</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{purpose || "\u00a0"}</p>
      </div>
    </div>
  )
}

export function ProgrammeOutlineEditor({
  workspaceId,
  spaceId,
  templateId,
  canEdit = true,
  onTemplateBound,
  onNodesChange,
  onMessage,
}: Props) {
  const { t } = useI18n()
  const [nodes, setNodes] = useState<ProgrammeOutlineNode[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [pending, startTransition] = useTransition()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [insertIndex, setInsertIndex] = useState(0)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const draftsRef = useRef<Record<string, Draft>>({})
  const listRef = useRef<HTMLDivElement>(null)
  const floaterRef = useRef<HTMLElement>(null)
  const floaterPosRef = useRef<{ x: number; y: number } | null>(null)
  const orderedRef = useRef<ProgrammeOutlineNode[]>([])
  const draggingIdRef = useRef<string | null>(null)
  const insertIndexRef = useRef(0)
  const dragListenersRef = useRef<{ move: (event: PointerEvent) => void; up: (event: PointerEvent) => void } | null>(
    null,
  )

  const ordered = useMemo(
    () => [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    [nodes],
  )
  orderedRef.current = ordered
  draggingIdRef.current = draggingId
  insertIndexRef.current = insertIndex

  const applyNodes = (next: ProgrammeOutlineNode[]) => {
    setNodes(next)
    const nextDrafts = Object.fromEntries(
      next.map((node) => [
        node.id,
        { title: node.title, purpose: outlinePurposePlainText(node.purpose) },
      ]),
    )
    draftsRef.current = nextDrafts
    setDrafts(nextDrafts)
    onNodesChange?.(next)
  }

  useEffect(() => {
    if (!templateId) return
    startTransition(async () => {
      const result = await listProgrammeOutlineNodes(templateId)
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      applyNodes(result.data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  useEffect(() => {
    return () => {
      for (const timer of Object.values(saveTimers.current)) clearTimeout(timer)
      stopDragListeners()
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
  }, [])

  useLayoutEffect(() => {
    const el = floaterRef.current
    const pos = floaterPosRef.current
    if (!el || !pos) return
    el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
  })

  const buildChapters = () => {
    startTransition(async () => {
      const created = await createBlankProgrammeOutline(workspaceId, spaceId)
      if (created.error || !created.data) {
        onMessage(created.error || t("workspace.programme.outlineLoadError"), "error")
        return
      }
      onTemplateBound(created.data.templateId)
      const nodes = await listProgrammeOutlineNodes(created.data.templateId)
      applyNodes(nodes.data)
    })
  }

  const persistNode = (nodeId: string, next: Draft) => {
    if (!templateId || !canEdit) return
    const title = next.title.trim()
    if (!title) return
    startTransition(async () => {
      const result = await updateProgrammeOutlineNode({
        workspaceId,
        templateId,
        nodeId,
        title,
        purpose: next.purpose,
      })
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      if (result.data) {
        setNodes(result.data)
        onNodesChange?.(result.data)
      }
    })
  }

  const scheduleSave = (nodeId: string, next: Draft) => {
    draftsRef.current = { ...draftsRef.current, [nodeId]: next }
    setDrafts(draftsRef.current)
    if (!canEdit) return
    clearTimeout(saveTimers.current[nodeId])
    saveTimers.current[nodeId] = setTimeout(() => persistNode(nodeId, next), 500)
  }

  const flushSave = (nodeId: string) => {
    const draft = draftsRef.current[nodeId]
    if (!draft) return
    clearTimeout(saveTimers.current[nodeId])
    persistNode(nodeId, draft)
  }

  const addChapter = (afterId?: string | null) => {
    if (!templateId || !canEdit) return
    startTransition(async () => {
      const result = await insertProgrammeOutlineNode({
        workspaceId,
        templateId,
        afterId,
        title: t("workspace.programme.outlineNewChapter"),
      })
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      applyNodes(result.data || [])
    })
  }

  const reorder = (orderedIds: string[]) => {
    if (!templateId || !canEdit) return
    startTransition(async () => {
      const result = await reorderProgrammeOutlineNodes({ workspaceId, templateId, orderedIds })
      if (result.error) {
        onMessage(result.error, "error")
        return
      }
      applyNodes(result.data || [])
    })
  }

  const move = (nodeId: string, direction: "up" | "down") => {
    const ids = ordered.map((node) => node.id)
    const index = ids.indexOf(nodeId)
    const swap = direction === "up" ? index - 1 : index + 1
    if (index < 0 || swap < 0 || swap >= ids.length) return
    const next = [...ids]
    ;[next[index], next[swap]] = [next[swap], next[index]]
    reorder(next)
  }

  const stopDragListeners = () => {
    const listeners = dragListenersRef.current
    if (!listeners) return
    window.removeEventListener("pointermove", listeners.move)
    window.removeEventListener("pointerup", listeners.up)
    window.removeEventListener("pointercancel", listeners.up)
    dragListenersRef.current = null
  }

  const measureInsertIndex = (pointerY: number, dragId: string) => {
    const root = listRef.current
    if (!root) return insertIndexRef.current
    const items = [...root.querySelectorAll<HTMLElement>("[data-chapter-id]")].filter(
      (el) => el.getAttribute("data-chapter-id") !== dragId,
    )
    const centers = items.map((el) => {
      const rect = el.getBoundingClientRect()
      return rect.top + rect.height / 2
    })
    return outlineDragInsertIndex(centers, pointerY)
  }

  const scrollDocumentIfNeeded = (clientY: number) => {
    const scroller = document.getElementById("programme-document-scroll")
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const edge = 56
    if (clientY < rect.top + edge) {
      scroller.scrollTop -= Math.max(8, (rect.top + edge - clientY) / 2)
    } else if (clientY > rect.bottom - edge) {
      scroller.scrollTop += Math.max(8, (clientY - (rect.bottom - edge)) / 2)
    }
  }

  const endDrag = (didMove: boolean) => {
    stopDragListeners()
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    const id = draggingIdRef.current
    const index = insertIndexRef.current
    draggingIdRef.current = null
    floaterPosRef.current = null
    setDraggingId(null)
    setDragPreview(null)
    if (!didMove || !id) return
    const ids = orderedRef.current.map((node) => node.id)
    const next = insertOutlineNodeAt(ids, id, index)
    if (next.join() === ids.join()) return
    reorder(next)
  }

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, nodeId: string) => {
    if (!canEdit || pending || event.button !== 0) return
    event.preventDefault()
    const article = event.currentTarget.closest("article")
    if (!article) return
    const rect = article.getBoundingClientRect()
    const pointerId = event.pointerId
    const originX = event.clientX
    const originY = event.clientY
    const offsetX = originX - rect.left
    const offsetY = originY - rect.top
    const originIndex = ordered.findIndex((node) => node.id === nodeId)
    let active = false

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (!active) {
        const dx = moveEvent.clientX - originX
        const dy = moveEvent.clientY - originY
        if (dx * dx + dy * dy < 16) return
        active = true
        draggingIdRef.current = nodeId
        insertIndexRef.current = originIndex < 0 ? 0 : originIndex
        floaterPosRef.current = { x: rect.left, y: rect.top }
        setDraggingId(nodeId)
        setInsertIndex(insertIndexRef.current)
        setDragPreview({ id: nodeId, width: rect.width })
        document.body.style.userSelect = "none"
        document.body.style.cursor = "grabbing"
      }
      moveEvent.preventDefault()
      const x = moveEvent.clientX - offsetX
      const y = moveEvent.clientY - offsetY
      floaterPosRef.current = { x, y }
      if (floaterRef.current) {
        floaterRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
      scrollDocumentIfNeeded(moveEvent.clientY)
      const nextIndex = measureInsertIndex(moveEvent.clientY, nodeId)
      if (nextIndex !== insertIndexRef.current) {
        insertIndexRef.current = nextIndex
        setInsertIndex(nextIndex)
      }
    }

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      endDrag(active)
    }

    stopDragListeners()
    dragListenersRef.current = { move: onMove, up: onUp }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  const rest = draggingId ? ordered.filter((node) => node.id !== draggingId) : ordered
  const placeholderNode = draggingId ? ordered.find((node) => node.id === draggingId) ?? null : null
  const placeholderAt = Math.max(0, Math.min(insertIndex, rest.length))

  const renderChapter = (node: ProgrammeOutlineNode) => {
    const draft = drafts[node.id] ?? { title: node.title, purpose: outlinePurposePlainText(node.purpose) }
    const orderIndex = ordered.findIndex((item) => item.id === node.id)
    return (
      <article
        key={node.id}
        id={`chapter-${node.id}`}
        data-chapter-id={node.id}
        className="group scroll-mt-8 space-y-2 rounded-md"
      >
        <div className="relative flex items-start gap-2">
          {canEdit ? (
            <button
              type="button"
              className="mt-1.5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
              aria-label={t("workspace.programme.outlineDrag")}
              onPointerDown={(event) => startDrag(event, node.id)}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={draft.title}
              disabled={!canEdit || pending}
              aria-label={t("workspace.programme.outlineChapterTitle")}
              className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
              onChange={(event) => scheduleSave(node.id, { ...draft, title: event.target.value })}
              onBlur={() => flushSave(node.id)}
            />
            <textarea
              value={draft.purpose}
              disabled={!canEdit || pending}
              rows={Math.max(2, draft.purpose.split("\n").length)}
              placeholder={t("workspace.programme.outlineDescriptionPlaceholder")}
              aria-label={t("workspace.programme.outlineDescription")}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/70"
              onChange={(event) => scheduleSave(node.id, { ...draft, purpose: event.target.value })}
              onBlur={() => flushSave(node.id)}
            />
          </div>
          {canEdit ? (
            <div
              className={cn(
                "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                draggingId && "opacity-0",
              )}
            >
              <IconTooltip label={t("workspace.programme.outlineMoveUp")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending || orderIndex === 0}
                  aria-label={t("workspace.programme.outlineMoveUp")}
                  onClick={() => move(node.id, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </IconTooltip>
              <IconTooltip label={t("workspace.programme.outlineMoveDown")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending || orderIndex === ordered.length - 1}
                  aria-label={t("workspace.programme.outlineMoveDown")}
                  onClick={() => move(node.id, "down")}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </IconTooltip>
              <IconTooltip label={t("workspace.programme.outlineAddSection")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  aria-label={t("workspace.programme.outlineAddSection")}
                  onClick={() => addChapter(node.id)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </IconTooltip>
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  const listItems = (() => {
    if (!placeholderNode) return rest.map((node) => renderChapter(node))
    const draft = drafts[placeholderNode.id] ?? {
      title: placeholderNode.title,
      purpose: outlinePurposePlainText(placeholderNode.purpose),
    }
    const placeholder = (
      <article
        key={`${placeholderNode.id}-placeholder`}
        data-outline-placeholder=""
        aria-hidden
        className="pointer-events-none scroll-mt-8 space-y-2 rounded-md opacity-40"
      >
        <OutlineChapterPreview title={draft.title} purpose={draft.purpose} />
      </article>
    )
    const before = rest.slice(0, placeholderAt).map((node) => renderChapter(node))
    const after = rest.slice(placeholderAt).map((node) => renderChapter(node))
    return [...before, placeholder, ...after]
  })()

  const previewDraft = dragPreview
    ? drafts[dragPreview.id] ??
      (() => {
        const node = ordered.find((item) => item.id === dragPreview.id)
        return { title: node?.title ?? "", purpose: outlinePurposePlainText(node?.purpose) }
      })()
    : null

  return (
    <div className={cn("relative", draggingId && "select-none")}>
      <div ref={listRef} className="space-y-8">
        {!templateId ? (
          <div className="space-y-3">
            <p className="text-sm">{t("workspace.programme.editorNeedOutline")}</p>
            <Button disabled={pending} onClick={buildChapters}>
              {t("workspace.programme.setupWizard.structureBlankTitle")}
            </Button>
          </div>
        ) : ordered.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("workspace.programme.outlineEmpty")}</p>
            {canEdit ? (
              <Button disabled={pending} onClick={() => addChapter(null)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("workspace.programme.outlineAddSection")}
              </Button>
            ) : null}
          </div>
        ) : (
          listItems
        )}
        {templateId && canEdit && ordered.length > 0 ? (
          <div className="pt-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => addChapter(ordered.at(-1)?.id ?? null)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("workspace.programme.outlineAddSection")}
            </Button>
          </div>
        ) : null}
      </div>
      {dragPreview && previewDraft ? (
        <article
          ref={floaterRef}
          className="pointer-events-none fixed top-0 left-0 z-50 rounded-md bg-white px-1 py-1 shadow-lg ring-1 ring-black/5"
          style={{ width: dragPreview.width }}
        >
          <OutlineChapterPreview title={previewDraft.title} purpose={previewDraft.purpose} />
        </article>
      ) : null}
    </div>
  )
}
