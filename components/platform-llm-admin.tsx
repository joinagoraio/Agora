"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { LlmAddProviderDialog } from "@/components/llm-add-provider-dialog"
import { LlmCollapsibleList } from "@/components/llm-collapsible-list"
import { LlmProviderCard } from "@/components/llm-provider-card"
import { LlmProviderKeyDialog } from "@/components/llm-provider-key-dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/lib/i18n/use-i18n"
import {
  addBuiltinProvider,
  clearPlatformProviderCredential,
  listPlatformCatalog,
  refreshProviderModels,
  savePlatformPrompt,
  savePlatformProviderCredential,
  setCatalogModelEnabled,
  setModelDefaultForTenants,
  setPlatformTaskModel,
  setProviderEnabled,
  setTenantKeyPolicyAsSuperAdmin,
  updateProvider,
} from "@/lib/actions/platform-llm"
import {
  availableBuiltinProviders,
  compareLlmModelsForList,
  ensurePlatformTaskModelRows,
  llmModelListPreviewCount,
  selectPlatformToolModels,
} from "@/lib/llm/builtin-catalog"
import { nextCatalogVisibility, PLATFORM_TASKS } from "@/lib/llm/catalog"
import { isLocalLlmEndpoint } from "@/lib/llm/provider-models"
import { notify, notifyResult, persistOrRevert } from "@/lib/notify"

function rematchPlatformCatalogTasks<
  T extends {
    models?: Array<{ id: string; enabled?: boolean; provider_id?: string; providerId?: string; model_id?: string; sort_order?: number; label?: string }>
    providers?: Array<{ id: string; enabled?: boolean }>
    tasks?: Array<{ task: string; model_id: string }>
  },
