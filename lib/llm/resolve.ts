import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  isAllowedForAgoraKeyOrgs,
  isCatalogEntryEnabled,
  mapLegacyKeyPolicy,
  pickVaultApiKey,
  providerAdapterId,
  usesAgoraPlatformKeys,
  type LlmAdapterId,
  type PlatformTask,
  type ResolvedLlmTarget,
  type TenantLlmAccessPolicy,
  type TenantLlmKeyPolicy,
} from "@/lib/llm/catalog"
import { decryptSecret } from "@/lib/security/crypto"
import { completeLlm } from "@/lib/llm/complete"
import { apiKeyForProviderRequest } from "@/lib/llm/provider-models"
import type { LlmCompleteInput, LlmCompleteResult } from "@/lib/llm/types"

type CatalogModelRow = {
  id: string
  provider_id: string
  model_id: string
  enabled: boolean
  defaultForTenants: boolean
  adapter?: string | null
  endpoint?: string | null
}

type ProviderRow = {
  id: string
  adapter: string | null
  endpoint: string | null
  enabled: boolean
}

async function loadProvider(providerId: string): Promise<ProviderRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("llm_providers")
    .select("id, adapter, endpoint, enabled")
    .eq("id", providerId)
    .maybeSingle()
  return data
}

async function loadPlatformCredential(providerId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("platform_llm_credentials")
    .select("encrypted_key")
    .eq("provider_id", providerId)
    .maybeSingle()
  if (!data?.encrypted_key) return null
  return decryptSecret(data.encrypted_key)
}

/** The platform's own OpenAI key, for platform features such as demo narration. */
export async function platformOpenAiKey(): Promise<string | null> {
  return (await loadPlatformCredential("openai")) || process.env.OPENAI_API_KEY || null
}

async function loadTenantCredential(
  tenantId: string,
  providerId: string,
): Promise<{ apiKey: string | null; endpoint: string | null }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("tenant_llm_credentials")
    .select("encrypted_key, endpoint")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .maybeSingle()
  if (!data) return { apiKey: null, endpoint: null }
  return {
    apiKey: decryptSecret(data.encrypted_key),
    endpoint: data.endpoint ?? null,
  }
}

async function loadSpaceCredential(
  spaceId: string,
  providerId: string,
): Promise<{ apiKey: string | null; endpoint: string | null }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("space_llm_credentials")
    .select("encrypted_key, endpoint")
    .eq("space_id", spaceId)
    .eq("provider_id", providerId)
    .maybeSingle()
  if (!data) return { apiKey: null, endpoint: null }
  return {
    apiKey: decryptSecret(data.encrypted_key),
    endpoint: data.endpoint ?? null,
  }
}

async function resolveVaultForProvider(input: {
  tenantId: string | null
  spaceId?: string | null
  providerId: string
  accessPolicy: TenantLlmAccessPolicy
  keyPolicy: TenantLlmKeyPolicy
}): Promise<{ apiKey: string; endpoint: string | null; adapter: LlmAdapterId }> {
  const provider = await loadProvider(input.providerId)
  if (!provider?.enabled) {
    throw new Error(`Provider "${input.providerId}" is not enabled.`)
  }

  const agoraKeys = usesAgoraPlatformKeys(input.keyPolicy)
  const spaceCred =
    !agoraKeys &&
    input.spaceId &&
    (input.accessPolicy === "global_with_override" || input.accessPolicy === "authority_only")
      ? await loadSpaceCredential(input.spaceId, input.providerId)
      : { apiKey: null, endpoint: null }
  const tenantCred =
    !agoraKeys && input.tenantId && input.accessPolicy !== "authority_only"
      ? await loadTenantCredential(input.tenantId, input.providerId)
      : { apiKey: null, endpoint: null }
  const platformKey =
    agoraKeys || input.accessPolicy !== "authority_only" ? await loadPlatformCredential(input.providerId) : null
  const endpoint = spaceCred.endpoint || tenantCred.endpoint || provider.endpoint
  const localKey =
    spaceCred.apiKey || tenantCred.apiKey || platformKey ? null : apiKeyForProviderRequest(null, endpoint)
  const picked = pickVaultApiKey({
    accessPolicy: input.accessPolicy,
    keyPolicy: input.keyPolicy,
    spaceKey: spaceCred.apiKey || localKey,
    tenantKey: tenantCred.apiKey,
    platformKey: platformKey || localKey,
    providerId: input.providerId,
  })

  return {
    apiKey: picked.apiKey,
    endpoint,
    adapter: providerAdapterId(provider.id, provider.adapter),
  }
}

