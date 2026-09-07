"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  addCatalogModel,
  clearPlatformProviderCredential,
  createProvider,
  listPlatformCatalog,
  refreshProviderModels,
  savePlatformPrompt,
  savePlatformProviderCredential,
  setCatalogModelEnabled,
  setModelDefaultForTenants,
  setPlatformTaskModel,
  setProviderEnabled,
  setTenantKeyPolicyAsSuperAdmin,
  updateCatalogModelLabel,
  updateProvider,
} from "@/lib/actions/platform-llm"
import { LLM_ADAPTERS, PLATFORM_TASKS } from "@/lib/llm/catalog"
import { notify, notifyResult } from "@/lib/notify"

function reportModelSync(
  t: ReturnType<typeof useI18n>["t"],
  result: { error?: string; syncError?: string; imported?: number; listed?: number },
  savedKey: boolean,
) {
  if (result.error) {
    notify(result.error, "error")
    return
  }
  if (result.syncError) {
    notify(result.syncError, "error")
    return
  }
  notify(
    t(savedKey ? "admin.platform.modelsLoaded" : "admin.platform.modelsRefreshed", undefined, {
      count: String(result.listed ?? 0),
    }),
  )
}

export function PlatformLlmAdmin() {
  const { t } = useI18n()
  const [pending, startTransition] = useTransition()
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listPlatformCatalog>>["data"]>(null)
  const [providerForm, setProviderForm] = useState({
    id: "",
    label: "",
    adapter: "openai-compatible",
    endpoint: "",
    apiKey: "",
  })
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({})
  const [modelForms, setModelForms] = useState<Record<string, { modelId: string; label: string }>>({})
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({})

  const refresh = () => {
    startTransition(async () => {
      const result = await listPlatformCatalog()
      if (result.error) {
        notify(result.error, "error")
        return
      }
      setCatalog(result.data)
      const drafts: Record<string, string> = {}
      for (const prompt of result.data?.prompts || []) {
        drafts[(prompt as { id: string }).id] = (prompt as { body: string }).body
      }
      setPromptDrafts(drafts)
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const taskModelByTask = useMemo(
    () => new Map((catalog?.tasks || []).map((row: { task: string; model_id: string }) => [row.task, row.model_id])),
    [catalog?.tasks],
  )

  if (!catalog) {
    return <p className="text-sm text-muted-foreground">{t("admin.platform.loading")}</p>
  }

  const enabledModels = (catalog.models || []).filter((model: { enabled: boolean }) => model.enabled)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.platform.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.platform.subtitle")}</p>
      </div>
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">{t("admin.platform.tabProviders")}</TabsTrigger>
          <TabsTrigger value="tools">{t("admin.platform.tabTools")}</TabsTrigger>
          <TabsTrigger value="prompts">{t("admin.platform.tabPrompts")}</TabsTrigger>
          <TabsTrigger value="orgs">{t("admin.platform.tabOrgs")}</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.platform.addProviderTitle")}</CardTitle>
              <CardDescription>{t("admin.platform.addProviderHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder={t("admin.platform.providerId")}
                value={providerForm.id}
                onChange={(event) => setProviderForm((current) => ({ ...current, id: event.target.value }))}
              />
              <Input
                placeholder={t("admin.platform.providerLabel")}
                value={providerForm.label}
                onChange={(event) => setProviderForm((current) => ({ ...current, label: event.target.value }))}
              />
              <Select
                value={providerForm.adapter}
                onValueChange={(value) => setProviderForm((current) => ({ ...current, adapter: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LLM_ADAPTERS.map((adapter) => (
                    <SelectItem key={adapter} value={adapter}>
                      {adapter}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t("admin.platform.endpoint")}
                value={providerForm.endpoint}
                onChange={(event) => setProviderForm((current) => ({ ...current, endpoint: event.target.value }))}
              />
              <Input
                type="password"
                className="md:col-span-2"
                placeholder={t("admin.platform.apiKeyPlaceholder")}
                value={providerForm.apiKey}
                onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
              />
              <Button
                className="md:col-span-2"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const withKey = Boolean(providerForm.apiKey.trim())
                    const result = await createProvider(providerForm)
                    if (withKey) reportModelSync(t, result, true)
                    else notifyResult(result.error, t("admin.platform.saved"))
                    if (!result.error) {
                      setProviderForm({ id: "", label: "", adapter: "openai-compatible", endpoint: "", apiKey: "" })
                      refresh()
                    }
                  })
                }
              >
                {t("admin.platform.addProvider")}
              </Button>
            </CardContent>
          </Card>

          {(catalog.providers || []).map((provider: Record<string, unknown>) => {
            const providerId = provider.id as string
            const form = modelForms[providerId] || { modelId: "", label: "" }
            return (
              <Card key={providerId}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>{String(provider.label)}</CardTitle>
                    <CardDescription>
                      {providerId} · {String(provider.adapter || "openai-compatible")}
                      {provider.has_key ? ` · ${t("admin.platform.keyOnFile")}` : ` · ${t("admin.platform.noKey")}`}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={Boolean(provider.enabled)}
                    disabled={pending}
                    onCheckedChange={(checked) =>
                      startTransition(async () => {
                        const result = await setProviderEnabled(providerId, checked)
                        notifyResult(result.error, t("admin.platform.saved"))
                        refresh()
                      })
                    }
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="password"
                        value={providerKeys[providerId] || ""}
                        onChange={(event) =>
                          setProviderKeys((current) => ({ ...current, [providerId]: event.target.value }))
                        }
                        placeholder={
                          provider.has_key ? t("admin.platform.apiKeySaved") : t("admin.platform.apiKeyPlaceholder")
                        }
                      />
                      <Button
                        size="sm"
                        disabled={pending || !providerKeys[providerId]?.trim()}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await savePlatformProviderCredential(
                              providerId,
                              providerKeys[providerId] || "",
                            )
                            reportModelSync(t, result, true)
                            if (!result.error) {
                              setProviderKeys((current) => ({ ...current, [providerId]: "" }))
                              refresh()
                            }
                          })
                        }
                      >
                        {t("admin.platform.saveKey")}
                      </Button>
                      {provider.has_key ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await refreshProviderModels(providerId)
                                reportModelSync(t, result, false)
                                refresh()
                              })
                            }
                          >
                            {t("admin.platform.refreshModels")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await clearPlatformProviderCredential(providerId)
                                notifyResult(result.error, t("admin.platform.keyCleared"))
                                refresh()
                              })
                            }
                          >
                            {t("admin.platform.clearKey")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                    <Input
                      placeholder={t("admin.platform.endpoint")}
                      defaultValue={(provider.endpoint as string) || ""}
                      onBlur={(event) =>
                        startTransition(async () => {
                          const result = await updateProvider({
                            id: providerId,
                            label: String(provider.label),
                            adapter: String(provider.adapter || "openai-compatible"),
                            endpoint: event.target.value,
                          })
                          if (result.error) notify(result.error, "error")
                        })
                      }
                    />
                    {!provider.has_key ? (
                      <p className="text-xs text-muted-foreground">{t("admin.platform.noKeyModels")}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {(catalog.models || [])
                      .filter((model: { provider_id: string }) => model.provider_id === providerId)
                      .slice()
                      .sort((a: { enabled: boolean; label: string }, b: { enabled: boolean; label: string }) => {
                        if (Boolean(a.enabled) !== Boolean(b.enabled)) return a.enabled ? -1 : 1
                        return String(a.label).localeCompare(String(b.label))
                      })
                      .map((model: Record<string, unknown>) => (
                        <div key={String(model.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <div className="min-w-48 flex-1 space-y-1">
                            <Input
                              defaultValue={String(model.label)}
                              key={`${model.id}:${model.label}`}
                              className="h-8 max-w-sm"
                              onBlur={(event) => {
                                const next = event.target.value.trim()
                                if (!next || next === String(model.label)) return
                                startTransition(async () => {
                                  const result = await updateCatalogModelLabel(String(model.id), next)
                                  notifyResult(result.error, t("admin.platform.saved"))
                                  refresh()
                                })
                              }}
                            />
                            <p className="text-xs text-muted-foreground">{String(model.model_id)}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              {t("admin.platform.catalogEnabled")}
                              <Switch
                                checked={Boolean(model.enabled)}
                                disabled={pending}
                                onCheckedChange={(checked) =>
                                  startTransition(async () => {
                                    const result = await setCatalogModelEnabled(String(model.id), checked)
                                    notifyResult(result.error, t("admin.platform.saved"))
                                    refresh()
                                  })
                                }
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              {t("admin.platform.defaultForOrgs")}
                              <Switch
                                checked={Boolean(model.default_for_tenants)}
                                disabled={pending}
                                onCheckedChange={(checked) =>
                                  startTransition(async () => {
                                    const result = await setModelDefaultForTenants(String(model.id), checked)
                                    notifyResult(result.error, t("admin.platform.saved"))
                                    refresh()
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{t("admin.platform.manualModelHint")}</p>
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <Input
                      placeholder={t("admin.platform.modelId")}
                      value={form.modelId}
                      onChange={(event) =>
                        setModelForms((current) => ({
                          ...current,
                          [providerId]: { ...form, modelId: event.target.value },
                        }))
                      }
                    />
                    <Input
                      placeholder={t("admin.platform.modelLabel")}
                      value={form.label}
                      onChange={(event) =>
                        setModelForms((current) => ({
                          ...current,
                          [providerId]: { ...form, label: event.target.value },
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      disabled={pending || !form.modelId.trim() || !form.label.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await addCatalogModel({
                            providerId,
                            modelId: form.modelId,
                            label: form.label,
                          })
                          notifyResult(result.error, t("admin.platform.saved"))
                          if (!result.error) {
                            setModelForms((current) => ({ ...current, [providerId]: { modelId: "", label: "" } }))
                            refresh()
                          }
                        })
                      }
                    >
                      {t("admin.platform.addModel")}
                    </Button>
                  </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.platform.tasksTitle")}</CardTitle>
              <CardDescription>{t("admin.platform.tasksDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {PLATFORM_TASKS.map((task) => (
                <div key={task} className="space-y-2">
                  <Label>{task}</Label>
                  <Select
                    value={taskModelByTask.get(task) || undefined}
                    disabled={pending}
                    onValueChange={(value) =>
                      startTransition(async () => {
                        const result = await setPlatformTaskModel(task, value)
                        notifyResult(result.error, t("admin.platform.saved"))
                        refresh()
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("admin.platform.chooseModel")} />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledModels.map((model: { id: string; label: string; provider_id: string }) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label} ({model.provider_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-4">
          {["tools", "playbooks", "identity", "agents"].map((group) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{t(`admin.platform.promptGroup.${group}`)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(catalog.prompts || [])
                  .filter((prompt: { group_id: string }) => prompt.group_id === group)
                  .map((prompt: { id: string; label: string; body: string }) => (
                    <div key={prompt.id} className="space-y-2">
                      <Label htmlFor={`prompt-${prompt.id}`}>{prompt.label}</Label>
                      <Textarea
                        id={`prompt-${prompt.id}`}
                        rows={group === "identity" ? 4 : 8}
                        value={promptDrafts[prompt.id] ?? prompt.body}
                        onChange={(event) =>
                          setPromptDrafts((current) => ({ ...current, [prompt.id]: event.target.value }))
                        }
                      />
                      <Button
                        size="sm"
                        disabled={pending || (promptDrafts[prompt.id] ?? prompt.body) === prompt.body}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await savePlatformPrompt(prompt.id, promptDrafts[prompt.id] ?? prompt.body)
                            notifyResult(result.error, t("admin.platform.promptSaved"))
                            refresh()
                          })
                        }
                      >
                        {t("admin.platform.savePrompt")}
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="orgs">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.platform.tenantPolicyTitle")}</CardTitle>
              <CardDescription>{t("admin.platform.tenantPolicyHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(catalog.tenants || []).map((tenant) => (
                <div key={tenant.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{tenant.llmKeyPolicy}</p>
                  </div>
                  <Select
                    value={tenant.llmKeyPolicy}
                    disabled={pending}
                    onValueChange={(value: "platform_only" | "allow_byok") =>
                      startTransition(async () => {
                        const result = await setTenantKeyPolicyAsSuperAdmin(tenant.id, value)
                        notifyResult(result.error, t("admin.platform.saved"))
                        refresh()
                      })
                    }
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platform_only">{t("admin.platform.policyPlatformOnly")}</SelectItem>
                      <SelectItem value="allow_byok">{t("admin.platform.policyAllowByok")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