>(current: T): T {
  const eligible = selectPlatformToolModels(current.models, current.providers)
  return {
    ...current,
    tasks: ensurePlatformTaskModelRows(
      current.tasks,
      eligible.map((model) => model.id),
      PLATFORM_TASKS,
    ),
  }
}

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
  const [addOpen, setAddOpen] = useState(false)
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({})
  const [endpointDrafts, setEndpointDrafts] = useState<Record<string, string>>({})
  const [keyDialogId, setKeyDialogId] = useState<string | null>(null)
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({})
  const [openPromptIds, setOpenPromptIds] = useState<Record<string, string[]>>({})
  const refreshGeneration = useRef(0)

  const refresh = () => {
    const generation = ++refreshGeneration.current
    startTransition(async () => {
      const result = await listPlatformCatalog()
      if (generation !== refreshGeneration.current) return
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

  const patchCatalog = (updater: (current: NonNullable<typeof catalog>) => NonNullable<typeof catalog>) => {
    setCatalog((current) => (current ? rematchPlatformCatalogTasks(updater(current)) : current))
  }

  const setModelFlags = (modelId: string, flags: { enabled: boolean; default_for_tenants: boolean }) => {
    patchCatalog((current) => ({
      ...current,
      models: (current.models || []).map((model: { id: string }) =>
        String(model.id) === modelId ? { ...model, ...flags } : model,
      ),
    }))
  }

  const applyModelVisibility = (
    modelId: string,
    patch: Partial<{ enabled: boolean; default_for_tenants: boolean }>,
  ) => {
    patchCatalog((current) => ({
      ...current,
      models: (current.models || []).map((model: { id: string; enabled?: boolean; default_for_tenants?: boolean }) => {
        if (String(model.id) !== modelId) return model
        return {
          ...model,
          ...nextCatalogVisibility(
            {
              enabled: Boolean(model.enabled),
              default_for_tenants: Boolean(model.default_for_tenants),
            },
            patch,
          ),
        }
      }),
    }))
  }

  const applyProviderEnabled = (providerId: string, enabled: boolean) => {
    patchCatalog((current) => ({
      ...current,
      providers: (current.providers || []).map((provider: { id: string }) =>
        provider.id === providerId ? { ...provider, enabled } : provider,
      ),
    }))
  }

  useEffect(() => {
    refresh()
  }, [])

  const taskModelByTask = useMemo(
    () => new Map((catalog?.tasks || []).map((row: { task: string; model_id: string }) => [row.task, row.model_id])),
    [catalog?.tasks],
  )
  const modelsByProvider = useMemo(() => {
    const grouped: Record<
      string,
      Array<{
        id: string
        label: string
        model_id: string
        enabled?: boolean
        provider_id?: string
        sort_order?: number
        cost_hint?: string | null
      }>
    > = {}
    for (const model of catalog?.models || []) {
      const row = model as {
        id: string
        label: string
        model_id: string
        enabled?: boolean
        provider_id: string
        sort_order?: number
        cost_hint?: string | null
      }
      const providerId = String(row.provider_id)
      if (!grouped[providerId]) grouped[providerId] = []
      grouped[providerId].push(row)
    }
    return grouped
  }, [catalog?.models])

  if (!catalog) {
    return <p className="text-sm text-muted-foreground">{t("admin.platform.loading")}</p>
  }

  const enabledProviders = (catalog.providers || []).filter((row: { enabled: boolean }) => row.enabled)
  const addableProviders = availableBuiltinProviders(enabledProviders.map((row: { id: string }) => row.id))
  const toolModels = selectPlatformToolModels(catalog.models, catalog.providers)
  const firstToolModelId = toolModels[0]?.id
  const keyDialogProvider = (catalog.providers || []).find((row: { id: string }) => row.id === keyDialogId) as
    | { id: string; label: string; adapter?: string; endpoint?: string | null; has_key?: boolean }
    | undefined

  const persistEndpoint = (providerId: string) => {
    const provider = (catalog.providers || []).find((row: { id: string }) => row.id === providerId)
    if (!provider) return
    const next = endpointDrafts[providerId]
    if (next === undefined || next === (provider.endpoint || "")) return
    startTransition(async () => {
      const result = await updateProvider({
        id: providerId,
        label: String(provider.label),
        adapter: String(provider.adapter || "openai-compatible"),
        endpoint: next,
      })
      if (result.error) notify(result.error, "error")
      else refresh()
    })
  }

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
          <div className="flex justify-end">
            <Button type="button" disabled={pending || addableProviders.length === 0} onClick={() => setAddOpen(true)}>
              {t("admin.platform.addProvider")}
            </Button>
          </div>

          {enabledProviders.map((provider: Record<string, unknown>) => {
            const providerId = provider.id as string
            const localEndpoint = isLocalLlmEndpoint(provider.endpoint as string | null)
            const models = (catalog.models || [])
              .filter((model: { provider_id: string }) => model.provider_id === providerId)
              .slice()
              .sort((a: { enabled?: boolean; model_id?: string; sort_order?: number; label?: string }, b) =>
                compareLlmModelsForList(
                  { ...a, providerId },
                  { ...b, providerId },
                ),
              )
            const enabledCount = models.filter((model: { enabled: boolean }) => model.enabled).length
            const hasKey = Boolean(provider.has_key)

            return (
              <LlmProviderCard
                key={providerId}
                providerId={providerId}
                title={String(provider.label)}
                description={`${providerId} · ${String(provider.adapter || "openai-compatible")}${
                  hasKey ? ` · ${t("admin.platform.keyOnFile")}` : ` · ${t("admin.platform.noKey")}`
                }`}
                enabled={Boolean(provider.enabled)}
                enabledAriaLabel={t("admin.agents.providerEnabled")}
                onEnabledChange={(checked) => {
                  applyProviderEnabled(providerId, checked)
                  persistOrRevert(
                    () => setProviderEnabled(providerId, checked),
                    () => applyProviderEnabled(providerId, !checked),
                    checked
                      ? t("admin.platform.saved")
                      : hasKey
                        ? t("admin.platform.providerHiddenKeyKept")
                        : t("admin.platform.providerHidden"),
                  )
                }}
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setKeyDialogId(providerId)
                      setEndpointDrafts((current) =>
                        current[providerId] === undefined
                          ? { ...current, [providerId]: String(provider.endpoint || "") }
                          : current,
                      )
                    }}
                  >
                    {hasKey ? t("admin.agents.updateKey") : t("admin.agents.addKey")}
                  </Button>
                }
                modelsLabel={t("admin.agents.manageModels")}
                modelsSummary={t("admin.agents.modelsEnabledCount", undefined, {
                  on: enabledCount,
                  total: models.length,
                })}
                models={
                  <>
                    {hasKey || localEndpoint ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
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
                        {!hasKey ? (
                          <p className="text-xs text-muted-foreground">{t("admin.platform.localNoKeyModels")}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("admin.platform.noKeyModels")}</p>
                    )}
                    <LlmCollapsibleList
                      items={models}
                      getKey={(model: { id: string }) => String(model.id)}
                      previewCount={llmModelListPreviewCount(enabledCount)}
                      showMoreLabel={(count) => t("admin.agents.showMoreModels", undefined, { count })}
                      showLessLabel={t("admin.agents.showLessModels")}
                      renderItem={(model: Record<string, unknown>) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <p className="text-sm font-medium">{String(model.label)}</p>
                          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              {t("admin.platform.catalogEnabled")}
                              <Switch
                                checked={Boolean(model.enabled)}
                                onCheckedChange={(checked) => {
                                  const modelId = String(model.id)
                                  const previous = {
                                    enabled: Boolean(model.enabled),
                                    default_for_tenants: Boolean(model.default_for_tenants),
                                  }
                                  applyModelVisibility(modelId, { enabled: checked })
                                  persistOrRevert(
                                    () => setCatalogModelEnabled(modelId, checked),
                                    () => setModelFlags(modelId, previous),
                                    t("admin.platform.saved"),
                                  )
                                }}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              {t("admin.platform.defaultForOrgs")}
                              <Switch
                                checked={Boolean(model.enabled && model.default_for_tenants)}
                                onCheckedChange={(checked) => {
                                  const modelId = String(model.id)
                                  const previous = {
                                    enabled: Boolean(model.enabled),
                                    default_for_tenants: Boolean(model.default_for_tenants),
                                  }
                                  applyModelVisibility(modelId, { default_for_tenants: checked })
                                  persistOrRevert(
                                    () => setModelDefaultForTenants(modelId, checked),
                                    () => setModelFlags(modelId, previous),
                                    t("admin.platform.saved"),
                                  )
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    />
                  </>
                }
              />
            )
          })}

          <LlmAddProviderDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            providers={addableProviders}
            modelsByProvider={modelsByProvider}
            keyedProviderIds={(catalog.providers || [])
              .filter((row: { has_key?: boolean }) => row.has_key)
              .map((row: { id: string }) => row.id)}
            pending={pending}
            onAdd={(providerId, enabledModelIds) =>
              startTransition(async () => {
                const result = await addBuiltinProvider(providerId, enabledModelIds)
                notifyResult(result.error, t("admin.platform.addProviderAdded"))
                if (!result.error) {
                  setAddOpen(false)
                  refresh()
                }
              })
            }
          />

          <LlmProviderKeyDialog
            open={Boolean(keyDialogId)}
            onOpenChange={(open) => {
              if (!open) setKeyDialogId(null)
            }}
            title={t("admin.agents.keyDialogTitle", undefined, { provider: keyDialogProvider?.label || "" })}
            description={
              isLocalLlmEndpoint(keyDialogProvider?.endpoint)
                ? t("admin.platform.localNoKeyModels")
                : t("admin.platform.noKeyModels")
            }
            pending={pending}
            hasKey={Boolean(keyDialogProvider?.has_key)}
            keyValue={keyDialogId ? providerKeys[keyDialogId] || "" : ""}
            onKeyChange={(value) => {
              if (keyDialogId) setProviderKeys((current) => ({ ...current, [keyDialogId]: value }))
            }}
            keyLabel={t("admin.agents.apiKeyLabel", undefined, { provider: keyDialogProvider?.label || "" })}
            keyPlaceholder={
              keyDialogProvider?.has_key ? t("admin.platform.apiKeySaved") : t("admin.platform.apiKeyPlaceholder")
            }
            endpointValue={
              keyDialogId ? endpointDrafts[keyDialogId] ?? String(keyDialogProvider?.endpoint || "") : ""
            }
            onEndpointChange={(value) => {
              if (keyDialogId) setEndpointDrafts((current) => ({ ...current, [keyDialogId]: value }))
            }}
            onEndpointBlur={() => {
              if (keyDialogId) persistEndpoint(keyDialogId)
            }}
            endpointPlaceholder={t("admin.platform.endpoint")}
            extra={
              keyDialogId && (keyDialogProvider?.has_key || isLocalLlmEndpoint(keyDialogProvider?.endpoint)) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await refreshProviderModels(keyDialogId)
                      reportModelSync(t, result, false)
                      refresh()
                    })
                  }
                >
                  {t("admin.platform.refreshModels")}
                </Button>
              ) : null
            }
            saveLabel={t("admin.platform.saveKey")}
            clearLabel={t("admin.platform.clearKey")}
            cancelLabel={t("common.actions.cancel")}
            onSave={() => {
              if (!keyDialogId) return
              startTransition(async () => {
                const result = await savePlatformProviderCredential(keyDialogId, providerKeys[keyDialogId] || "")
                reportModelSync(t, result, true)
                if (!result.error && !result.syncError) {
                  setProviderKeys((current) => ({ ...current, [keyDialogId]: "" }))
                  setKeyDialogId(null)
                  refresh()
                }
              })
            }}
            onClear={() => {
              if (!keyDialogId) return
              startTransition(async () => {
                const result = await clearPlatformProviderCredential(keyDialogId)
                notifyResult(result.error, t("admin.platform.keyCleared"))
                if (!result.error) {
                  setKeyDialogId(null)
                  refresh()
                }
              })
            }}
          />
        </TabsContent>

        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.platform.tasksTitle")}</CardTitle>
              <CardDescription>{t("admin.platform.tasksDescription")}</CardDescription>
            </CardHeader>
            <CardContent className={firstToolModelId ? "grid gap-4 md:grid-cols-2" : undefined}>
              {!firstToolModelId ? (
                <p className="text-sm text-muted-foreground">{t("admin.platform.tasksNeedModels")}</p>
              ) : (
                PLATFORM_TASKS.map((task) => {
                  const assigned = taskModelByTask.get(task)
                  const value = assigned && toolModels.some((model) => model.id === assigned) ? assigned : firstToolModelId
                  return (
                    <div key={task} className="space-y-2">
                      <Label>{task}</Label>
                      <Select
                        value={value}
                        onValueChange={(next) => {
                          const previous = value
                          patchCatalog((current) => ({
                            ...current,
                            tasks: [
                              ...(current.tasks || []).filter((row: { task: string }) => row.task !== task),
                              { task, model_id: next },
                            ],
                          }))
                          persistOrRevert(
                            () => setPlatformTaskModel(task, next),
                            () =>
                              patchCatalog((current) => ({
                                ...current,
                                tasks: [
                                  ...(current.tasks || []).filter((row: { task: string }) => row.task !== task),
                                  { task, model_id: previous },
                                ],
                              })),
                            t("admin.platform.saved"),
                          )
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {toolModels.map((model: { id: string; label: string; provider_id: string }) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label} ({model.provider_id})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="space-y-6">
          {["tools", "playbooks", "identity", "agents"].map((group) => {
            const groupPrompts = (catalog.prompts || []).filter(
              (prompt: { group_id: string }) => prompt.group_id === group,
            )
            const groupIds = groupPrompts.map((prompt: { id: string }) => prompt.id)
            const openIds = openPromptIds[group] || []
            const allOpen = groupIds.length > 0 && groupIds.every((id: string) => openIds.includes(id))
            return (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{t(`admin.platform.promptGroup.${group}`)}</CardTitle>
                {groupIds.length > 0 ? (
                  <CardAction>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOpenPromptIds((current) => ({
                          ...current,
                          [group]: allOpen ? [] : groupIds,
                        }))
                      }
                    >
                      {t(allOpen ? "admin.platform.collapsePrompts" : "admin.platform.expandPrompts")}
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <Accordion
                  type="multiple"
                  className="space-y-8"
                  value={openIds}
                  onValueChange={(value) =>
                    setOpenPromptIds((current) => ({
                      ...current,
                      [group]: value,
                    }))
                  }
                >
                  {groupPrompts.map((prompt: { id: string; label: string; body: string }) => (
                      <AccordionItem key={prompt.id} value={prompt.id} className="rounded-md border px-4 last:border-b">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <AccordionTrigger className="py-3 hover:no-underline">
                              <span className="text-sm font-medium">{prompt.label}</span>
                            </AccordionTrigger>
                          </div>
                          <Button
                            size="sm"
                            className="shrink-0"
                            disabled={(promptDrafts[prompt.id] ?? prompt.body) === prompt.body}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              const body = promptDrafts[prompt.id] ?? prompt.body
                              const previous = prompt.body
                              patchCatalog((current) => ({
                                ...current,
                                prompts: (current.prompts || []).map((row: { id: string }) =>
                                  row.id === prompt.id ? { ...row, body } : row,
                                ),
                              }))
                              persistOrRevert(
                                () => savePlatformPrompt(prompt.id, body),
                                () => {
                                  patchCatalog((current) => ({
                                    ...current,
                                    prompts: (current.prompts || []).map((row: { id: string }) =>
                                      row.id === prompt.id ? { ...row, body: previous } : row,
                                    ),
                                  }))
                                  setPromptDrafts((current) => ({ ...current, [prompt.id]: previous }))
                                },
                                t("admin.platform.promptSaved"),
                              )
                            }}
                          >
                            {t("admin.platform.savePrompt")}
                          </Button>
                        </div>
                        <AccordionContent className="space-y-2 pb-3">
                          <Textarea
                            id={`prompt-${prompt.id}`}
                            rows={group === "identity" ? 4 : 8}
                            value={promptDrafts[prompt.id] ?? prompt.body}
                            onChange={(event) =>
                              setPromptDrafts((current) => ({ ...current, [prompt.id]: event.target.value }))
                            }
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
              </CardContent>
            </Card>
            )
          })}
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
                    onValueChange={(value: "platform_only" | "allow_byok") => {
                      const previous = tenant.llmKeyPolicy
                      patchCatalog((current) => ({
                        ...current,
                        tenants: (current.tenants || []).map((row) =>
                          row.id === tenant.id ? { ...row, llmKeyPolicy: value } : row,
                        ),
                      }))
                      persistOrRevert(
                        () => setTenantKeyPolicyAsSuperAdmin(tenant.id, value),
                        () =>
                          patchCatalog((current) => ({
                            ...current,
                            tenants: (current.tenants || []).map((row) =>
                              row.id === tenant.id ? { ...row, llmKeyPolicy: previous } : row,
                            ),
                          })),
                        t("admin.platform.saved"),
                      )
                    }}
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
