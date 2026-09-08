"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { LlmCollapsibleList } from "@/components/llm-collapsible-list"
import { LlmProviderCard } from "@/components/llm-provider-card"
import { LlmProviderKeyDialog } from "@/components/llm-provider-key-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  canStoreTenantApiKeys,
  LLM_ACCESS_POLICIES,
  type TenantLlmAccessPolicy,
} from "@/lib/llm/catalog"
import {
  clearTenantProviderCredential,
  getTenantLlmAdminState,
  saveTenantProviderCredential,
  setTenantLlmAccessPolicy,
  setTenantModelEnabled,
  setTenantProviderEnabled,
} from "@/lib/actions/tenant-llm"
import { compareLlmModelsForList, llmModelListPreviewCount } from "@/lib/llm/builtin-catalog"
import { notify, notifyResult, persistOrRevert } from "@/lib/notify"
import { cn } from "@/lib/utils"

type TenantLlmAdminState = NonNullable<Awaited<ReturnType<typeof getTenantLlmAdminState>>["data"]>
type CatalogModel = {
  id: string
  label: string
  model_id: string
  enabled?: boolean
  cost_hint?: string | null
  sort_order?: number
}

type Props = {
  tenantId: string
  embedded?: boolean
}

const adminStateCache = new Map<string, TenantLlmAdminState>()

export async function prefetchTenantLlmAdminState(tenantId: string) {
  const result = await getTenantLlmAdminState(tenantId)
  if (result.data) adminStateCache.set(tenantId, result.data)
}

