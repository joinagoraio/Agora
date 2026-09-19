"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Bot,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FileDown,
  FilePenLine,
  GripVertical,
  PanelTop,
  PictureInPicture2,
  LayoutTemplate,
  Leaf,
  ListChecks,
  MessagesSquare,
  Quote,
  ScanSearch,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { IconTooltip } from "@/components/icon-tooltip"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"
import type { ProgrammeWorkbenchSection } from "@/lib/programme/domain"

const STORAGE_KEY = "agora:programme-toolbar-position"
const CHROME_VERSION = 2
const EDGE_PAD = 8

type ToolbarPosition = { x: number; y: number }

type ToolbarDock = "float" | "fixed"

type StoredToolbarChrome = {
  x?: number
  y?: number
  collapsed?: boolean
  dock?: ToolbarDock
  v?: number
}

function readStoredChrome(): StoredToolbarChrome {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredToolbarChrome
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredChrome(patch: StoredToolbarChrome) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStoredChrome(), ...patch }))
}

function positionFromStored(stored: StoredToolbarChrome): ToolbarPosition | null {
  if (typeof stored.x !== "number" || typeof stored.y !== "number") return null
  if (!Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return null
  return { x: stored.x, y: stored.y }
}

const SECTION_ICONS: Record<ProgrammeWorkbenchSection, LucideIcon> = {
  overview: ClipboardList,
  setup: SlidersHorizontal,
  agents: Bot,
  corpus: ClipboardList,
  analysis: ScanSearch,
  outline: ClipboardList,
  editor: FilePenLine,
  measures: ListChecks,
  effects: Leaf,
  provenance: Quote,
  review: UserCheck,
  consultation: MessagesSquare,
  export: FileDown,
  publish: BookOpen,
}

type ToolbarItem = {
  id: string
  label: string
  ariaLabel: string
  icon: LucideIcon
  active?: boolean
  onClick: () => void
  status?: "published" | "unpublished"
}

function clampPosition(
  x: number,
  y: number,
  tool: { width: number; height: number },
  parent: { width: number; height: number },
): ToolbarPosition {
  const maxX = Math.max(EDGE_PAD, parent.width - tool.width - EDGE_PAD)
  const maxY = Math.max(EDGE_PAD, parent.height - tool.height - EDGE_PAD)
  return {
    x: Math.min(Math.max(EDGE_PAD, x), maxX),
    y: Math.min(Math.max(EDGE_PAD, y), maxY),
  }
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}

function ToolbarButton({ item }: { item: ToolbarItem }) {
  const Icon = item.icon
  return (
    <IconTooltip label={item.label} side="bottom">
      <Button
        type="button"
        variant={item.active ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label={item.ariaLabel}
        aria-pressed={item.active || undefined}
        onClick={item.onClick}
      >
        <span className="relative inline-flex">
          <Icon className="h-4 w-4" />
          {item.status ? (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full",
                item.status === "published" ? "bg-emerald-500" : "bg-orange-500",
              )}
              aria-hidden
            />
          ) : null}
        </span>
      </Button>
    </IconTooltip>
  )
}

