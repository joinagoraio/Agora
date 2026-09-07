"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  canStoreTenantApiKeys,
  isCatalogEntryEnabled,
  isLlmAccessPolicy,
  type TenantLlmAccessPolicy,
} from "@/lib/llm/catalog"
import { getTenantAccessPolicy } from "@/lib/llm/resolve"
import { encryptSecret } from "@/lib/security/crypto"
import { isTenantAdminRole } from "@/lib/tenant/domain"
import { mapTenantRow } from "@/lib/tenant/membership"

async function requireTenantAdmin(tenantId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" as const, user: null }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("role, tenants(id, name, llm_key_policy, llm_access_policy)")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership || !isTenantAdminRole(membership.role)) {
    return { error: "Forbidden" as const, user: null }
  }

  const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants
  return { user, tenant: tenant ? mapTenantRow(tenant) : null }
}

function revalidateModelsSurfaces(spaceId?: string) {
  revalidatePath("/dashboard")
  revalidatePath("/admin/agents")
  if (spaceId) revalidatePath(`/spaces/${spaceId}`)
}

export async function getTenantLlmAdminState(tenantId: string) {
  const gate = await requireTenantAdmin(tenantId)
  if (gate.error) return { error: gate.error, data: null }

  const admin = createAdminClient()
  const [providers, settings, providerSettings, credentials] = await Promise.all([
    admin
      .from("llm_providers")
      .select("id, label, enabled, sort_order, llm_models(id, provider_id, model_id, label, enabled, cost_hint, sort_order)")
      .eq("enabled", true)
      .order("sort_order"),
    admin.from("tenant_llm_settings").select("model_id, enabled").eq("tenant_id", tenantId),
    admin.from("tenant_llm_provider_settings").select("provider_id, enabled").eq("tenant_id", tenantId),
    admin.from("tenant_llm_credentials").select("provider_id, endpoint, updated_at").eq("tenant_id", tenantId),
  ])

  return {
    data: {
      tenant: gate.tenant,
      providers: providers.data || [],
      settings: settings.data || [],
      providerSettings: providerSettings.data || [],
      credentials: credentials.data || [],
    },
  }
}

export async function setTenantLlmAccessPolicy(tenantId: string, policy: TenantLlmAccessPolicy) {
  const gate = await requireTenantAdmin(tenantId)
  if (gate.error) return { error: gate.error }
  if (!isLlmAccessPolicy(policy)) return { error: "Unknown access policy." }

  const admin = createAdminClient()
  const { error } = await admin.from("tenants").update({ llm_access_policy: policy }).eq("id", tenantId)
  if (error) return { error: error.message }
  revalidateModelsSurfaces()
  return { success: true }
}