export function TenantLlmAdmin({ tenantId, embedded = false }: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<TenantLlmAdminState | null>(() => adminStateCache.get(tenantId) ?? null)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})
  const [keyDialogId, setKeyDialogId] = useState<string | null>(null)

  const refresh = () => {
    startTransition(async () => {
      const result = await getTenantLlmAdminState(tenantId)
      if (result.error) {
        notify(result.error, "error")
        return
      }
      if (result.data) adminStateCache.set(tenantId, result.data)
      setState(result.data)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const enabledByModel = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of state?.settings || []) {
      map.set(row.model_id as string, Boolean(row.enabled))
    }
    return map
  }, [state?.settings])

  const enabledByProvider = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of state?.providerSettings || []) {
      map.set(row.provider_id as string, Boolean(row.enabled))
    }
    return map
  }, [state?.providerSettings])

  const patchState = (updater: (current: TenantLlmAdminState) => TenantLlmAdminState) => {
    setState((current) => {
      if (!current) return current
      const next = updater(current)
      adminStateCache.set(tenantId, next)
      return next
    })
  }

  const applyModelEnabled = (modelId: string, enabled: boolean) => {
    patchState((current) => {
      const settings = [...(current.settings || [])]
      const index = settings.findIndex((row) => row.model_id === modelId)
      if (index < 0) settings.push({ model_id: modelId, enabled })
      else settings[index] = { ...settings[index], enabled }
      return { ...current, settings }
    })
  }

  const applyProviderEnabled = (providerId: string, enabled: boolean) => {
    patchState((current) => {
      const providerSettings = [...(current.providerSettings || [])]
      const index = providerSettings.findIndex((row) => row.provider_id === providerId)
      if (index < 0) providerSettings.push({ provider_id: providerId, enabled })
      else providerSettings[index] = { ...providerSettings[index], enabled }
      return { ...current, providerSettings }
    })
  }

  const credentialProviders = useMemo(
    () => new Set((state?.credentials || []).map((row) => row.provider_id as string)),
    [state?.credentials],
  )

  if (!state) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <p className="sr-only">{t("admin.agents.loading")}</p>
        <div className="space-y-3 rounded-xl border p-6">
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="space-y-3 rounded-xl border p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    )
  }

  const policy = state.tenant?.llmAccessPolicy ?? "global"
  const keyPolicy = state.tenant?.llmKeyPolicy ?? "platform_only"
  const usesAgoraKeys = keyPolicy !== "allow_byok"
  const showKeys = canStoreTenantApiKeys({ accessPolicy: policy, keyPolicy })
  const keyProvider = (state.providers || []).find((provider: { id: string }) => provider.id === keyDialogId)

  return (
    <div className="space-y-6">
      {embedded ? null : (
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.agents.modelsDialogTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("admin.agents.modelsDialogDescription")}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.agents.policyTitle")}</CardTitle>
          <CardDescription>{t("admin.agents.policyDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {usesAgoraKeys ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {t("admin.agents.platformKeysOnly")}
            </p>
          ) : null}
          {LLM_ACCESS_POLICIES.map((value) => {
            const selected = policy === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  const previous = policy
                  patchState((current) => ({
                    ...current,
                    tenant: current.tenant ? { ...current.tenant, llmAccessPolicy: value } : current.tenant,
                  }))
                  persistOrRevert(
                    () => setTenantLlmAccessPolicy(tenantId, value as TenantLlmAccessPolicy),
                    () =>
                      patchState((current) => ({
                        ...current,
                        tenant: current.tenant ? { ...current.tenant, llmAccessPolicy: previous } : current.tenant,
                      })),
                    t("admin.agents.saved"),
                  )
                }}
                className={cn(
                  "w-full rounded-md border px-3 py-3 text-left transition-colors",
                  selected ? "border-foreground bg-muted/60" : "hover:bg-muted/40",
                )}
              >
                <p className="text-sm font-medium">{t(`admin.agents.policy.${value}.title`)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t(`admin.agents.policy.${value}.description`)}</p>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.agents.modelsTitle")}</CardTitle>
          <CardDescription>
            {policy === "authority_only"
              ? t("admin.agents.modelsDescriptionAuthorityOnly")
              : policy === "global_with_override"
                ? t("admin.agents.modelsDescriptionOverride")
                : t("admin.agents.modelsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(state.providers || []).map((provider: { id: string; label: string; llm_models?: CatalogModel[] }) => {
            const providerEnabled = enabledByProvider.get(provider.id) ?? true
            const models = [...(provider.llm_models || [])].sort((a, b) =>
              compareLlmModelsForList(
                {
                  ...a,
                  enabled: enabledByModel.get(a.id) ?? false,
                  providerId: provider.id,
                },
                {
                  ...b,
                  enabled: enabledByModel.get(b.id) ?? false,
                  providerId: provider.id,
                },
              ),
            )
            const enabledCount = models.filter((model) => enabledByModel.get(model.id)).length
            const hasKey = credentialProviders.has(provider.id)
            const description = [provider.id, hasKey ? t("admin.agents.keyStoredShort") : null]
              .filter(Boolean)
              .join(" · ")

            return (
              <LlmProviderCard
                key={provider.id}
                providerId={provider.id}
                title={provider.label}
                description={description}
                enabled={providerEnabled}
                enabledAriaLabel={t("admin.agents.providerEnabled")}
                onEnabledChange={(checked) => {
                  applyProviderEnabled(provider.id, checked)
                  persistOrRevert(
                    () => setTenantProviderEnabled(tenantId, provider.id, checked),
                    () => applyProviderEnabled(provider.id, !checked),
                    t("admin.agents.saved"),
                  )
                }}
                actions={
                  showKeys ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setKeyDialogId(provider.id)}>
                      {hasKey ? t("admin.agents.updateKey") : t("admin.agents.addKey")}
                    </Button>
                  ) : null
                }
                modelsLabel={t("admin.agents.manageModels")}
                modelsSummary={t("admin.agents.modelsEnabledCount", undefined, {
                  on: enabledCount,
                  total: models.length,
                })}
                models={
                  <LlmCollapsibleList
                    items={models}
                    getKey={(model) => model.id}
                    previewCount={llmModelListPreviewCount(enabledCount)}
                    showMoreLabel={(count) => t("admin.agents.showMoreModels", undefined, { count })}
                    showLessLabel={t("admin.agents.showLessModels")}
                    renderItem={(model) => {
                      const enabled = enabledByModel.get(model.id) ?? false
                      return (
                        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <p className="text-sm font-medium">{model.label}</p>
                          <Switch
                            checked={enabled}
                            disabled={!model.enabled || !providerEnabled}
                            onCheckedChange={(checked) => {
                              applyModelEnabled(model.id, checked)
                              persistOrRevert(
                                () => setTenantModelEnabled(tenantId, model.id, checked),
                                () => applyModelEnabled(model.id, !checked),
                                t("admin.agents.saved"),
                              )
                            }}
                          />
                        </div>
                      )
                    }}
                  />
                }
              />
            )
          })}
          {showKeys ? null : usesAgoraKeys ? null : (
            <p className="text-xs text-muted-foreground">{t("admin.agents.authorityKeysOnly")}</p>
          )}
        </CardContent>
      </Card>

      <LlmProviderKeyDialog
        open={Boolean(keyDialogId)}
        onOpenChange={(open) => {
          if (!open) setKeyDialogId(null)
        }}
        title={t("admin.agents.keyDialogTitle", undefined, { provider: keyProvider?.label || "" })}
        description={
          policy === "global_with_override" ? t("admin.agents.globalKeyOverrideHint") : t("admin.agents.globalKeyHint")
        }
        pending={pending}
        hasKey={Boolean(keyDialogId && credentialProviders.has(keyDialogId))}
        keyValue={keyDialogId ? apiKeys[keyDialogId] || "" : ""}
        onKeyChange={(value) => {
          if (keyDialogId) setApiKeys((current) => ({ ...current, [keyDialogId]: value }))
        }}
        keyLabel={t("admin.agents.apiKeyLabel", undefined, { provider: keyProvider?.label || "" })}
        keyPlaceholder={
          keyDialogId && credentialProviders.has(keyDialogId)
            ? t("admin.agents.apiKeySaved")
            : t("admin.agents.apiKeyPlaceholder")
        }
        endpointValue={keyDialogId ? endpoints[keyDialogId] || "" : ""}
        onEndpointChange={(value) => {
          if (keyDialogId) setEndpoints((current) => ({ ...current, [keyDialogId]: value }))
        }}
        endpointPlaceholder={t("admin.agents.endpoint")}
        saveLabel={t("admin.agents.saveKey")}
        clearLabel={t("admin.agents.clearKey")}
        cancelLabel={t("common.actions.cancel")}
        onSave={() => {
          if (!keyDialogId) return
          startTransition(async () => {
            const result = await saveTenantProviderCredential(
              tenantId,
              keyDialogId,
              apiKeys[keyDialogId] || "",
              endpoints[keyDialogId] || null,
            )
            notifyResult(result.error, t("admin.agents.keySaved"))
            if (!result.error) {
              setApiKeys((current) => ({ ...current, [keyDialogId]: "" }))
              setKeyDialogId(null)
              refresh()
            }
          })
        }}
        onClear={() => {
          if (!keyDialogId) return
          startTransition(async () => {
            const result = await clearTenantProviderCredential(tenantId, keyDialogId)
            notifyResult(result.error, t("admin.agents.keyCleared"))
            if (!result.error) {
              setKeyDialogId(null)
              refresh()
            }
          })
        }}
      />
    </div>
  )
}