export function ProgrammeToolsToolbar({
  groups,
  activeSection,
  sheetOpen,
  onSection,
  canAccessSettings,
  publicationLoaded,
  published,
  onSaveAsTemplate,
  chrome,
}: {
  groups: { id: string; sections: ProgrammeWorkbenchSection[] }[]
  activeSection: ProgrammeWorkbenchSection
  sheetOpen: boolean
  onSection: (section: ProgrammeWorkbenchSection) => void
  canAccessSettings: boolean
  publicationLoaded: boolean
  published: boolean
  onSaveAsTemplate?: () => void
  chrome?: ReactNode
}) {
  const { t } = useI18n()
  const shellRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const dragListenersRef = useRef<{
    move: (event: PointerEvent) => void
    up: (event: PointerEvent) => void
  } | null>(null)
  const [position, setPosition] = useState<ToolbarPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const positionRef = useRef<ToolbarPosition | null>(null)
  positionRef.current = position

  const applyPosition = useCallback((next: ToolbarPosition, persist: boolean) => {
    const shell = shellRef.current
    const parent = shell?.offsetParent
    if (!shell || !(parent instanceof HTMLElement)) {
      setPosition(next)
      if (persist) writeStoredChrome(next)
      return
    }
    const clamped = clampPosition(
      next.x,
      next.y,
      { width: shell.offsetWidth, height: shell.offsetHeight },
      { width: parent.clientWidth, height: parent.clientHeight },
    )
    setPosition(clamped)
    if (persist) writeStoredChrome(clamped)
  }, [])

  const [collapsed, setCollapsed] = useState(false)
  const [dock, setDock] = useState<ToolbarDock>("fixed")
  const pinRightRef = useRef<number | null>(null)
  const floating = dock === "float"

  useEffect(() => {
    const stored = readStoredChrome()
    setCollapsed(Boolean(stored.collapsed))
    if (stored.v === CHROME_VERSION) {
      setDock(stored.dock === "float" ? "float" : "fixed")
    } else {
      setDock("fixed")
      writeStoredChrome({ dock: "fixed", v: CHROME_VERSION })
    }
    const storedPosition = positionFromStored(stored)
    if (storedPosition) applyPosition(storedPosition, true)
  }, [applyPosition])

  const toggleDock = () => {
    setDock((current) => {
      const next = current === "float" ? "fixed" : "float"
      writeStoredChrome({ dock: next, v: CHROME_VERSION })
      return next
    })
  }

  const toggleCollapsed = () => {
    const shell = shellRef.current
    const parent = shell?.offsetParent
    if (position && shell && parent instanceof HTMLElement) {
      pinRightRef.current = shell.getBoundingClientRect().right - parent.getBoundingClientRect().left
    }
    setCollapsed((current) => {
      const next = !current
      writeStoredChrome({ collapsed: next })
      return next
    })
  }

  useLayoutEffect(() => {
    if (pinRightRef.current == null) return
    const shell = shellRef.current
    const right = pinRightRef.current
    pinRightRef.current = null
    if (!shell) return
    applyPosition(
      {
        x: right - shell.offsetWidth,
        y: positionRef.current?.y ?? 0,
      },
      true,
    )
  }, [applyPosition, collapsed])

  useEffect(() => {
    const onResize = () => {
      const current = positionRef.current ?? positionFromStored(readStoredChrome())
      if (!current) return
      applyPosition(current, true)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [applyPosition])

  const stopDragListeners = useCallback(() => {
    const listeners = dragListenersRef.current
    if (!listeners) return
    window.removeEventListener("pointermove", listeners.move)
    window.removeEventListener("pointerup", listeners.up)
    window.removeEventListener("pointercancel", listeners.up)
    dragListenersRef.current = null
  }, [])

  useEffect(() => () => stopDragListeners(), [stopDragListeners])

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button > 0) return
    const shell = shellRef.current
    const parent = shell?.offsetParent
    if (!shell || !(parent instanceof HTMLElement)) return
    event.preventDefault()
    const shellRect = shell.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    const originX = shellRect.left - parentRect.left
    const originY = shellRect.top - parentRect.top
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
    }
    setPosition({ x: originX, y: originY })
    setDragging(true)
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      applyPosition(
        {
          x: drag.originX + (moveEvent.clientX - drag.startX),
          y: drag.originY + (moveEvent.clientY - drag.startY),
        },
        false,
      )
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setDragging(false)
      stopDragListeners()
      if (positionRef.current) applyPosition(positionRef.current, true)
    }
    stopDragListeners()
    dragListenersRef.current = { move: onMove, up: onUp }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  const publishStatus = publicationLoaded ? (published ? "published" : "unpublished") : undefined
  const publishStatusLabel = published
    ? t("workspace.programme.publishBadgeOn")
    : t("workspace.programme.publishBadgeOff")

  const sections: ToolbarItem[][] = []

  for (const group of groups) {
    const items: ToolbarItem[] = group.sections.map((section) => {
      const name = t(`workspace.programme.nav.${section}`)
      const publishLabel =
        section === "publish" && publicationLoaded ? `${name} — ${publishStatusLabel}` : name
      return {
        id: section,
        label: publishLabel,
        ariaLabel:
          section === "publish"
            ? t("workspace.programme.publishBadgeAria", undefined, { status: publishStatusLabel })
            : name,
        icon: SECTION_ICONS[section],
        active: sheetOpen && activeSection === section,
        onClick: () => onSection(section),
        status: section === "publish" ? publishStatus : undefined,
      }
    })
    if (group.id === "output" && canAccessSettings && onSaveAsTemplate) {
      items.push({
        id: "save-template",
        label: t("workspace.programme.saveAsTemplate"),
        ariaLabel: t("workspace.programme.saveAsTemplate"),
        icon: LayoutTemplate,
        onClick: onSaveAsTemplate,
      })
    }
    if (items.length > 0) sections.push(items)
  }

  if (sections.length === 0 && !chrome) return null

  const tools = (
    <>
      {chrome ? (
        <>
          {floating ? <ToolbarDivider /> : null}
          {chrome}
        </>
      ) : null}
      {sections.map((items, index) => (
        <div key={items.map((item) => item.id).join("-")} className="flex items-center">
          {chrome || index > 0 ? <ToolbarDivider /> : null}
          {items.map((item) => (
            <ToolbarButton key={item.id} item={item} />
          ))}
        </div>
      ))}
    </>
  )

  const dockToggle = (
    <IconTooltip
      label={floating ? t("workspace.programme.toolbarDock") : t("workspace.programme.toolbarFloat")}
      side="bottom"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={!floating}
        aria-label={floating ? t("workspace.programme.toolbarDock") : t("workspace.programme.toolbarFloat")}
        onClick={toggleDock}
      >
        {floating ? <PanelTop className="h-4 w-4" /> : <PictureInPicture2 className="h-4 w-4" />}
      </Button>
    </IconTooltip>
  )

  if (!floating) {
    return (
      <div
        ref={shellRef}
        data-programme-toolbar=""
        className="relative z-[60] shrink-0 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75"
      >
        <nav
          aria-label={t("workspace.programme.navAria")}
          className="flex h-10 items-center justify-center overflow-x-auto px-3"
        >
          {tools}
          <ToolbarDivider />
          {dockToggle}
        </nav>
      </div>
    )
  }

  return (
    <div
      ref={shellRef}
      data-programme-toolbar=""
      className={cn(
        "pointer-events-auto absolute z-[60] max-w-[calc(100%-1rem)]",
        position ? null : "top-20 right-4",
        dragging && "select-none",
      )}
      style={position ? { left: position.x, top: position.y } : undefined}
    >
      <nav
        aria-label={t("workspace.programme.navAria")}
        aria-expanded={!collapsed}
        className="flex items-center overflow-x-auto rounded-full border bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur-md"
      >
        <IconTooltip label={t("workspace.programme.toolbarMove")} side="bottom">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("workspace.programme.toolbarMove")}
            className={cn("touch-none cursor-grab text-muted-foreground", dragging && "cursor-grabbing")}
            onPointerDown={startDrag}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
        </IconTooltip>
        {collapsed ? null : tools}
        <ToolbarDivider />
        <IconTooltip
          label={collapsed ? t("workspace.programme.toolbarExpand") : t("workspace.programme.toolbarCollapse")}
          side="bottom"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("workspace.programme.toolbarExpand") : t("workspace.programme.toolbarCollapse")}
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
          </Button>
        </IconTooltip>
        <ToolbarDivider />
        {dockToggle}
      </nav>
    </div>
  )
}
