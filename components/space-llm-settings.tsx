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
  clearSpaceProviderCredential,
  copyTenantLlmDefaultsToSpace,
  getSpaceLlmAdminState,
  resetSpaceLlmOverrides,
  saveSpaceProviderCredential,
  setSpaceModelEnabled,
  setSpaceProviderEnabled,
} from "@/lib/actions/space-llm"
import { compareLlmModelsForList, llmModelListPreviewCount } from "@/lib/llm/builtin-catalog"
import { notify, notifyResult, persistOrRevert } from "@/lib/notify"

type Props = {
  spaceId: string
  compact?: boolean
  hideHeading?: boolean
}

export function SpaceLlmSettings({ spaceId, compact = false, hideHeading = false }: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<Awaited<ReturnType<typeof getSpaceLlmAdminState>>["data"]>(null)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})
  const [keyDialogId, setKeyDialogId] = useState<string | null>(null)

  const refresh = () => {
    startTransition(async () => {
      const result = await getSpaceLlmAdminState(spaceId)
      if (result.error) {
        notify(result.error, "error")
        return
      }
      setState(result.data)
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  const spaceModel = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of state?.settings || []) map.set(row.model_id as string, Boolean(row.enabled))
    return map
  }, [state?.settings])

  const tenantModel = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of state?.tenantSettings || []) map.set(row.model_id as string, Boolean(row.enabled))
    return map
  }, [state?.tenantSettings])

  const spaceProvider = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of state?.providerSettings || []) map.set(row.provider_id as string, Boolean(row.enabled))
    return map
  }, [state?.providerSettings])

  const tenantProvider = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const row of state?.tenantProviderSettings || []) map.set(row.provider_id as string, Boolean(row.enabled))
    return map
  }, [state?.tenantProviderSettings])

  const credentialProviders = useMemo(
    () => new Set((state?.credentials || []).map((row) => row.provider_id as string)),
    [state?.credentials],
  )

  type SpaceLlmState = NonNullable<Awaited<ReturnType<typeof getSpaceLlmAdminState>>["data"]>

  const patchState = (updater: (current: SpaceLlmState) => SpaceLlmState) => {
    setState((current) => (current ? updater(current) : current))
  }

  const applyModelEnabled = (modelId: string, enabled: boolean) => {
    patchState((current) => {
      const settings = [...(current.settings || [])]
      const index = settings.findIndex((row: { model_id: string }) => row.model_id === modelId)
      if (index < 0) settings.push({ model_id: modelId, enabled })
      else settings[index] = { ...settings[index], enabled }
      return { ...current, settings }
    })
  }

  const applyProviderEnabled = (providerId: string, enabled: boolean) => {
    patchState((current) => {
      const providerSettings = [...(current.providerSettings || [])]
      const index = providerSettings.findIndex((row: { provider_id: string }) => row.provider_id === providerId)
      if (index < 0) providerSettings.push({ provider_id: providerId, enabled })
      else providerSettings[index] = { ...providerSettings[index], enabled }
      return { ...current, providerSettings }
    })
  }

  if (!state) {
    return <p className="text-sm text-muted-foreground">{t("admin.agents.loading")}</p>
  }

  if (!state.canOverrideCatalog && !state.canStoreKeys) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("space.agents.modelsGlobalOnly")}</p>
        {state.usesAgoraKeys ? (
          <p className="text-sm text-muted-foreground">{t("admin.agents.platformKeysOnly")}</p>
        ) : null}
      </div>
    )
  }

  const inherit = state.policy === "global_with_override"

  return (
    <Card className={compact ? "shadow-none" : undefined}>
      <CardHeader>
        {hideHeading ? null : <CardTitle>{t("space.agents.modelsTitle")}</CardTitle>}
        <CardDescription>
          {state.policy === "authority_only"
            ? t("space.agents.modelsDescriptionAuthorityOnly")
            : t("space.agents.modelsDescriptionOverride")}
          {state.usesAgoraKeys ? ` ${t("admin.agents.platformKeysOnly")}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.canOverrideCatalog ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await copyTenantLlmDefaultsToSpace(spaceId)
                  notifyResult(result.error, t("space.agents.copiedDefaults"))
                  refresh()
                })
              }
            >
              {t("space.agents.copyDefaults")}
            </Button>
            {inherit ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await resetSpaceLlmOverrides(spaceId)
                    notifyResult(result.error, t("space.agents.resetOverrides"))
                    refresh()
                  })
                }
              >
                {t("space.agents.resetOverrides")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {(state.providers || []).map((provider: any) => {
          const providerEnabled = spaceProvider.has(provider.id)
            ? Boolean(spaceProvider.get(provider.id))
            : inherit
              ? (tenantProvider.get(provider.id) ?? true)
              : false
          const models = [...(provider.llm_models || [])].sort((a: any, b: any) =>
            compareLlmModelsForList(
              {
                ...a,
                enabled: spaceModel.has(a.id)
                  ? Boolean(spaceModel.get(a.id))
                  : inherit
                    ? (tenantModel.get(a.id) ?? false)
                    : false,
                providerId: provider.id,
              },
              {
                ...b,
                enabled: spaceModel.has(b.id)
                  ? Boolean(spaceModel.get(b.id))
                  : inherit
                    ? (tenantModel.get(b.id) ?? false)
                    : false,
                providerId: provider.id,
              },
            ),
          )
          const enabledCount = models.filter((model: any) =>
            spaceModel.has(model.id)
              ? Boolean(spaceModel.get(model.id))
              : inherit
                ? (tenantModel.get(model.id) ?? false)
                : false,
          ).length
          const hasKey = credentialProviders.has(provider.id)
          const description = [
            spaceProvider.has(provider.id)
              ? t("space.agents.overrideActive")
              : inherit
                ? t("space.agents.usingOrganisation")
                : provider.id,
            hasKey ? t("admin.agents.keyStoredShort") : null,
          ]
            .filter(Boolean)
            .join(" · ")

          return (
            <LlmProviderCard
              key={provider.id}
              providerId={provider.id}
              title={provider.label}
              description={description}
              enabled={providerEnabled}
              showEnabledSwitch={state.canOverrideCatalog}
              enabledAriaLabel={t("admin.agents.providerEnabled")}
              onEnabledChange={(checked) => {
                applyProviderEnabled(provider.id, checked)
                persistOrRevert(
                  () => setSpaceProviderEnabled(spaceId, provider.id, checked),
                  () => applyProviderEnabled(provider.id, !checked),
                  t("admin.agents.saved"),
                )
              }}
              actions={
                state.canStoreKeys ? (
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
                state.canOverrideCatalog ? (
                  <LlmCollapsibleList
                    items={models}
                    getKey={(model: { id: string }) => model.id}
                    previewCount={llmModelListPreviewCount(enabledCount)}
                    showMoreLabel={(count) => t("admin.agents.showMoreModels", undefined, { count })}
                    showLessLabel={t("admin.agents.showLessModels")}
                    renderItem={(model: any) => {
                      const enabled = spaceModel.has(model.id)
                        ? Boolean(spaceModel.get(model.id))
                        : inherit
                          ? (tenantModel.get(model.id) ?? false)
                          : false
                      return (
                        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <p className="text-sm font-medium">{model.label}</p>
                          <Switch
                            checked={enabled}
                            disabled={!model.enabled || !providerEnabled}
                            onCheckedChange={(checked) => {
                              applyModelEnabled(model.id, checked)
                              persistOrRevert(
                                () => setSpaceModelEnabled(spaceId, model.id, checked),
                                () => applyModelEnabled(model.id, !checked),
                                t("admin.agents.saved"),
                              )
                            }}
                          />
                        </div>
                      )
                    }}
                  />
                ) : undefined
              }
            />
          )
        })}
      </CardContent>

      <LlmProviderKeyDialog
        open={Boolean(keyDialogId)}
        onOpenChange={(open) => {
          if (!open) setKeyDialogId(null)
        }}
        title={t("admin.agents.keyDialogTitle", undefined, {
          provider: (state.providers || []).find((provider: { id: string }) => provider.id === keyDialogId)?.label || "",
        })}
        description={
          state.policy === "authority_only"
            ? t("space.agents.authorityKeyRequired")
            : t("space.agents.authorityKeyOptional")
        }
        pending={pending}
        hasKey={Boolean(keyDialogId && credentialProviders.has(keyDialogId))}
        keyValue={keyDialogId ? apiKeys[keyDialogId] || "" : ""}
        onKeyChange={(value) => {
          if (keyDialogId) setApiKeys((current) => ({ ...current, [keyDialogId]: value }))
        }}
        keyLabel={t("admin.agents.apiKeyLabel", undefined, {
          provider: (state.providers || []).find((provider: { id: string }) => provider.id === keyDialogId)?.label || "",
        })}
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
            const result = await saveSpaceProviderCredential(
              spaceId,
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
            const result = await clearSpaceProviderCredential(spaceId, keyDialogId)
            notifyResult(result.error, t("admin.agents.keyCleared"))
            if (!result.error) {
              setKeyDialogId(null)
              refresh()
            }
          })
        }}
      />
    </Card>
  )
}
