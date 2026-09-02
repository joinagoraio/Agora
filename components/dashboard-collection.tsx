"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { FolderKanban, Info, Layers2, Pin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { IconTooltip } from "@/components/icon-tooltip"
import { ViewModeToggle, useCollectionViewMode } from "@/components/view-mode-toggle"
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
}: {
  title: string
  subtitle: string
  titleHint?: string
  titleHintLabel?: string
  items: DashboardCollectionItem[]
  kind: DashboardCollectionKind | "pinned"
  headerAction?: ReactNode
  empty?: ReactNode
  fill?: boolean
  onTogglePin?: (item: DashboardCollectionItem) => void
}) {
  const { t } = useI18n()
  const { viewMode, setViewMode } = useCollectionViewMode(items.length, `dashboard.${kind}`)
  const defaultIcon = kind === "authority" ? Layers2 : FolderKanban

  return (
    <section
      className={cn("flex flex-col overflow-hidden", fill ? "min-h-0 flex-1" : "max-h-[40vh] shrink-0")}
    >
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-2xl font-semibold">{title}</h2>
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
          {items.length > 0 && (
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {items.length === 0 ? (
          empty ? <div className="min-h-0 flex-1 overflow-y-auto">{empty}</div> : null
        ) : viewMode === "grid" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-6 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const Icon = item.kind === "authority" ? Layers2 : item.kind === "programme" ? FolderKanban : defaultIcon
                return (
                  <Card key={`${item.kind ?? kind}-${item.id}`} className="group relative transition-all hover:shadow-md">
                    {onTogglePin ? (
                      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                        <PinToggle item={item} onTogglePin={onTogglePin} />
                      </div>
                    ) : null}
                    <Link href={item.href} className={cn("block", onTogglePin && "pr-10")}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Icon className="h-5 w-5 shrink-0 text-primary" />
                            <CardTitle className="mt-0">{item.title}</CardTitle>
                          </div>
                          {item.badge ? (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                              {item.badge}
                            </span>
                          ) : null}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {item.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                        ) : null}
                      </CardContent>
                    </Link>
                  </Card>
                )
              })}
            </div>
          </div>
        ) : (
          <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow">
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
              <div className="divide-y divide-border">
                {items.map((item) => {
                  const Icon = item.kind === "authority" ? Layers2 : item.kind === "programme" ? FolderKanban : defaultIcon
                  return (
                    <div
                      key={`${item.kind ?? kind}-${item.id}`}
                      className="group relative flex items-stretch transition-colors hover:bg-muted/50"
                    >
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
                        <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
                          <PinToggle item={item} onTogglePin={onTogglePin} />
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  )
}

function PinToggle({
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
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label={label}
        aria-pressed={Boolean(item.pinned)}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onTogglePin(item)
        }}
      >
        <Pin className={cn("h-4 w-4", item.pinned && "fill-current text-primary")} />
      </Button>
    </IconTooltip>
  )
}
