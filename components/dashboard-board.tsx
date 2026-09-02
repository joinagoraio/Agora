"use client"

import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { DashboardCollection, type DashboardCollectionItem } from "@/components/dashboard-collection"
import { Separator } from "@/components/ui/separator"
import { toggleDashboardPin, type DashboardPin, type DashboardPinKind } from "@/lib/actions/dashboard-pins"
import { useI18n } from "@/lib/i18n/use-i18n"

function pinKey(kind: DashboardPinKind, id: string) {
  return `${kind}:${id}`
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {pinnedItems.length > 0 ? (
        <>
          <DashboardCollection
            title={t("dashboard.pinned.title")}
            subtitle={t("dashboard.pinned.subtitle")}
            kind="pinned"
            fill={false}
            items={pinnedItems}
            onTogglePin={handleTogglePin}
          />
          <Separator className="my-4 shrink-0 bg-border" />
        </>
      ) : null}

      <DashboardCollection
        title={t("dashboard.workspaces.title")}
        subtitle={t("dashboard.workspaces.subtitle")}
        titleHint={t("dashboard.workspaces.hint")}
        titleHintLabel={t("dashboard.workspaces.hintLabel")}
        kind="programme"
        headerAction={programmeHeader}
        items={unpinnedProgrammes}
        onTogglePin={handleTogglePin}
        empty={programmeEmpty}
      />

      <Separator className="my-4 shrink-0 bg-border" />

      <DashboardCollection
        title={t("dashboard.spaces.title")}
        subtitle={t("dashboard.spaces.subtitle")}
        titleHint={t("dashboard.spaces.hint")}
        titleHintLabel={t("dashboard.spaces.hintLabel")}
        kind="authority"
        headerAction={authorityHeader}
        items={unpinnedAuthorities}
        onTogglePin={handleTogglePin}
        empty={authorityEmpty}
      />
    </div>
  )
}
