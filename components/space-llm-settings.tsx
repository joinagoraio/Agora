"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { notify, notifyResult } from "@/lib/notify"

type Props = {
  spaceId: string
  compact?: boolean
}

export function SpaceLlmSettings({ spaceId, compact = false }: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<Awaited<ReturnType<typeof getSpaceLlmAdminState>>["data"]>(null)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})

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
        <CardTitle>{t("space.agents.modelsTitle")}</CardTitle>
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
          return (
            <div key={provider.id} className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{provider.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {spaceProvider.has(provider.id)
                      ? t("space.agents.overrideActive")
                      : inherit
                        ? t("space.agents.usingOrganisation")
                        : provider.id}
                  </p>
                </div>
                {state.canOverrideCatalog ? (
                  <Switch
                    checked={providerEnabled}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      startTransition(async () => {
                        const result = await setSpaceProviderEnabled(spaceId, provider.id, checked)
                        notifyResult(result.error, t("admin.agents.saved"))
                        refresh()
                      })
                    }
                  />
                ) : null}
              </div>
              {state.canOverrideCatalog ? (
                <div className="space-y-2">
                  {(provider.llm_models || []).map((model: any) => {
                    const enabled = spaceModel.has(model.id)
                      ? Boolean(spaceModel.get(model.id))
                      : inherit
                        ? (tenantModel.get(model.id) ?? false)
                        : false
                    return (
                      <div key={model.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{model.label}</p>
                          <p className="text-xs text-muted-foreground">{model.model_id}</p>
                        </div>
                        <Switch
                          checked={enabled}
                          disabled={pending || !model.enabled || !providerEnabled}
                          onCheckedChange={(checked) =>
                            startTransition(async () => {
                              const result = await setSpaceModelEnabled(spaceId, model.id, checked)
                              notifyResult(result.error, t("admin.agents.saved"))
                              refresh()
                            })
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {state.canStoreKeys ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    {state.policy === "authority_only"
                      ? t("space.agents.authorityKeyRequired")
                      : t("space.agents.authorityKeyOptional")}
                  </p>
                  <Label htmlFor={`${provider.id}-space-key`}>
                    {t("admin.agents.apiKeyLabel", undefined, { provider: provider.label })}
                  </Label>
                  <Input
                    id={`${provider.id}-space-key`}
                    type="password"
                    value={apiKeys[provider.id] || ""}
                    onChange={(event) => setApiKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                    placeholder={
                      credentialProviders.has(provider.id)
                        ? t("admin.agents.apiKeySaved")
                        : t("admin.agents.apiKeyPlaceholder")
                    }
                  />
                  <Input
                    value={endpoints[provider.id] || ""}
                    onChange={(event) => setEndpoints((current) => ({ ...current, [provider.id]: event.target.value }))}
                    placeholder={t("admin.agents.endpoint")}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending || !apiKeys[provider.id]?.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await saveSpaceProviderCredential(
                            spaceId,
                            provider.id,
                            apiKeys[provider.id] || "",
                            endpoints[provider.id] || null,
                          )
                          notifyResult(result.error, t("admin.agents.keySaved"))
                          if (!result.error) {
                            setApiKeys((current) => ({ ...current, [provider.id]: "" }))
                            refresh()
                          }
                        })
                      }
                    >
                      {t("admin.agents.saveKey")}
                    </Button>
                    {credentialProviders.has(provider.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await clearSpaceProviderCredential(spaceId, provider.id)
                            notifyResult(result.error, t("admin.agents.keyCleared"))
                            refresh()
                          })
                        }
                      >
                        {t("admin.agents.clearKey")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
