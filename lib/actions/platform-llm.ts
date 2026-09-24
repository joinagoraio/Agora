"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { decryptSecret, encryptSecret } from "@/lib/security/crypto"
import { mapTenantRow } from "@/lib/tenant/membership"
import {
  isLlmAdapterId,
  isPlatformTask,
  PLATFORM_TASKS,
  providerAdapterId,
  sanitizeCatalogVisibility,
  slugifyProviderId,
  writeCatalogAllowed,
  writeCatalogEnabled,
} from "@/lib/llm/catalog"
import { ensurePlatformPromptSeeds, listPlatformPrompts } from "@/lib/llm/prompts"
import {
  builtinProviderById,
  canAddBuiltinProvider,
  ensurePlatformTaskModelRows,
  selectPlatformToolModels,
} from "@/lib/llm/builtin-catalog"
import { ensureBuiltinCatalogModels } from "@/lib/llm/ensure-builtin-catalog"
import { apiKeyForProviderRequest, fetchProviderChatModels } from "@/lib/llm/provider-models"

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" as const, user: null }
  const allowed = await isSuperAdmin(user.id)
  if (!allowed) return { error: "Forbidden" as const, user: null }
  return { user }
}

export async function listPlatformCatalog() {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error, data: null }

  await ensurePlatformPromptSeeds()
  await ensureBuiltinCatalogModels()
  const admin = createAdminClient()
  const [providers, models, tasks, tenants, credentials, prompts] = await Promise.all([
    admin.from("llm_providers").select("*").order("sort_order"),
    admin.from("llm_models").select("*").order("sort_order"),
    admin.from("platform_task_models").select("task, model_id").order("task"),
    admin.from("tenants").select("id, name, llm_key_policy").order("name"),
    admin.from("platform_llm_credentials").select("provider_id, updated_at"),
    listPlatformPrompts(),
  ])

  const keyed = new Set((credentials.data || []).map((row) => row.provider_id as string))
  const providerRows = providers.data || []
  const modelRows = (models.data || []).map((model) => ({
    ...model,
    ...sanitizeCatalogVisibility(model),
  }))
  const syncedTasks = await syncPlatformTaskAssignments(admin, providerRows, modelRows, tasks.data || [])

  return {
    data: {
      providers: providerRows.map((provider) => ({
        ...provider,
        has_key: keyed.has(provider.id),
      })),
      models: modelRows,
      tasks: syncedTasks,
      tenants: (tenants.data || []).map(mapTenantRow),
      prompts: prompts.data || [],
    },
  }
}

async function syncPlatformTaskAssignments(
  admin: ReturnType<typeof createAdminClient>,
  providers: Array<{ id: string; enabled?: boolean }>,
  models: Array<{ id: string; enabled?: boolean; provider_id?: string }>,
  tasks: Array<{ task: string; model_id: string }>,
) {
  const eligible = selectPlatformToolModels(models, providers)
  const next = ensurePlatformTaskModelRows(
    tasks,
    eligible.map((model) => model.id),
    PLATFORM_TASKS,
  )
  if (!eligible[0]) return tasks
  const current = new Map(tasks.map((row) => [row.task, row.model_id]))
  const updates = next
    .filter((row) => current.get(row.task) !== row.model_id)
    .map((row) => ({ ...row, updated_at: new Date().toISOString() }))
  if (updates.length) await admin.from("platform_task_models").upsert(updates)
  return next
}

async function syncPlatformTasksFromCatalog(admin: ReturnType<typeof createAdminClient>) {
  const [providers, models, tasks] = await Promise.all([
    admin.from("llm_providers").select("id, enabled"),
    admin.from("llm_models").select("id, provider_id, enabled, model_id, label, sort_order"),
    admin.from("platform_task_models").select("task, model_id"),
  ])
  await syncPlatformTaskAssignments(admin, providers.data || [], models.data || [], tasks.data || [])
}

