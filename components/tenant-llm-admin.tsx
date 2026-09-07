"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { notify, notifyResult } from "@/lib/notify"
import { cn } from "@/lib/utils"

type Props = {
  tenantId: string
  embedded?: boolean
}

export function TenantLlmAdmin({ tenantId, embedded = false }: Props) {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<Awaited<ReturnType<typeof getTenantLlmAdminState>>["data"]>(null)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})

  const refresh = () => {
    startTransition(async () => {
      const result = await getTenantLlmAdminState(tenantId)
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

  const credentialProviders = useMemo(
    () => new Set((state?.credentials || []).map((row) => row.provider_id as string)),
    [state?.credentials],
  )

  if (!state) {
    return <p className="text-sm text-muted-foreground">{t("admin.agents.loading")}</p>
  }

  const policy = state.tenant?.llmAccessPolicy ?? "global"
  const keyPolicy = state.tenant?.llmKeyPolicy ?? "platform_only"
  const usesAgoraKeys = keyPolicy !== "allow_byok"
  const showKeys = canStoreTenantApiKeys({ accessPolicy: policy, keyPolicy })

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
                disabled={pending}
                aria-pressed={selected}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setTenantLlmAccessPolicy(tenantId, value as TenantLlmAccessPolicy)
                    notifyResult(result.error, t("admin.agents.saved"))
                    refresh()
                  })
                }
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
        <CardContent className="space-y-4">
          {(state.providers || []).map((provider: any) => {
            const providerEnabled = enabledByProvider.get(provider.id) ?? true
            return (
            <div key={provider.id} className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{provider.label}</p>
                  <p className="text-xs text-muted-foreground">{provider.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${provider.id}-provider-enabled`} className="text-xs text-muted-foreground">
                    {t("admin.agents.providerEnabled")}
                  </Label>
                  <Switch
                    id={`${provider.id}-provider-enabled`}
                    checked={providerEnabled}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      startTransition(async () => {
                        const result = await setTenantProviderEnabled(tenantId, provider.id, checked)
                        notifyResult(result.error, t("admin.agents.saved"))
                        refresh()
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                {(provider.llm_models || []).map((model: any) => {
                  const enabled = enabledByModel.get(model.id) ?? false
                  return (
                    <div key={model.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{model.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {model.model_id}
                          {model.cost_hint ? ` · ${model.cost_hint}` : ""}
                        </p>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={pending || !model.enabled || !providerEnabled}
                        onCheckedChange={(checked) =>
                          startTransition(async () => {
                            const result = await setTenantModelEnabled(tenantId, model.id, checked)
                            notifyResult(result.error, t("admin.agents.saved"))
                            refresh()
                          })
                        }
                      />
                    </div>
                  )
                })}
              </div>
              {showKeys ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    {policy === "global_with_override"
                      ? t("admin.agents.globalKeyOverrideHint")
                      : t("admin.agents.globalKeyHint")}
                  </p>
                  <Label htmlFor={`${provider.id}-api-key`}>{t("admin.agents.apiKeyLabel", undefined, { provider: provider.label })}</Label>
                  <Input
                    id={`${provider.id}-api-key`}
                    type="password"
                    value={apiKeys[provider.id] || ""}
                    onChange={(event) => setApiKeys((current) => ({ ...current, [provider.id]: event.target.value }))}
                    placeholder={credentialProviders.has(provider.id) ? t("admin.agents.apiKeySaved") : t("admin.agents.apiKeyPlaceholder")}
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
                          const result = await saveTenantProviderCredential(
                            tenantId,
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
                            const result = await clearTenantProviderCredential(tenantId, provider.id)
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
              ) : usesAgoraKeys ? null : (
                <p className="border-t pt-3 text-xs text-muted-foreground">{t("admin.agents.authorityKeysOnly")}</p>
              )}
            </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
