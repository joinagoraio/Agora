"use client"

import { type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react"
import Link from "next/link"
import { FolderKanban, GripVertical, Info, Layers2, Star } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { IconTooltip } from "@/components/icon-tooltip"
import { ViewModeToggle, useCollectionViewMode } from "@/components/view-mode-toggle"
import { favoriteItemKey, useFavoriteReorder } from "@/components/use-favorite-reorder"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"

export type DashboardCollectionKind = "programme" | "authority"

export type DashboardCollectionItem = {
  id: string
  href: string
  title: string
  description?: string | null
  badge?: string
  kind?: DashboardCollectionKind
  pinned?: boolean
}

export function DashboardCollection({
  title,
  subtitle,
  titleHint,
  titleHintLabel,
  items,
  kind,
  headerAction,
  empty,
  fill = true,
  onTogglePin,
  onReorder,
}: {
  title: string
  subtitle: string
  titleHint?: string
  titleHintLabel?: string
  items: DashboardCollectionItem[]
  kind: DashboardCollectionKind | "pinned" | "favorites"
  headerAction?: ReactNode
  empty?: ReactNode
  fill?: boolean
  onTogglePin?: (item: DashboardCollectionItem) => void
  onReorder?: (items: DashboardCollectionItem[]) => void
}) {
  const { t } = useI18n()
  const isFavorites = kind === "favorites"
  const collectionItems = items
  const { viewMode, setViewMode } = useCollectionViewMode(collectionItems.length, `dashboard.${kind}`)
  const reorderable = isFavorites && Boolean(onReorder) && collectionItems.length > 1
  const reorder = useFavoriteReorder({
    enabled: reorderable,
    items: collectionItems,
    layout: viewMode,
    onReorder,
  })

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden",
        fill ? "min-h-0 flex-1" : "shrink-0",
        !fill && !isFavorites ? "max-h-[40vh]" : null,
      )}
    >
      <div className={cn("flex shrink-0 flex-wrap items-center justify-between gap-3", isFavorites ? "mb-2" : "mb-4")}>
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className={cn("font-semibold", isFavorites ? "text-xl" : "text-2xl")}>{title}</h2>
            {titleHint ? (
              <IconTooltip label={titleHint} side="bottom" contentClassName="max-w-xs text-pretty">
                <button
                  type="button"
                  className="inline-flex rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={titleHintLabel ?? titleHint}
                >
                  <Info className="h-4 w-4" />
                </button>
              </IconTooltip>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {collectionItems.length > 0 && (
            <ViewModeToggle
              viewMode={viewMode}
              onChange={setViewMode}
              listLabel={t("dashboard.viewList")}
              gridLabel={t("dashboard.viewGrid")}
            />
          )}
          {headerAction}
        </div>
      </div>
      <div
        data-favorite-scroll={isFavorites ? "" : undefined}
        className={cn(
          "min-h-0",
          fill && "flex min-h-0 flex-1 flex-col overflow-hidden",
          isFavorites && "max-h-40 overflow-y-auto",
          reorder.draggingKey && "select-none",
        )}
      >
        {collectionItems.length === 0 ? (
          empty ? <div className="scrollbar-on-hover min-h-0 flex-1 overflow-y-auto">{empty}</div> : null
        ) : viewMode === "grid" ? (
          <div className={cn("scrollbar-on-hover min-h-0 overflow-y-auto", fill && "flex-1")}>
            <div
              ref={reorder.containerRef}
              className={cn(
                "grid pb-2",
                isFavorites ? "gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "gap-6 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {renderFavoriteItems(
                reorder.rest,
                reorder.draggingKey ? reorder.placeholderAt : null,
                <div
                  key="favorite-placeholder"
                  className="rounded-xl border border-dashed border-primary/40 bg-primary/5"
                  style={{ minHeight: reorder.preview?.height ?? 72 }}
                />,
                (item) => (
                  <CollectionCard
                    key={favoriteItemKey(item)}
                    item={item}
                    fallbackKind={item.kind === "authority" || kind === "authority" ? "authority" : "programme"}
                    onTogglePin={onTogglePin}
                    compact={isFavorites}
                    itemAttr={reorderable ? reorder.itemAttr : undefined}
                    onReorderPointerDown={
                      reorderable ? (event) => reorder.startDrag(event, item) : undefined
                    }
                    reorderLabel={t("dashboard.reorder", "Drag to reorder")}
                  />
                ),
              )}
            </div>
          </div>
        ) : (
          <CollectionList
            items={reorder.rest}
            fallbackKind={kind === "authority" ? "authority" : "programme"}
            onTogglePin={onTogglePin}
            fill={!isFavorites}
            containerRef={reorder.containerRef}
            itemAttr={reorderable ? reorder.itemAttr : undefined}
            placeholderAt={reorder.draggingKey ? reorder.placeholderAt : null}
            placeholderHeight={reorder.preview?.height}
            onReorderPointerDown={reorderable ? reorder.startDrag : undefined}
            reorderLabel={t("dashboard.reorder", "Drag to reorder")}
          />
        )}
      </div>
      {reorder.preview ? (
        <div
          ref={reorder.floaterRef}
          className="pointer-events-none fixed top-0 left-0 z-50 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-lg"
          style={{
            width: reorder.preview.width,
            minHeight: Math.min(reorder.preview.height, 56),
            transform: `translate3d(${reorder.preview.x}px, ${reorder.preview.y}px, 0)`,
          }}
        >
          {reorder.preview.title}
        </div>
      ) : null}
    </section>
  )
}

function renderFavoriteItems(
  items: DashboardCollectionItem[],
  placeholderAt: number | null,
  placeholder: ReactNode,
  render: (item: DashboardCollectionItem) => ReactNode,
) {
  if (placeholderAt == null) return items.map(render)
  return [...items.slice(0, placeholderAt).map(render), placeholder, ...items.slice(placeholderAt).map(render)]
}

function collectionIcon(kind?: DashboardCollectionKind) {
  return kind === "authority" ? Layers2 : FolderKanban
}

function CollectionCard({
  item,
  fallbackKind,
  onTogglePin,
  className,
  compact = false,
  itemAttr,
  onReorderPointerDown,
  reorderLabel,
}: {
  item: DashboardCollectionItem
  fallbackKind: DashboardCollectionKind
  onTogglePin?: (item: DashboardCollectionItem) => void
  className?: string
  compact?: boolean
  itemAttr?: string
  onReorderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  reorderLabel?: string
}) {
  const Icon = collectionIcon(item.kind ?? fallbackKind)
  return (
    <Card
      className={cn("group relative transition-all hover:shadow-md", onReorderPointerDown && "cursor-grab", className)}
      {...(itemAttr ? { [itemAttr]: favoriteItemKey(item) } : {})}
      onPointerDown={onReorderPointerDown}
    >
      {onReorderPointerDown ? (
        <div
          className={cn(
            "absolute left-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
            compact ? "left-2 top-1.5" : "left-3 top-2.5",
          )}
        >
          <ReorderHandle label={reorderLabel ?? ""} onPointerDown={onReorderPointerDown} />
        </div>
      ) : null}
      {onTogglePin ? (
        <div
          className={cn(
            "absolute right-3 top-2.5 z-10 transition-opacity",
            compact ? "right-3 top-2" : "right-6 top-3",
            item.pinned
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
          )}
        >
          <FavoriteToggle item={item} onTogglePin={onTogglePin} />
        </div>
      ) : null}
      <Link href={item.href} className="block">
        <CardHeader className={compact ? "p-3 pb-2" : undefined}>
          <div className={cn("flex min-w-0 items-center gap-3", onTogglePin && "pr-7", onReorderPointerDown && "pl-6")}>
            <Icon className={cn("shrink-0 text-primary", compact ? "h-4 w-4" : "h-5 w-5")} />
            <CardTitle className={cn("mt-0 min-w-0", compact && "text-base")}>{item.title}</CardTitle>
            {item.badge ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                {item.badge}
              </span>
            ) : null}
          </div>
        </CardHeader>
        {item.description ? (
          <CardContent className={compact ? "px-3 pb-3 pt-0" : undefined}>
            <p className={cn("text-sm text-muted-foreground", compact ? "line-clamp-1" : "line-clamp-2")}>
              {item.description}
            </p>
          </CardContent>
        ) : null}
      </Link>
    </Card>
  )
}

function CollectionList({
  items,
  fallbackKind,
  onTogglePin,
  fill = false,
  containerRef,
  itemAttr,
  placeholderAt,
  placeholderHeight,
  onReorderPointerDown,
  reorderLabel,
}: {
  items: DashboardCollectionItem[]
  fallbackKind: DashboardCollectionKind
  onTogglePin?: (item: DashboardCollectionItem) => void
  fill?: boolean
  containerRef?: Ref<HTMLDivElement>
  itemAttr?: string
  placeholderAt?: number | null
  placeholderHeight?: number
  onReorderPointerDown?: (event: ReactPointerEvent<HTMLElement>, item: DashboardCollectionItem) => void
  reorderLabel?: string
}) {
  const rows = (
    <CollectionListRows
      items={items}
      fallbackKind={fallbackKind}
      onTogglePin={onTogglePin}
      containerRef={containerRef}
      itemAttr={itemAttr}
      placeholderAt={placeholderAt}
      placeholderHeight={placeholderHeight}
      onReorderPointerDown={onReorderPointerDown}
      reorderLabel={reorderLabel}
    />
  )
  return (
    <Card className={cn("flex flex-col gap-0 overflow-hidden py-0 shadow", fill && "min-h-0 flex-1")}>
      <CardContent className={cn("relative overflow-hidden p-0", fill && "min-h-0 flex-1")}>
        {fill ? (
          <ScrollArea type="hover" scrollHideDelay={0} className="h-full">
            {rows}
          </ScrollArea>
        ) : (
          rows
        )}
      </CardContent>
    </Card>
  )
}

function CollectionListRows({
  items,
  fallbackKind,
  onTogglePin,
  containerRef,
  itemAttr,
  placeholderAt,
  placeholderHeight,
  onReorderPointerDown,
  reorderLabel,
}: {
  items: DashboardCollectionItem[]
  fallbackKind: DashboardCollectionKind
  onTogglePin?: (item: DashboardCollectionItem) => void
  containerRef?: Ref<HTMLDivElement>
  itemAttr?: string
  placeholderAt?: number | null
  placeholderHeight?: number
  onReorderPointerDown?: (event: ReactPointerEvent<HTMLElement>, item: DashboardCollectionItem) => void
  reorderLabel?: string
}) {
  return (
    <div ref={containerRef} className="divide-y divide-border">
      {renderFavoriteItems(
        items,
        placeholderAt ?? null,
        <div
          key="favorite-placeholder"
          className="border-y border-dashed border-primary/40 bg-primary/5"
          style={{ height: placeholderHeight ?? 48 }}
        />,
        (item) => {
          const Icon = collectionIcon(item.kind ?? fallbackKind)
          return (
            <div
              key={favoriteItemKey(item)}
              className={cn(
                "group relative flex items-stretch transition-colors hover:bg-muted/50",
                onReorderPointerDown && "cursor-grab",
              )}
              {...(itemAttr ? { [itemAttr]: favoriteItemKey(item) } : {})}
              onPointerDown={onReorderPointerDown ? (event) => onReorderPointerDown(event, item) : undefined}
            >
              {onReorderPointerDown ? (
                <div className="flex items-center pl-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                  <ReorderHandle
                    label={reorderLabel ?? ""}
                    onPointerDown={(event) => onReorderPointerDown(event, item)}
                  />
                </div>
              ) : null}
              <Link
                href={item.href}
                className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)] items-center gap-4 px-4 py-3 text-sm"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{item.title}</span>
                  {item.badge ? (
                    <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.description ?? ""}</p>
              </Link>
              {onTogglePin ? (
                <div
                  className={cn(
                    "absolute right-4 top-1/2 z-10 -translate-y-1/2 transition-opacity",
                    item.pinned
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
                  )}
                >
                  <FavoriteToggle item={item} onTogglePin={onTogglePin} />
                </div>
              ) : null}
            </div>
          )
        },
      )}
    </div>
  )
}

function ReorderHandle({
  label,
  onPointerDown,
}: {
  label: string
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <button
      type="button"
      data-favorite-handle=""
      aria-label={label}
      className="inline-flex h-5 w-5 cursor-grab items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

function FavoriteToggle({
  item,
  onTogglePin,
}: {
  item: DashboardCollectionItem
  onTogglePin: (item: DashboardCollectionItem) => void
}) {
  const { t } = useI18n()
  const label = item.pinned ? t("dashboard.unpin") : t("dashboard.pin")
  return (
    <IconTooltip label={label}>
      <Button
        type="button"
        data-favorite-star=""
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        aria-label={label}
        aria-pressed={Boolean(item.pinned)}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onTogglePin(item)
        }}
      >
        <Star className={cn("h-4 w-4", item.pinned && "fill-current text-primary")} />
      </Button>
    </IconTooltip>
  )
}
