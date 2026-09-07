"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { canOverrideAuthorityCatalog, canStoreSpaceApiKeys } from "@/lib/llm/catalog"
import { getTenantAccessPolicy } from "@/lib/llm/resolve"
import { requireAuthAndPermission } from "@/lib/middleware/authorization"
import { encryptSecret } from "@/lib/security/crypto"
import { mapTenantRow } from "@/lib/tenant/membership"

async function requireSpaceAdmin(spaceId: string) {
  try {
    await requireAuthAndPermission("space:update", { spaceId })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unauthorized" }
  }
  return { error: null }
}

export async function getSpaceLlmAdminState(spaceId: string) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error, data: null }

  const supabase = await createClient()
  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("tenant_id, tenants(id, name, llm_key_policy, llm_access_policy)")
    .eq("id", spaceId)
    .maybeSingle()
  if (spaceError || !space?.tenant_id) {
    return { error: spaceError?.message || "Authority not found", data: null }
  }

  const tenant = Array.isArray(space.tenants) ? space.tenants[0] : space.tenants
  const mappedTenant = tenant ? mapTenantRow(tenant) : null
  const policy = mappedTenant?.llmAccessPolicy ?? (await getTenantAccessPolicy(space.tenant_id))
  const keyPolicy = mappedTenant?.llmKeyPolicy ?? "platform_only"

  const admin = createAdminClient()
  const [providers, tenantSettings, tenantProviders, tenantCredentials, spaceSettings, spaceProviders, spaceCredentials] =
    await Promise.all([
      admin
        .from("llm_providers")
        .select("id, label, enabled, sort_order, llm_models(id, provider_id, model_id, label, enabled, cost_hint, sort_order)")
        .eq("enabled", true)
        .order("sort_order"),
      admin.from("tenant_llm_settings").select("model_id, enabled").eq("tenant_id", space.tenant_id),
      admin.from("tenant_llm_provider_settings").select("provider_id, enabled").eq("tenant_id", space.tenant_id),
      admin.from("tenant_llm_credentials").select("provider_id").eq("tenant_id", space.tenant_id),
      admin.from("space_llm_settings").select("model_id, enabled").eq("space_id", spaceId),
      admin.from("space_llm_provider_settings").select("provider_id, enabled").eq("space_id", spaceId),
      admin.from("space_llm_credentials").select("provider_id, endpoint, updated_at").eq("space_id", spaceId),
    ])

  return {
    data: {
      tenant: mappedTenant,
      policy,
      canOverrideCatalog: canOverrideAuthorityCatalog(policy),
      canStoreKeys: canStoreSpaceApiKeys({ accessPolicy: policy, keyPolicy }),
      usesAgoraKeys: keyPolicy !== "allow_byok",
      providers: providers.data || [],
      tenantSettings: tenantSettings.data || [],
      tenantProviderSettings: tenantProviders.data || [],
      tenantCredentialProviders: (tenantCredentials.data || []).map((row) => row.provider_id as string),
      settings: spaceSettings.data || [],
      providerSettings: spaceProviders.data || [],
      credentials: spaceCredentials.data || [],
    },
  }
}

export async function setSpaceProviderEnabled(spaceId: string, providerId: string, enabled: boolean) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error }
  const state = await getSpaceLlmAdminState(spaceId)
  if (state.error) return { error: state.error }
  if (!state.data?.canOverrideCatalog) {
    return { error: "This organisation applies models globally. Authority overrides are off." }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("space_llm_provider_settings").upsert(
    {
      space_id: spaceId,
      provider_id: providerId,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "space_id,provider_id" },
  )
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function setSpaceModelEnabled(spaceId: string, modelId: string, enabled: boolean) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error }
  const state = await getSpaceLlmAdminState(spaceId)
  if (state.error) return { error: state.error }
  if (!state.data?.canOverrideCatalog) {
    return { error: "This organisation applies models globally. Authority overrides are off." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("space_llm_settings")
    .upsert({ space_id: spaceId, model_id: modelId, enabled }, { onConflict: "space_id,model_id" })
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function resetSpaceLlmOverrides(spaceId: string) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error }
  const admin = createAdminClient()
  const [providers, settings] = await Promise.all([
    admin.from("space_llm_provider_settings").delete().eq("space_id", spaceId),
    admin.from("space_llm_settings").delete().eq("space_id", spaceId),
  ])
  if (providers.error) return { error: providers.error.message }
  if (settings.error) return { error: settings.error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function copyTenantLlmDefaultsToSpace(spaceId: string) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error }
  const state = await getSpaceLlmAdminState(spaceId)
  if (state.error || !state.data?.tenant) return { error: state.error || "Authority not found" }
  if (!state.data.canOverrideCatalog) {
    return { error: "This organisation applies models globally. Authority overrides are off." }
  }

  const admin = createAdminClient()
  const tenantId = state.data.tenant.id
  const [tenantSettings, tenantProviders] = await Promise.all([
    admin.from("tenant_llm_settings").select("model_id, enabled").eq("tenant_id", tenantId),
    admin.from("tenant_llm_provider_settings").select("provider_id, enabled").eq("tenant_id", tenantId),
  ])

  if ((tenantSettings.data || []).length > 0) {
    const { error } = await admin.from("space_llm_settings").upsert(
      (tenantSettings.data || []).map((row) => ({
        space_id: spaceId,
        model_id: row.model_id,
        enabled: Boolean(row.enabled),
      })),
      { onConflict: "space_id,model_id" },
    )
    if (error) return { error: error.message }
  }
  if ((tenantProviders.data || []).length > 0) {
    const { error } = await admin.from("space_llm_provider_settings").upsert(
      (tenantProviders.data || []).map((row) => ({
        space_id: spaceId,
        provider_id: row.provider_id,
        enabled: Boolean(row.enabled),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "space_id,provider_id" },
    )
    if (error) return { error: error.message }
  }

  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function saveSpaceProviderCredential(
  spaceId: string,
  providerId: string,
  apiKey: string,
  endpoint?: string | null,
) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error }
  const state = await getSpaceLlmAdminState(spaceId)
  if (state.error) return { error: state.error }
  if (!state.data?.canStoreKeys) {
    return {
      error: state.data?.usesAgoraKeys
        ? "This organisation uses Agora platform keys. Authority keys are off."
        : "This organisation uses a global API key. Authority keys are off.",
    }
  }
  if (!apiKey.trim()) return { error: "API key is required." }

  const admin = createAdminClient()
  const { error } = await admin.from("space_llm_credentials").upsert(
    {
      space_id: spaceId,
      provider_id: providerId,
      encrypted_key: encryptSecret(apiKey.trim()),
      endpoint: endpoint?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "space_id,provider_id" },
  )
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}

export async function clearSpaceProviderCredential(spaceId: string, providerId: string) {
  const gate = await requireSpaceAdmin(spaceId)
  if (gate.error) return { error: gate.error }
  const state = await getSpaceLlmAdminState(spaceId)
  if (state.error) return { error: state.error }
  if (!state.data?.canStoreKeys) {
    return { error: "This organisation does not store authority API keys." }
  }
  const admin = createAdminClient()
  const { error } = await admin.from("space_llm_credentials").delete().eq("space_id", spaceId).eq("provider_id", providerId)
  if (error) return { error: error.message }
  revalidatePath(`/spaces/${spaceId}`)
  return { success: true }
}