export async function setTenantProviderEnabled(tenantId: string, providerId: string, enabled: boolean) {
  const gate = await requireTenantAdmin(tenantId)
  if (gate.error) return { error: gate.error }

  const admin = createAdminClient()
  const { error } = await admin.from("tenant_llm_provider_settings").upsert(
    {
      tenant_id: tenantId,
      provider_id: providerId,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,provider_id" },
  )
  if (error) return { error: error.message }
  revalidateModelsSurfaces()
  return { success: true }
}

export async function setTenantModelEnabled(tenantId: string, modelId: string, enabled: boolean) {
  const gate = await requireTenantAdmin(tenantId)
  if (gate.error) return { error: gate.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from("tenant_llm_settings")
    .upsert({ tenant_id: tenantId, model_id: modelId, enabled }, { onConflict: "tenant_id,model_id" })
  if (error) return { error: error.message }
  revalidateModelsSurfaces()
  return { success: true }
}

export async function saveTenantProviderCredential(
  tenantId: string,
  providerId: string,
  apiKey: string,
  endpoint?: string | null,
) {
  const gate = await requireTenantAdmin(tenantId)
  if (gate.error) return { error: gate.error }
  const accessPolicy = gate.tenant?.llmAccessPolicy ?? "global"
  const keyPolicy = gate.tenant?.llmKeyPolicy ?? "platform_only"
  if (!canStoreTenantApiKeys({ accessPolicy, keyPolicy })) {
    return {
      error:
        keyPolicy !== "allow_byok"
          ? "This organisation uses Agora platform keys. A platform administrator must allow organisation keys."
          : "This organisation stores API keys on each authority, not globally.",
    }
  }
  if (!apiKey.trim()) return { error: "API key is required." }

  const admin = createAdminClient()
  const { error } = await admin.from("tenant_llm_credentials").upsert(
    {
      tenant_id: tenantId,
      provider_id: providerId,
      encrypted_key: encryptSecret(apiKey.trim()),
      endpoint: endpoint?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,provider_id" },
  )
  if (error) return { error: error.message }
  revalidateModelsSurfaces()
  return { success: true }
}

export async function clearTenantProviderCredential(tenantId: string, providerId: string) {
  const gate = await requireTenantAdmin(tenantId)
  if (gate.error) return { error: gate.error }
  const accessPolicy = gate.tenant?.llmAccessPolicy ?? "global"
  const keyPolicy = gate.tenant?.llmKeyPolicy ?? "platform_only"
  if (!canStoreTenantApiKeys({ accessPolicy, keyPolicy })) {
    return { error: "This organisation does not store organisation API keys." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("tenant_llm_credentials")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
  if (error) return { error: error.message }
  revalidateModelsSurfaces()
  return { success: true }
}

export async function listTenantModelsForAuthority(tenantId: string) {
  const supabase = await createClient()
  const policy = await getTenantAccessPolicy(tenantId)
  const { data, error } = await supabase
    .from("tenant_llm_settings")
    .select(
      "enabled, llm_models(id, provider_id, model_id, label, enabled, llm_providers(id, label, enabled))",
    )
    .eq("tenant_id", tenantId)
    .eq("enabled", true)

  if (error) return { error: error.message, data: [] as Array<Record<string, unknown>> }

  return {
    data: (data || []).filter((row) => {
      const model = Array.isArray(row.llm_models) ? row.llm_models[0] : row.llm_models
      const provider = model?.llm_providers
      const providerRow = Array.isArray(provider) ? provider[0] : provider
      return isCatalogEntryEnabled({
        policy,
        tenantProviderEnabled: providerRow?.enabled !== false,
        tenantModelEnabled: Boolean(row.enabled && model?.enabled),
        spaceProviderEnabled: null,
        spaceModelEnabled: null,
      })
    }),
  }
}

export async function listAuthorityModels(spaceId: string) {
  const supabase = await createClient()
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("tenant_id")
    .eq("id", spaceId)
    .maybeSingle()
  if (spaceError || !space?.tenant_id) {
    return { error: spaceError?.message || "Authority not found", data: [] as Array<Record<string, unknown>> }
  }

  const policy = await getTenantAccessPolicy(space.tenant_id)
  const admin = createAdminClient()
  const [providers, tenantSettings, tenantProviders, spaceSettings, spaceProviders] = await Promise.all([
    admin
      .from("llm_providers")
      .select("id, label, enabled, sort_order, llm_models(id, provider_id, model_id, label, enabled, sort_order)")
      .eq("enabled", true)
      .order("sort_order"),
    admin.from("tenant_llm_settings").select("model_id, enabled").eq("tenant_id", space.tenant_id),
    admin.from("tenant_llm_provider_settings").select("provider_id, enabled").eq("tenant_id", space.tenant_id),
    admin.from("space_llm_settings").select("model_id, enabled").eq("space_id", spaceId),
    admin.from("space_llm_provider_settings").select("provider_id, enabled").eq("space_id", spaceId),
  ])
  if (providers.error) {
    return { error: providers.error.message, data: [] as Array<Record<string, unknown>> }
  }
  if (tenantSettings.error) {
    return { error: tenantSettings.error.message, data: [] as Array<Record<string, unknown>> }
  }

  const tenantModel = new Map((tenantSettings.data || []).map((row) => [row.model_id as string, Boolean(row.enabled)]))
  const tenantProvider = new Map(
    (tenantProviders.data || []).map((row) => [row.provider_id as string, Boolean(row.enabled)]),
  )
  const spaceModel = new Map((spaceSettings.data || []).map((row) => [row.model_id as string, Boolean(row.enabled)]))
  const spaceProvider = new Map(
    (spaceProviders.data || []).map((row) => [row.provider_id as string, Boolean(row.enabled)]),
  )

  const data: Array<Record<string, unknown>> = []
  for (const provider of providers.data || []) {
    const providerModels = Array.isArray(provider.llm_models)
      ? provider.llm_models
      : provider.llm_models
        ? [provider.llm_models]
        : []
    for (const model of providerModels) {
      if (!model?.enabled) continue
      const allowed = isCatalogEntryEnabled({
        policy,
        tenantProviderEnabled: tenantProvider.get(provider.id) ?? true,
        tenantModelEnabled: tenantModel.get(model.id) ?? false,
        spaceProviderEnabled: spaceProvider.has(provider.id) ? spaceProvider.get(provider.id) : null,
        spaceModelEnabled: spaceModel.has(model.id) ? spaceModel.get(model.id) : null,
      })
      if (!allowed) continue
      data.push({
        enabled: true,
        llm_models: {
          id: model.id,
          provider_id: provider.id,
          model_id: model.model_id,
          label: model.label,
          enabled: true,
          llm_providers: { id: provider.id, label: provider.label, enabled: true },
        },
      })
    }
  }

  return { data }
}