async function getCatalogModelById(modelId: string): Promise<CatalogModelRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("llm_models")
    .select("id, provider_id, model_id, enabled, default_for_tenants, llm_providers(adapter, endpoint, enabled)")
    .eq("id", modelId)
    .maybeSingle()
  if (!data) return null
  const provider = Array.isArray(data.llm_providers) ? data.llm_providers[0] : data.llm_providers
  return {
    id: data.id,
    provider_id: data.provider_id,
    model_id: data.model_id,
    enabled: Boolean(data.enabled && provider?.enabled),
    defaultForTenants: Boolean(data.default_for_tenants),
    adapter: provider?.adapter,
    endpoint: provider?.endpoint,
  }
}

async function getCatalogModelByProviderModel(providerId: string, modelId: string): Promise<CatalogModelRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("llm_models")
    .select("id, provider_id, model_id, enabled, default_for_tenants")
    .eq("provider_id", providerId)
    .eq("model_id", modelId)
    .maybeSingle()
  if (!data) return null
  return {
    ...data,
    defaultForTenants: Boolean(data.default_for_tenants),
  }
}

async function getFlag(
  table: "tenant_llm_settings" | "tenant_llm_provider_settings" | "space_llm_settings" | "space_llm_provider_settings",
  match: Record<string, string>,
): Promise<boolean | null> {
  const admin = createAdminClient()
  const { data } = await admin.from(table).select("enabled").match(match).maybeSingle()
  if (!data) return null
  return Boolean(data.enabled)
}

async function isCatalogAllowed(input: {
  tenantId: string | null
  spaceId?: string | null
  providerId: string
  catalogModelId: string
  policy: TenantLlmAccessPolicy
}): Promise<boolean> {
  if (!input.tenantId && !input.spaceId) return true
  const [tenantProviderEnabled, tenantModelEnabled, spaceProviderEnabled, spaceModelEnabled] = await Promise.all([
    input.tenantId
      ? getFlag("tenant_llm_provider_settings", { tenant_id: input.tenantId, provider_id: input.providerId })
      : Promise.resolve(null),
    input.tenantId
      ? getFlag("tenant_llm_settings", { tenant_id: input.tenantId, model_id: input.catalogModelId })
      : Promise.resolve(null),
    input.spaceId
      ? getFlag("space_llm_provider_settings", { space_id: input.spaceId, provider_id: input.providerId })
      : Promise.resolve(null),
    input.spaceId
      ? getFlag("space_llm_settings", { space_id: input.spaceId, model_id: input.catalogModelId })
      : Promise.resolve(null),
  ])
  return isCatalogEntryEnabled({
    policy: input.policy,
    tenantProviderEnabled,
    tenantModelEnabled,
    spaceProviderEnabled,
    spaceModelEnabled,
  })
}

export async function getTenantLlmPolicies(tenantId: string | null): Promise<{
  accessPolicy: TenantLlmAccessPolicy
  keyPolicy: TenantLlmKeyPolicy
}> {
  if (!tenantId) return { accessPolicy: "global", keyPolicy: "platform_only" }
  const admin = createAdminClient()
  const { data } = await admin
    .from("tenants")
    .select("llm_access_policy, llm_key_policy")
    .eq("id", tenantId)
    .maybeSingle()
  const keyPolicy: TenantLlmKeyPolicy = data?.llm_key_policy === "allow_byok" ? "allow_byok" : "platform_only"
  return {
    accessPolicy: mapLegacyKeyPolicy(data?.llm_access_policy || data?.llm_key_policy),
    keyPolicy,
  }
}

export async function getTenantAccessPolicy(tenantId: string | null): Promise<TenantLlmAccessPolicy> {
  return (await getTenantLlmPolicies(tenantId)).accessPolicy
}

export async function resolvePlatformTaskLlm(task: PlatformTask): Promise<ResolvedLlmTarget> {
  const admin = createAdminClient()
  const { data: taskRow } = await admin
    .from("platform_task_models")
    .select("model_id, llm_models(id, provider_id, model_id, enabled, llm_providers(adapter, endpoint, enabled))")
    .eq("task", task)
    .maybeSingle()

  const model = Array.isArray(taskRow?.llm_models) ? taskRow.llm_models[0] : taskRow?.llm_models
  const provider = model ? (Array.isArray(model.llm_providers) ? model.llm_providers[0] : model.llm_providers) : null
  if (!model?.enabled || !provider?.enabled) {
    throw new Error(`Platform task "${task}" has no enabled model configured.`)
  }

  const vault = await resolveVaultForProvider({
    tenantId: null,
    providerId: model.provider_id,
    accessPolicy: "global",
    keyPolicy: "platform_only",
  })

  return {
    provider: vault.adapter,
    model: model.model_id,
    catalogModelId: model.id,
    apiKey: vault.apiKey,
    endpoint: vault.endpoint,
  }
}

