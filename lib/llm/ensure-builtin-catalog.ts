import { createAdminClient } from "@/lib/supabase/admin"
import {
  BUILTIN_CHAT_MODELS,
  BUILTIN_PROVIDERS,
  isCorePlatformProvider,
} from "@/lib/llm/builtin-catalog"

export async function ensureBuiltinCatalogModels() {
  const admin = createAdminClient()
  const providerError = await ensureBuiltinProviders(admin)
  if (providerError) return { imported: 0, error: providerError }

  await admin.from("llm_models").update({ default_for_tenants: false }).eq("enabled", false).eq("default_for_tenants", true)

  const { data: existing } = await admin.from("llm_models").select("provider_id, model_id")
  const have = new Set((existing || []).map((row) => `${row.provider_id}:${row.model_id}`))
  const missing = BUILTIN_CHAT_MODELS.filter((model) => !have.has(`${model.providerId}:${model.modelId}`))
  if (missing.length === 0) return { imported: 0 }

  const { error } = await admin.from("llm_models").insert(
    missing.map((model, index) => ({
      provider_id: model.providerId,
      model_id: model.modelId,
      label: model.label,
      enabled: isCorePlatformProvider(model.providerId),
      default_for_tenants: false,
      cost_hint: model.costHint,
      sort_order: 100 + index,
    })),
  )
  if (error) return { imported: 0, error: error.message }
  return { imported: missing.length }
}

async function ensureBuiltinProviders(admin: ReturnType<typeof createAdminClient>) {
  const { data: existing, error: readError } = await admin.from("llm_providers").select("id")
  if (readError) return readError.message

  const have = new Set((existing || []).map((row) => row.id as string))
  const missing = BUILTIN_PROVIDERS.filter((provider) => !have.has(provider.id))
  if (missing.length === 0) return null

  const { error } = await admin.from("llm_providers").insert(
    missing.map((provider) => ({
      id: provider.id,
      label: provider.label,
      enabled: isCorePlatformProvider(provider.id),
      sort_order: provider.sortOrder,
      adapter: provider.adapter,
      endpoint: provider.endpoint,
    })),
  )
  if (error) return error.message

  // Keep built-in cards in catalog order when a new provider is inserted in the middle.
  await Promise.all(
    BUILTIN_PROVIDERS.map((provider) =>
      admin.from("llm_providers").update({ sort_order: provider.sortOrder }).eq("id", provider.id),
    ),
  )
  return null
}
