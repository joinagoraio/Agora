"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { collectionDragInsertIndex, dashboardPinKey, insertKeyedItemAt } from "@/lib/dashboard/pin-order"
import type { DashboardCollectionItem } from "@/components/dashboard-collection"
import type { CollectionViewMode } from "@/components/view-mode-toggle"

const ITEM_ATTR = "data-favorite-key"

export function favoriteItemKey(item: DashboardCollectionItem) {
  return dashboardPinKey(item.kind ?? "programme", item.id)
}

export function useFavoriteReorder({
  enabled,
  items,
  layout,
  onReorder,
}: {
  enabled: boolean
  items: DashboardCollectionItem[]
  layout: CollectionViewMode
  onReorder?: (items: DashboardCollectionItem[]) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const floaterRef = useRef<HTMLDivElement | null>(null)
  const draggingKeyRef = useRef<string | null>(null)
  const insertIndexRef = useRef(0)
  const listenersRef = useRef<{ move: (event: PointerEvent) => void; up: (event: PointerEvent) => void } | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [insertIndex, setInsertIndex] = useState(0)
  const [preview, setPreview] = useState<{
    key: string
    title: string
    width: number
    height: number
    x: number
    y: number
  } | null>(null)

  const stopListeners = () => {
    const listeners = listenersRef.current
    if (!listeners) return
    window.removeEventListener("pointermove", listeners.move)
    window.removeEventListener("pointerup", listeners.up)
    window.removeEventListener("pointercancel", listeners.up)
    listenersRef.current = null
  }

  const measureInsertIndex = (pointer: { x: number; y: number }, dragKey: string) => {
    const root = containerRef.current
    if (!root) return insertIndexRef.current
    const nodes = [...root.querySelectorAll<HTMLElement>(`[${ITEM_ATTR}]`)].filter(
      (el) => el.getAttribute(ITEM_ATTR) !== dragKey,
    )
    const boxes = nodes.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        height: rect.height,
      }
    })
    return collectionDragInsertIndex(boxes, pointer, layout)
  }

  const scrollContainerIfNeeded = (clientY: number) => {
    const scroller = containerRef.current?.closest<HTMLElement>("[data-favorite-scroll]") ?? containerRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const edge = 32
    if (clientY < rect.top + edge) {
      scroller.scrollTop -= Math.max(6, (rect.top + edge - clientY) / 2)
    } else if (clientY > rect.bottom - edge) {
      scroller.scrollTop += Math.max(6, (clientY - (rect.bottom - edge)) / 2)
    }
  }

  const endDrag = (didMove: boolean) => {
    stopListeners()
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
    const key = draggingKeyRef.current
    const index = insertIndexRef.current
    draggingKeyRef.current = null
    setDraggingKey(null)
    setPreview(null)
    if (didMove) {
      const suppressClick = (clickEvent: Event) => {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
      }
      document.addEventListener("click", suppressClick, true)
      window.setTimeout(() => document.removeEventListener("click", suppressClick, true), 80)
    }
    if (!didMove || !key || !onReorder) return
    const next = insertKeyedItemAt(items, favoriteItemKey, key, index)
    if (next.map(favoriteItemKey).join() === items.map(favoriteItemKey).join()) return
    onReorder(next)
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>, item: DashboardCollectionItem) => {
    if (!enabled || !onReorder || event.button !== 0) return
    if ((event.target as HTMLElement | null)?.closest("[data-favorite-star]")) return
    const fromHandle = Boolean((event.target as HTMLElement | null)?.closest("[data-favorite-handle]"))
    if (fromHandle) {
      event.preventDefault()
      event.stopPropagation()
    }
    const target = event.currentTarget.closest<HTMLElement>(`[${ITEM_ATTR}]`)
    if (!target) return
    const key = favoriteItemKey(item)
    const rect = target.getBoundingClientRect()
    const pointerId = event.pointerId
    const originX = event.clientX
    const originY = event.clientY
    const offsetX = originX - rect.left
    const offsetY = originY - rect.top
    const originIndex = items.findIndex((entry) => favoriteItemKey(entry) === key)
    let active = false

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      if (!active) {
        const dx = moveEvent.clientX - originX
        const dy = moveEvent.clientY - originY
        if (dx * dx + dy * dy < 16) return
        active = true
        draggingKeyRef.current = key
        insertIndexRef.current = originIndex < 0 ? 0 : originIndex
        setDraggingKey(key)
        setInsertIndex(insertIndexRef.current)
        setPreview({
          key,
          title: item.title,
          width: rect.width,
          height: rect.height,
          x: rect.left,
          y: rect.top,
        })
        document.body.style.userSelect = "none"
        document.body.style.cursor = "grabbing"
      }
      moveEvent.preventDefault()
      const x = moveEvent.clientX - offsetX
      const y = moveEvent.clientY - offsetY
      if (floaterRef.current) {
        floaterRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
      scrollContainerIfNeeded(moveEvent.clientY)
      const nextIndex = measureInsertIndex({ x: moveEvent.clientX, y: moveEvent.clientY }, key)
      if (nextIndex !== insertIndexRef.current) {
        insertIndexRef.current = nextIndex
        setInsertIndex(nextIndex)
      }
    }

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      endDrag(active)
    }

    stopListeners()
    listenersRef.current = { move: onMove, up: onUp }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  useEffect(() => () => {
    stopListeners()
    document.body.style.userSelect = ""
    document.body.style.cursor = ""
  }, [])

  const rest = draggingKey ? items.filter((item) => favoriteItemKey(item) !== draggingKey) : items
  const placeholderAt = Math.max(0, Math.min(insertIndex, rest.length))

  return {
    containerRef,
    floaterRef,
    draggingKey,
    preview,
    rest,
    placeholderAt,
    startDrag,
    itemAttr: ITEM_ATTR,
  }
}