export async function resolveTenantAgentLlm(input: {
  tenantId: string
  spaceId?: string | null
  catalogModelId?: string | null
  provider?: string | null
  model?: string | null
}): Promise<ResolvedLlmTarget> {
  const { accessPolicy: policy, keyPolicy } = await getTenantLlmPolicies(input.tenantId)

  let catalog: CatalogModelRow | null = null
  if (input.catalogModelId) {
    catalog = await getCatalogModelById(input.catalogModelId)
  } else if (input.provider && input.model) {
    const providerId = input.provider === "anthropic" ? "anthropic" : input.provider.replace(/-compatible$/, "")
    catalog = await getCatalogModelByProviderModel(providerId === "openai" ? "openai" : providerId, input.model)
    if (!catalog && providerId !== "openai") {
      catalog = await getCatalogModelByProviderModel("openai", input.model)
    }
  }

  if (!catalog || !catalog.enabled) {
    throw new Error("Selected model is not available in the platform catalog.")
  }
  if (usesAgoraPlatformKeys(keyPolicy) && !isAllowedForAgoraKeyOrgs(catalog)) {
    throw new Error("Selected model is not allowed for organisations that use Agora keys.")
  }

  const allowed = await isCatalogAllowed({
    tenantId: input.tenantId,
    spaceId: input.spaceId,
    providerId: catalog.provider_id,
    catalogModelId: catalog.id,
    policy,
  })
  if (!allowed) {
    throw new Error("Selected model is not enabled for this authority.")
  }

  const vault = await resolveVaultForProvider({
    tenantId: input.tenantId,
    spaceId: input.spaceId,
    providerId: catalog.provider_id,
    accessPolicy: policy,
    keyPolicy,
  })

  return {
    provider: vault.adapter,
    model: catalog.model_id,
    catalogModelId: catalog.id,
    apiKey: vault.apiKey,
    endpoint: vault.endpoint,
  }
}

export async function resolveAgentVersionLlm(input: {
  tenantId: string | null
  spaceId?: string | null
  agentVersion: {
    catalogModelId?: string | null
    provider?: string | null
    model?: string | null
    endpoint?: string | null
  } | null
}): Promise<ResolvedLlmTarget> {
  if (!input.agentVersion) {
    return resolvePlatformTaskLlm("draft")
  }
  if (input.tenantId) {
    try {
      const resolved = await resolveTenantAgentLlm({
        tenantId: input.tenantId,
        spaceId: input.spaceId,
        catalogModelId: input.agentVersion.catalogModelId,
        provider: input.agentVersion.provider,
        model: input.agentVersion.model,
      })
      return {
        ...resolved,
        endpoint: input.agentVersion.endpoint || resolved.endpoint,
      }
    } catch {
      return resolvePlatformTaskLlm("draft")
    }
  }
  return resolvePlatformTaskLlm("draft")
}

export async function completeResolved(
  target: ResolvedLlmTarget,
  input: Omit<LlmCompleteInput, "provider" | "model" | "apiKey" | "endpoint">,
): Promise<LlmCompleteResult> {
  return completeLlm({
    ...input,
    provider: target.provider,
    model: target.model,
    apiKey: target.apiKey,
    endpoint: target.endpoint,
  })
}

export async function resolvePlatformTaskLlmWithFallback(
  task: PlatformTask,
  fallback: PlatformTask,
): Promise<ResolvedLlmTarget> {
  try {
    return await resolvePlatformTaskLlm(task)
  } catch {
    return resolvePlatformTaskLlm(fallback)
  }
}

export async function completePlatformTask(
  task: PlatformTask,
  input: Omit<LlmCompleteInput, "provider" | "model" | "apiKey" | "endpoint">,
): Promise<LlmCompleteResult> {
  const target = await resolvePlatformTaskLlm(task)
  return completeResolved(target, input)
}

export async function hasPlatformLlmCredentials(): Promise<boolean> {
  const admin = createAdminClient()
  const { count } = await admin.from("platform_llm_credentials").select("provider_id", { count: "exact", head: true })
  return (count ?? 0) > 0
}

export async function getTenantIdForSpace(spaceId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("spaces").select("tenant_id").eq("id", spaceId).maybeSingle()
  return data?.tenant_id ?? null
}

export async function ensureSuperAdminFromEnv(userId: string, email: string | null | undefined) {
  const allowlist = (process.env.PLATFORM_SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!email || allowlist.length === 0 || !allowlist.includes(email.toLowerCase())) return
  const admin = createAdminClient()
  await admin.from("profiles").update({ platform_role: "super_admin" }).eq("id", userId)
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("platform_role").eq("id", userId).maybeSingle()
  return data?.platform_role === "super_admin"
}

export async function listTenantEnabledModels(tenantId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("tenant_llm_settings")
    .select(
      "enabled, model_id, llm_models(id, provider_id, model_id, label, enabled, cost_hint, sort_order, default_for_tenants, llm_providers(id, label, enabled))",
    )
    .eq("tenant_id", tenantId)
    .order("model_id")
  if (error) return { error: error.message, data: [] as Array<Record<string, unknown>> }
  return { data: data || [] }
}
