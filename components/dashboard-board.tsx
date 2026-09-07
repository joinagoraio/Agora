"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"

import { DashboardCollection, type DashboardCollectionItem } from "@/components/dashboard-collection"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  reorderDashboardPins,
  toggleDashboardPin,
  type DashboardPin,
  type DashboardPinKind,
} from "@/lib/actions/dashboard-pins"
import { useI18n } from "@/lib/i18n/use-i18n"

function pinKey(kind: DashboardPinKind, id: string) {
  return `${kind}:${id}`
}

function matchesDashboardSearch(item: DashboardCollectionItem, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const haystack = [item.title, item.description, item.badge]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
  return haystack.includes(normalized)
}

export function DashboardBoard({
  programmes,
  authorities,
  initialPins,
  programmeHeader,
  authorityHeader,
  programmeEmpty,
  authorityEmpty,
}: {
  programmes: DashboardCollectionItem[]
  authorities: DashboardCollectionItem[]
  initialPins: DashboardPin[]
  programmeHeader?: ReactNode
  authorityHeader?: ReactNode
  programmeEmpty: ReactNode
  authorityEmpty: ReactNode
}) {
  const { t } = useI18n()
  const [pins, setPins] = useState(() => initialPins.map((pin) => pinKey(pin.kind, pin.id)))
  const [searchQuery, setSearchQuery] = useState("")

  const pinSet = useMemo(() => new Set(pins), [pins])

  const withPinState = (items: DashboardCollectionItem[], kind: DashboardPinKind) =>
    items.map((item) => ({
      ...item,
      kind: item.kind ?? kind,
      pinned: pinSet.has(pinKey(item.kind ?? kind, item.id)),
    }))

  const programmeItems = withPinState(programmes, "programme")
  const authorityItems = withPinState(authorities, "authority")
  const unpinnedProgrammes = programmeItems.filter((item) => !item.pinned)
  const unpinnedAuthorities = authorityItems.filter((item) => !item.pinned)
  const filteredProgrammes = useMemo(
    () => unpinnedProgrammes.filter((item) => matchesDashboardSearch(item, searchQuery)),
    [unpinnedProgrammes, searchQuery],
  )
  const filteredAuthorities = useMemo(
    () => unpinnedAuthorities.filter((item) => matchesDashboardSearch(item, searchQuery)),
    [unpinnedAuthorities, searchQuery],
  )
  const hasSearchQuery = searchQuery.trim().length > 0
  const showSearch = programmes.length > 0 || authorities.length > 0
  const searchEmpty = (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {t("dashboard.search.noResults")}
      </CardContent>
    </Card>
  )
  const catalogue = [...programmeItems, ...authorityItems]
  const byKey = new Map(
    catalogue.map((item) => [pinKey((item.kind ?? "programme") as DashboardPinKind, item.id), item]),
  )
  const pinnedItems = pins.map((key) => byKey.get(key)).filter((item) => item != null)

  const handleTogglePin = async (item: DashboardCollectionItem) => {
    const kind = item.kind
    if (!kind) return
    const key = pinKey(kind, item.id)
    const nextPinned = !pinSet.has(key)
    setPins((current) => (nextPinned ? [key, ...current.filter((entry) => entry !== key)] : current.filter((entry) => entry !== key)))
    const result = await toggleDashboardPin(kind, item.id)
    if (result.error) {
      setPins((current) => (nextPinned ? current.filter((entry) => entry !== key) : [key, ...current]))
      toast.error(result.error)
    }
  }

  const handleReorderPins = async (nextItems: DashboardCollectionItem[]) => {
    const previous = pins
    const next = nextItems
      .map((item) => (item.kind ? pinKey(item.kind, item.id) : null))
      .filter((key): key is string => Boolean(key))
    setPins(next)
    const result = await reorderDashboardPins(
      nextItems.flatMap((item) => (item.kind ? [{ kind: item.kind, id: item.id }] : [])),
    )
    if (result.error) {
      setPins(previous)
      toast.error(result.error)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {pinnedItems.length > 0 ? (
        <>
          <DashboardCollection
            title={t("dashboard.pinned.title")}
            subtitle={t("dashboard.pinned.subtitle")}
            kind="favorites"
            fill={false}
            items={pinnedItems}
            onTogglePin={handleTogglePin}
            onReorder={handleReorderPins}
          />
          <Separator className="my-4 shrink-0 bg-border" />
        </>
      ) : null}

      {showSearch ? (
        <div className="relative mb-8 max-w-md shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("dashboard.search.placeholder")}
            aria-label={t("dashboard.search.label")}
            className="pl-10"
          />
        </div>
      ) : null}

      <DashboardCollection
        title={t("dashboard.workspaces.title")}
        subtitle={t("dashboard.workspaces.subtitle")}
        titleHint={t("dashboard.workspaces.hint")}
        titleHintLabel={t("dashboard.workspaces.hintLabel")}
        kind="programme"
        headerAction={programmeHeader}
        items={filteredProgrammes}
        onTogglePin={handleTogglePin}
        empty={unpinnedProgrammes.length === 0 ? programmeEmpty : hasSearchQuery ? searchEmpty : programmeEmpty}
      />

      <Separator className="my-8 shrink-0 bg-border" />

      <DashboardCollection
        title={t("dashboard.spaces.title")}
        subtitle={t("dashboard.spaces.subtitle")}
        titleHint={t("dashboard.spaces.hint")}
        titleHintLabel={t("dashboard.spaces.hintLabel")}
        kind="authority"
        headerAction={authorityHeader}
        items={filteredAuthorities}
        onTogglePin={handleTogglePin}
        empty={unpinnedAuthorities.length === 0 ? authorityEmpty : hasSearchQuery ? searchEmpty : authorityEmpty}
      />
    </div>
  )
}
