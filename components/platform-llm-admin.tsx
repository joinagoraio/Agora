"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { ChevronRight, Trash2 } from "lucide-react"
import { LlmAddProviderDialog } from "@/components/llm-add-provider-dialog"
import { LlmCollapsibleList } from "@/components/llm-collapsible-list"
import { LlmProviderCard } from "@/components/llm-provider-card"
import { LlmProviderKeyDialog } from "@/components/llm-provider-key-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  deletePlatformPromptVersion,
  listPlatformPromptVersions,
  renamePlatformPromptVersion,
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
import { cn } from "@/lib/utils"

const PROMPT_GROUPS = ["tools", "playbooks", "identity", "agents"] as const
const HIDDEN_PLATFORM_TASKS = new Set<string>(["overheid_search"])
const HIDDEN_PLATFORM_PROMPTS = new Set(["overheid_search", "overheid_rank"])

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

type PromptVersion = { id: string; version: number; name: string | null; body: string; created_at: string }

function PlatformPromptEditor({
  prompt,
  onBodyChange,
}: {
  prompt: { id: string; label: string; body: string }
  onBodyChange: (body: string) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(prompt.body)
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [versionToDelete, setVersionToDelete] = useState<PromptVersion | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setDraft(prompt.body)
    let cancelled = false
    void listPlatformPromptVersions(prompt.id).then((result) => {
      if (cancelled) return
      const next = result.data || []
      setVersions(next)
      setNames(Object.fromEntries(next.map((version) => [version.id, version.name || ""])))
    })
    return () => {
      cancelled = true
    }
  }, [prompt.id, prompt.body])

  const publish = (body: string, success: string) => {
    const previous = prompt.body
    startTransition(async () => {
      const result = await savePlatformPrompt(prompt.id, body)
      if (result.error) {
        notify(result.error, "error")
        setDraft(previous)
        return
      }
      notify(success, "success")
      onBodyChange(body)
      const listed = await listPlatformPromptVersions(prompt.id)
      if (listed.data) {
        setVersions(listed.data)
        setNames(Object.fromEntries(listed.data.map((version) => [version.id, version.name || ""])))
      }
    })
  }

  const rename = (version: PromptVersion, value: string) => {
    const next = value.trim()
    if (next === (version.name || "")) return
    startTransition(async () => {
      const result = await renamePlatformPromptVersion(prompt.id, version.id, next)
      if (result.error) {
        notify(result.error, "error")
        setNames((current) => ({ ...current, [version.id]: version.name || "" }))
        return
      }
      setVersions((current) => current.map((row) => (row.id === version.id ? { ...row, name: next || null } : row)))
      notify(t("admin.platform.promptVersionRenamed"), "success")
    })
  }

  const remove = () => {
    const version = versionToDelete
    if (!version) return
    startTransition(async () => {
      const result = await deletePlatformPromptVersion(prompt.id, version.id)
      if (result.error) {
        notify(result.error, "error")
        return
      }
      setVersionToDelete(null)
      notify(t("admin.platform.promptVersionDeleted"), "success")
      const listed = await listPlatformPromptVersions(prompt.id)
      if (listed.data) {
        setVersions(listed.data)
        setNames(Object.fromEntries(listed.data.map((row) => [row.id, row.name || ""])))
      }
    })
  }

  return (
    <div className="min-w-0 flex-1 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">{prompt.label}</h2>
        <Button size="sm" disabled={pending || draft.trim() === prompt.body.trim()} onClick={() => publish(draft, t("admin.platform.promptSaved"))}>
          {t("admin.platform.savePrompt")}
        </Button>
      </div>
      <Textarea
        id={`prompt-${prompt.id}`}
        rows={18}
        className="min-h-[24rem]"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("admin.platform.promptVersions")}</p>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.platform.promptVersionEmpty")}</p>
        ) : (
          <ul className="space-y-1">
            {versions.map((version, index) => {
              const current = index === 0
              return (
                <li key={version.id} className="group flex items-center gap-3">
                  <Input
                    value={names[version.id] ?? ""}
                    placeholder={t("admin.platform.promptVersionLabel", undefined, { version: String(version.version) })}
                    aria-label={t("admin.platform.promptVersionName")}
                    className="h-8 w-44"
                    onChange={(event) => setNames((currentNames) => ({ ...currentNames, [version.id]: event.target.value }))}
                    onBlur={(event) => rename(version, event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
                  />
                  <button
                    type="button"
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-sm",
                      current ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setDraft(version.body)}
                  >
                    {new Date(version.created_at).toLocaleString(undefined, { hour12: false })}
                    {current ? ` · ${t("admin.platform.promptVersionCurrent")}` : ""}
                  </button>
                  {current ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => publish(version.body, t("admin.platform.promptRestored"))}
                    >
                      {t("admin.platform.promptRestore")}
                    </Button>
                  )}
                  {current ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-events-auto text-destructive opacity-0 hover:bg-transparent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={t("admin.platform.promptDelete")}
                      onClick={() => setVersionToDelete(version)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <AlertDialog open={versionToDelete != null} onOpenChange={(open) => { if (!open && !pending) setVersionToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.platform.promptDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {versionToDelete
                ? t("admin.platform.promptDeleteDescription", undefined, {
                    name: versionToDelete.name?.trim() || t("admin.platform.promptVersionLabel", undefined, { version: String(versionToDelete.version) }),
                    time: new Date(versionToDelete.created_at).toLocaleString(undefined, { hour12: false }),
                  })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault()
                remove()
              }}
            >
              {t("common.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [openPromptGroup, setOpenPromptGroup] = useState<string | null>("tools")
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

        <TabsContent value="providers" className="space-y-4" data-guidance-target="platform-models">
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
            <CardContent className={firstToolModelId ? "flex flex-col gap-8" : undefined}>
              {!firstToolModelId ? (
                <p className="text-sm text-muted-foreground">{t("admin.platform.tasksNeedModels")}</p>
              ) : (
                PLATFORM_TASKS.filter((task) => !HIDDEN_PLATFORM_TASKS.has(task)).map((task) => {
                  const assigned = taskModelByTask.get(task)
                  const value = assigned && toolModels.some((model) => model.id === assigned) ? assigned : firstToolModelId
                  return (
                    <div key={task} className="grid items-center gap-4 border-b border-border pb-8 last:border-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-10">
                      <div className="space-y-1">
                        <Label>{t(`admin.platform.taskLabel.${task}`)}</Label>
                        <p className="text-sm text-muted-foreground">{t(`admin.platform.taskHint.${task}`)}</p>
                      </div>
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
                        <SelectTrigger className="w-full">
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

        <TabsContent value="prompts">
          {(() => {
            const prompts = PROMPT_GROUPS.flatMap((group) =>
              ((catalog.prompts || []) as Array<{ id: string; group_id: string; label: string; body: string }>).filter(
                (prompt) => prompt.group_id === group && !HIDDEN_PLATFORM_PROMPTS.has(prompt.id),
              ),
            )
            const selected = prompts.find((prompt) => prompt.id === selectedPromptId) || prompts[0]
            if (!selected) return null
            return (
              <div className="flex items-start gap-8">
                <nav className="sticky top-6 max-h-[calc(100vh-6rem)] w-64 shrink-0 space-y-1 self-start overflow-y-auto" aria-label={t("admin.platform.tabPrompts")}>
                  {PROMPT_GROUPS.map((group) => {
                    const groupPrompts = prompts.filter((prompt) => prompt.group_id === group)
                    if (groupPrompts.length === 0) return null
                    const open = openPromptGroup === group
                    return (
                      <div key={group}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          aria-expanded={open}
                          onClick={() => setOpenPromptGroup(open ? null : group)}
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
                          <span>{t(`admin.platform.promptGroup.${group}`)}</span>
                        </button>
                        {open ? (
                          <div className="space-y-0.5 pb-2 pl-8">
                            {groupPrompts.map((prompt) => (
                              <button
                                key={prompt.id}
                                type="button"
                                className="group/prompt relative block w-full rounded-md px-2 py-1.5 text-left text-sm leading-5"
                                onClick={() => setSelectedPromptId(prompt.id)}
                              >
                                <span className="invisible block whitespace-normal break-words font-semibold" aria-hidden="true">
                                  {prompt.label}
                                </span>
                                <span
                                  className={cn(
                                    "absolute inset-x-2 top-1.5 whitespace-normal break-words",
                                    prompt.id === selected.id
                                      ? "font-semibold text-foreground"
                                      : "text-muted-foreground group-hover/prompt:font-semibold group-hover/prompt:text-foreground",
                                  )}
                                >
                                  {prompt.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </nav>
                <PlatformPromptEditor
                  prompt={selected}
                  onBodyChange={(body) =>
                    patchCatalog((current) => ({
                      ...current,
                      prompts: (current.prompts || []).map((row) =>
                        row.id === selected.id ? { ...row, body } : row,
                      ),
                    }))
                  }
                />
              </div>
            )
          })()}
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