export async function addBuiltinProvider(providerId: string, enabledModelIds: string[]) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const builtin = builtinProviderById(providerId)
  if (!builtin) return { error: "Unknown built-in provider." }
  if (!canAddBuiltinProvider(builtin)) {
    return { error: "Ollama needs a local server. It cannot be added on this platform." }
  }

  const admin = createAdminClient()
  const { data: provider } = await admin.from("llm_providers").select("id, enabled").eq("id", providerId).maybeSingle()
  if (!provider) return { error: "Unknown built-in provider." }
  if (provider.enabled) return { error: "This provider is already on the list." }

  const { data: models } = await admin.from("llm_models").select("id").eq("provider_id", providerId)
  const selected = new Set(enabledModelIds)
  const turnOn = (models || []).filter((row) => selected.has(row.id)).map((row) => row.id)
  const turnOff = (models || []).filter((row) => !selected.has(row.id)).map((row) => row.id)

  const { error: enableError } = await admin.from("llm_providers").update({ enabled: true }).eq("id", providerId)
  if (enableError) return { error: enableError.message }
  if (turnOn.length) {
    const { error } = await admin
      .from("llm_models")
      .update({ enabled: true, default_for_tenants: true })
      .in("id", turnOn)
    if (error) return { error: error.message }
  }
  if (turnOff.length) {
    const { error } = await admin
      .from("llm_models")
      .update({ enabled: false, default_for_tenants: false })
      .in("id", turnOff)
    if (error) return { error: error.message }
  }

  await syncPlatformTasksFromCatalog(admin)
  revalidatePath("/admin/platform")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function createProvider(input: {
  id: string
  label: string
  adapter: string
  endpoint?: string
  apiKey?: string
}) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const id = slugifyProviderId(input.id)
  if (id.length < 2) return { error: "Provider id must be a short slug, for example openai or groq." }
  if (!isLlmAdapterId(input.adapter)) return { error: "Adapter must be openai-compatible or anthropic." }
  if (!input.label.trim()) return { error: "Label is required." }

  const admin = createAdminClient()
  const { data: last } = await admin.from("llm_providers").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle()
  const { error } = await admin.from("llm_providers").insert({
    id,
    label: input.label.trim(),
    adapter: input.adapter,
    endpoint: input.endpoint?.trim() || null,
    enabled: true,
    sort_order: (last?.sort_order ?? 0) + 1,
  })
  if (error) return { error: error.message }
  if (input.apiKey?.trim()) {
    await admin.from("platform_llm_credentials").upsert({
      provider_id: id,
      encrypted_key: encryptSecret(input.apiKey.trim()),
      updated_at: new Date().toISOString(),
    })
    const synced = await importRemoteModelsForProvider(id)
    revalidatePath("/admin/platform")
    return { success: true, id, imported: synced.imported, listed: synced.listed, syncError: synced.error }
  }
  revalidatePath("/admin/platform")
  return { success: true, id }
}

export async function updateProvider(input: {
  id: string
  label: string
  adapter: string
  endpoint?: string | null
  enabled?: boolean
}) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!isLlmAdapterId(input.adapter)) return { error: "Adapter must be openai-compatible or anthropic." }
  const admin = createAdminClient()
  const { error } = await admin
    .from("llm_providers")
    .update({
      label: input.label.trim(),
      adapter: input.adapter,
      endpoint: input.endpoint?.trim() || null,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    })
    .eq("id", input.id)
  if (error) return { error: error.message }
  await syncPlatformTasksFromCatalog(admin)
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function setProviderEnabled(providerId: string, enabled: boolean) {
  return updateProviderSettings(providerId, { enabled })
}

async function updateProviderSettings(providerId: string, patch: Record<string, unknown>) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin.from("llm_providers").update(patch).eq("id", providerId)
  if (error) return { error: error.message }
  await syncPlatformTasksFromCatalog(admin)
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function savePlatformProviderCredential(providerId: string, apiKey: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!apiKey.trim()) return { error: "API key is required." }
  const admin = createAdminClient()
  const { error } = await admin.from("platform_llm_credentials").upsert({
    provider_id: providerId,
    encrypted_key: encryptSecret(apiKey.trim()),
    updated_at: new Date().toISOString(),
  })
  if (error) return { error: error.message }
  const synced = await importRemoteModelsForProvider(providerId)
  revalidatePath("/admin/platform")
  return { success: true, imported: synced.imported, listed: synced.listed, syncError: synced.error }
}

export async function refreshProviderModels(providerId: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const synced = await importRemoteModelsForProvider(providerId)
  revalidatePath("/admin/platform")
  if (synced.error) return { error: synced.error, imported: synced.imported, listed: synced.listed }
  return { success: true, imported: synced.imported, listed: synced.listed }
}

async function importRemoteModelsForProvider(providerId: string): Promise<{
  imported: number
  listed: number
  error?: string
}> {
  const admin = createAdminClient()
  const [{ data: provider }, { data: cred }] = await Promise.all([
    admin.from("llm_providers").select("id, adapter, endpoint").eq("id", providerId).maybeSingle(),
    admin.from("platform_llm_credentials").select("encrypted_key").eq("provider_id", providerId).maybeSingle(),
  ])
  const apiKey = apiKeyForProviderRequest(decryptSecret(cred?.encrypted_key), provider?.endpoint)
  if (!provider || !apiKey) {
    return { imported: 0, listed: 0, error: "Save an API key before loading models." }
  }

  let remote
  try {
    remote = await fetchProviderChatModels({
      adapter: providerAdapterId(provider.id, provider.adapter),
      endpoint: provider.endpoint,
      apiKey,
    })
  } catch (error) {
    return { imported: 0, listed: 0, error: error instanceof Error ? error.message : "Could not list models." }
  }

  const { data: existing } = await admin
    .from("llm_models")
    .select("id, model_id, sort_order")
    .eq("provider_id", providerId)
  const have = new Set((existing || []).map((row) => row.model_id as string))
  const lastSort = (existing || []).reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), 0)
  const missing = remote.filter((model) => !have.has(model.id))
  if (missing.length) {
    const { error } = await admin.from("llm_models").insert(
      missing.map((model, index) => ({
        provider_id: providerId,
        model_id: model.id,
        label: model.label,
        enabled: true,
        default_for_tenants: false,
        sort_order: lastSort + index + 1,
      })),
    )
    if (error) return { imported: 0, listed: remote.length, error: error.message }
  }
  return { imported: missing.length, listed: remote.length }
}

