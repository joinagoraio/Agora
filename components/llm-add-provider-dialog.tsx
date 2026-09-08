"use client"

import { useEffect, useMemo, useState } from "react"
import { LlmProviderIcon } from "@/components/llm-provider-icon"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  canAddBuiltinProvider,
  compareLlmModelsForList,
  previouslyEnabledModelIds,
  type BuiltinProvider,
} from "@/lib/llm/builtin-catalog"
import { cn } from "@/lib/utils"

export type AddableCatalogModel = {
  id: string
  label: string
  model_id: string
  enabled?: boolean
  provider_id?: string
  sort_order?: number
  cost_hint?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: BuiltinProvider[]
  modelsByProvider: Record<string, AddableCatalogModel[]>
  keyedProviderIds?: Iterable<string>
  pending?: boolean
  onAdd: (providerId: string, enabledModelIds: string[]) => void
}

export function LlmAddProviderDialog({
  open,
  onOpenChange,
  providers,
  modelsByProvider,
  keyedProviderIds,
  pending = false,
  onAdd,
}: Props) {
  const { t } = useI18n()
  const [providerId, setProviderId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const storedKeys = useMemo(() => new Set(keyedProviderIds || []), [keyedProviderIds])

  const models = useMemo(() => {
    const rows = providerId ? modelsByProvider[providerId] || [] : []
    return rows.slice().sort((a, b) =>
      compareLlmModelsForList(
        { ...a, providerId: a.provider_id || providerId || undefined },
        { ...b, providerId: b.provider_id || providerId || undefined },
      ),
    )
  }, [modelsByProvider, providerId])
  const chosen = providers.find((provider) => provider.id === providerId && canAddBuiltinProvider(provider))

  useEffect(() => {
    if (!open) {
      setProviderId(null)
      setSelected(new Set())
      return
    }
    if (providerId && !providers.some((provider) => provider.id === providerId)) {
      setProviderId(null)
      setSelected(new Set())
    }
  }, [open, providerId, providers])

  useEffect(() => {
    if (!providerId) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(previouslyEnabledModelIds(modelsByProvider[providerId] || [])))
  }, [modelsByProvider, providerId])

  const toggle = (modelId: string, enabled: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (enabled) next.add(modelId)
      else next.delete(modelId)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("admin.platform.addProviderTitle")}</DialogTitle>
          <DialogDescription>{t("admin.platform.addProviderHint")}</DialogDescription>
        </DialogHeader>

        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.platform.addProviderEmpty")}</p>
        ) : !chosen ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t("admin.platform.addProviderChoose")}</p>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {providers.map((provider) => {
                const addable = canAddBuiltinProvider(provider)
                const hasKey = storedKeys.has(provider.id)
                const className = cn(
                  "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left",
                  addable ? "hover:bg-muted/40" : "cursor-not-allowed opacity-60",
                )
                const body = (
                  <>
                    <LlmProviderIcon providerId={provider.id} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{provider.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {provider.id}
                        {hasKey ? ` · ${t("admin.platform.addProviderKeyStored")}` : ""}
                      </span>
                      {addable ? null : (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t("admin.platform.addProviderUnavailable")}
                        </span>
                      )}
                    </span>
                  </>
                )
                if (!addable) {
                  return (
                    <div key={provider.id} className={className} aria-disabled>
                      {body}
                    </div>
                  )
                }
                return (
                  <button
                    key={provider.id}
                    type="button"
                    disabled={pending}
                    onClick={() => setProviderId(provider.id)}
                    className={className}
                  >
                    {body}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <LlmProviderIcon providerId={chosen.id} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{chosen.label}</p>
                <p className="text-xs text-muted-foreground">{chosen.id}</p>
              </div>
            </div>
            {storedKeys.has(chosen.id) ? (
              <p className="text-xs text-muted-foreground">{t("admin.platform.addProviderKeyKept")}</p>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">{t("admin.platform.addProviderModels")}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={pending || models.length === 0}
                  onClick={() => setSelected(new Set(models.map((model) => model.id)))}
                >
                  {t("admin.platform.addProviderSelectAll")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={pending || selected.size === 0}
                  onClick={() => setSelected(new Set())}
                >
                  {t("admin.platform.addProviderSelectNone")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("admin.platform.addProviderModelsHint")}</p>
            <div className="max-h-[40vh] space-y-2 overflow-y-auto">
              {models.map((model) => {
                const on = selected.has(model.id)
                return (
                  <label
                    key={model.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                      on ? "bg-muted/40" : "",
                    )}
                  >
                    <span className="text-sm font-medium">{model.label}</span>
                    <Switch
                      checked={on}
                      disabled={pending}
                      onCheckedChange={(checked) => toggle(model.id, checked)}
                      aria-label={model.label}
                    />
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          {chosen ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setProviderId(null)}>
              {t("admin.platform.addProviderBack")}
            </Button>
          ) : (
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("common.actions.cancel")}
            </Button>
          )}
          <Button
            type="button"
            disabled={pending || !chosen}
            onClick={() => {
              if (!chosen) return
              onAdd(chosen.id, [...selected])
            }}
          >
            {t("admin.platform.addProvider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
