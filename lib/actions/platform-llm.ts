"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { isSuperAdmin } from "@/lib/llm/resolve"
import { decryptSecret, encryptSecret } from "@/lib/security/crypto"
import { mapTenantRow } from "@/lib/tenant/membership"
import { isLlmAdapterId, isPlatformTask, providerAdapterId, slugifyProviderId } from "@/lib/llm/catalog"
import { ensurePlatformPromptSeeds, listPlatformPrompts } from "@/lib/llm/prompts"
import { fetchProviderChatModels } from "@/lib/llm/provider-models"

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

  return {
    data: {
      providers: (providers.data || []).map((provider) => ({
        ...provider,
        has_key: keyed.has(provider.id),
      })),
      models: models.data || [],
      tasks: tasks.data || [],
      tenants: (tenants.data || []).map(mapTenantRow),
      prompts: prompts.data || [],
    },
  }
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
  const apiKey = decryptSecret(cred?.encrypted_key)
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
        enabled: false,
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

export async function addCatalogModel(input: {
  providerId: string
  modelId: string
  label: string
  costHint?: string
  defaultForTenants?: boolean
}) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!input.modelId.trim() || !input.label.trim()) return { error: "Model id and label are required." }
  const admin = createAdminClient()
  const { data: last } = await admin
    .from("llm_models")
    .select("sort_order")
    .eq("provider_id", input.providerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const defaultForTenants = input.defaultForTenants ?? true
  const { data: created, error } = await admin
    .from("llm_models")
    .insert({
      provider_id: input.providerId,
      model_id: input.modelId.trim(),
      label: input.label.trim(),
      cost_hint: input.costHint?.trim() || null,
      enabled: true,
      default_for_tenants: defaultForTenants,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single()
  if (error || !created) return { error: error?.message || "Failed to add model." }
  if (defaultForTenants) {
    const { data: tenants } = await admin.from("tenants").select("id").eq("llm_key_policy", "platform_only")
    if (tenants?.length) {
      await admin.from("tenant_llm_settings").upsert(
        tenants.map((tenant) => ({ tenant_id: tenant.id, model_id: created.id, enabled: true })),
        { onConflict: "tenant_id,model_id" },
      )
    }
  }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function setCatalogModelEnabled(modelId: string, enabled: boolean) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin.from("llm_models").update({ enabled }).eq("id", modelId)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function updateCatalogModelLabel(modelId: string, label: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!label.trim()) return { error: "Label is required." }
  const admin = createAdminClient()
  const { error } = await admin.from("llm_models").update({ label: label.trim() }).eq("id", modelId)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function setModelDefaultForTenants(modelId: string, defaultForTenants: boolean) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const { error } = await admin.from("llm_models").update({ default_for_tenants: defaultForTenants }).eq("id", modelId)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function setPlatformTaskModel(task: string, modelId: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!isPlatformTask(task)) return { error: "Unknown built-in tool." }
  const admin = createAdminClient()
  const { error } = await admin
    .from("platform_task_models")
    .upsert({ task, model_id: modelId, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
}

export async function savePlatformPrompt(id: string, body: string) {
  const gate = await requireSuperAdmin()
  if (gate.error) return { error: gate.error }
  if (!body.trim()) return { error: "Prompt cannot be empty." }
  const admin = createAdminClient()
  const { error } = await admin
    .from("platform_prompts")
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/admin/platform")
  return { success: true }
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