export async function clearPlatformProviderCredential(providerId: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin.from("platform_llm_credentials").delete().eq("provider_id", providerId)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function setCatalogModelEnabled(modelId: string, enabled: boolean) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin
    .from("llm_models")
    .update(writeCatalogEnabled(enabled))
    .eq("id", modelId)
  if (error) return { error: error.message }
  await syncPlatformTasksFromCatalog(admin)
  revalidatePath("/admin/platform")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function setModelDefaultForTenants(modelId: string, defaultForTenants: boolean) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin
    .from("llm_models")
    .update(writeCatalogAllowed(defaultForTenants))
    .eq("id", modelId)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function setPlatformTaskModel(task: string, modelId: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!isPlatformTask(task)) return { error: "Unknown built-in tool." }
  const admin = createAdminClient()
  const { data: model } = await admin
    .from("llm_models")
    .select("id, enabled, provider_id, llm_providers(enabled)")
    .eq("id", modelId)
    .maybeSingle()
  const provider = Array.isArray(model?.llm_providers) ? model.llm_providers[0] : model?.llm_providers
  if (!model?.enabled || !provider?.enabled) {
    return { error: "Choose a model that is enabled on an enabled provider." }
  }
  const { error } = await admin
    .from("platform_task_models")
    .upsert({ task, model_id: modelId, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function savePlatformPrompt(id: string, body: string) {
  const gate = await requireSuperAdmin()
  if (gate.error || !gate.user) return { error: gate.error || "Unauthorized" }
  const nextBody = body.trim()
  if (!nextBody) return { error: "Prompt cannot be empty." }
  const admin = createAdminClient()
  const { data: current, error: readError } = await admin
    .from("platform_prompts")
    .select("body")
    .eq("id", id)
    .maybeSingle()
  if (readError) return { error: readError.message }
  if (!current) return { error: "Prompt not found." }
  if ((current.body || "").trim() === nextBody) return { success: true }

  const { data: latest, error: latestError } = await admin
    .from("platform_prompt_versions")
    .select("version")
    .eq("prompt_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) return { error: latestError.message }

  let nextVersion = (latest?.version ?? 0) + 1
  if (!latest) {
    const { error: snapshotError } = await admin.from("platform_prompt_versions").insert({
      prompt_id: id,
      version: 1,
      body: current.body,
      created_by: gate.user.id,
    })
    if (snapshotError) return { error: snapshotError.message }
    nextVersion = 2
  }

  const { error: versionError } = await admin.from("platform_prompt_versions").insert({
    prompt_id: id,
    version: nextVersion,
    body: nextBody,
    created_by: gate.user.id,
  })
  if (versionError) return { error: versionError.message }

  const { error } = await admin
    .from("platform_prompts")
    .update({ body: nextBody, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true, version: nextVersion }
}

export async function listPlatformPromptVersions(id: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error, data: [] as PlatformPromptVersion[] }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("platform_prompt_versions")
    .select("id, version, name, body, created_at")
    .eq("prompt_id", id)
    .order("version", { ascending: false })
  if (error) return { error: error.message, data: [] as PlatformPromptVersion[] }
  return { data: (data || []) as PlatformPromptVersion[] }
}

export type PlatformPromptVersion = {
  id: string
  version: number
  name: string | null
  body: string
  created_at: string
}

export async function renamePlatformPromptVersion(promptId: string, versionId: string, name: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin
    .from("platform_prompt_versions")
    .update({ name: name.trim() || null })
    .eq("id", versionId)
    .eq("prompt_id", promptId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function deletePlatformPromptVersion(promptId: string, versionId: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error, body: undefined as string | undefined }
  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from("platform_prompt_versions")
    .select("id, version")
    .eq("id", versionId)
    .eq("prompt_id", promptId)
    .maybeSingle()
  if (readError) return { error: readError.message, body: undefined as string | undefined }
  if (!row) return { error: "Version not found.", body: undefined as string | undefined }

  const { data: latest } = await admin
    .from("platform_prompt_versions")
    .select("id")
    .eq("prompt_id", promptId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest?.id === row.id) return { error: "The current version cannot be deleted.", body: undefined as string | undefined }

  const { error } = await admin.from("platform_prompt_versions").delete().eq("id", versionId)
  if (error) return { error: error.message, body: undefined as string | undefined }
  return { success: true, body: undefined as string | undefined }
}

export async function setTenantKeyPolicyAsSuperAdmin(tenantId: string, policy: "platform_only" | "allow_byok") {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin
    .from("tenants")
    .update({
      llm_key_policy: policy,
    })
    .eq("id", tenantId)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  revalidatePath("/dashboard")
  return { success: true }
}
