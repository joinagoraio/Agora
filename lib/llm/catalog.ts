export const LLM_ADAPTERS = ["openai-compatible", "anthropic"] as const
export type LlmAdapterId = (typeof LLM_ADAPTERS)[number]

export const PLATFORM_TASKS = [
  "help",
  "space_ask",
  "chat",
  "chat_preview",
  "draft",
  "measures",
  "qc",
  "qc_default",
  "summarize",
  "query_rewrite",
  "enhance",
  "overheid_search",
  "chat_title",
] as const

export type PlatformTask = (typeof PLATFORM_TASKS)[number]

export type LlmProviderRecord = {
  id: string
  label: string
  enabled: boolean
  adapter: LlmAdapterId
  endpoint: string | null
  sortOrder: number
  hasKey?: boolean
}

export type LlmModelRecord = {
  id: string
  providerId: string
  modelId: string
  label: string
  enabled: boolean
  defaultForTenants: boolean
  costHint: string | null
  sortOrder: number
}

export type ResolvedLlmTarget = {
  provider: LlmAdapterId
  model: string
  catalogModelId?: string | null
  apiKey: string
  endpoint?: string | null
}

export function providerAdapterId(providerId: string, adapter?: string | null): LlmAdapterId {
  if (adapter === "anthropic" || providerId === "anthropic") return "anthropic"
  return "openai-compatible"
}

export function isPlatformTask(value: string): value is PlatformTask {
  return (PLATFORM_TASKS as readonly string[]).includes(value)
}

export function isLlmAdapterId(value: string): value is LlmAdapterId {
  return (LLM_ADAPTERS as readonly string[]).includes(value)
}

export function slugifyProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export const LLM_ACCESS_POLICIES = ["global", "global_with_override", "authority_only"] as const
export type TenantLlmAccessPolicy = (typeof LLM_ACCESS_POLICIES)[number]

export const LLM_KEY_POLICIES = ["platform_only", "allow_byok"] as const
export type TenantLlmKeyPolicy = (typeof LLM_KEY_POLICIES)[number]

export function isLlmAccessPolicy(value: unknown): value is TenantLlmAccessPolicy {
  return value === "global" || value === "global_with_override" || value === "authority_only"
}

export function isLlmKeyPolicy(value: unknown): value is TenantLlmKeyPolicy {
  return value === "platform_only" || value === "allow_byok"
}

export function mapLegacyKeyPolicy(policy: string | null | undefined): TenantLlmAccessPolicy {
  if (isLlmAccessPolicy(policy)) return policy
  if (policy === "allow_byok") return "global_with_override"
  return "global"
}

/** Platform admin: Use Agora keys. Organisation and authority key fields stay hidden. */
export function usesAgoraPlatformKeys(keyPolicy: string | null | undefined): boolean {
  return keyPolicy !== "allow_byok"
}

export function canStoreTenantApiKeys(input: {
  accessPolicy: TenantLlmAccessPolicy
  keyPolicy?: string | null
}): boolean {
  if (usesAgoraPlatformKeys(input.keyPolicy)) return false
  return input.accessPolicy === "global" || input.accessPolicy === "global_with_override"
}

export function canStoreSpaceApiKeys(input: {
  accessPolicy: TenantLlmAccessPolicy
  keyPolicy?: string | null
}): boolean {
  if (usesAgoraPlatformKeys(input.keyPolicy)) return false
  return input.accessPolicy === "global_with_override" || input.accessPolicy === "authority_only"
}

export function canOverrideAuthorityCatalog(policy: TenantLlmAccessPolicy): boolean {
  return policy === "global_with_override" || policy === "authority_only"
}

/** Resolve whether a provider/model pair is allowed after applying the tenant access policy. */
export function isCatalogEntryEnabled(input: {
  policy: TenantLlmAccessPolicy
  tenantProviderEnabled?: boolean | null
  tenantModelEnabled?: boolean | null
  spaceProviderEnabled?: boolean | null
  spaceModelEnabled?: boolean | null
}): boolean {
  const tenantProvider = input.tenantProviderEnabled ?? true
  const tenantModel = input.tenantModelEnabled ?? false
  if (input.policy === "global") {
    return tenantProvider && tenantModel
  }
  if (input.policy === "global_with_override") {
    const provider = input.spaceProviderEnabled ?? tenantProvider
    const model = input.spaceModelEnabled ?? tenantModel
    return Boolean(provider && model)
  }
  return input.spaceProviderEnabled === true && input.spaceModelEnabled === true
}

/**
 * Key cascade, after the platform admin key policy:
 * - Agora keys (platform_only): platform key only; leftover org/authority keys are ignored
 * - Org keys (allow_byok) + global: tenant key, else platform
 * - Org keys + global_with_override: space key, else tenant, else platform
 * - Org keys + authority_only: space key only
 */
export function pickVaultApiKey(input: {
  accessPolicy: TenantLlmAccessPolicy | "platform_only" | "allow_byok"
  keyPolicy?: TenantLlmKeyPolicy | string | null
  spaceKey?: string | null
  tenantKey: string | null
  platformKey: string | null
  providerId: string
}): { source: "space" | "tenant" | "platform"; apiKey: string } {
  if (usesAgoraPlatformKeys(input.keyPolicy)) {
    if (input.platformKey) return { source: "platform", apiKey: input.platformKey }
    throw new Error(`No Agora platform API key stored for "${input.providerId}".`)
  }
  const policy = mapLegacyKeyPolicy(input.accessPolicy)
  if (policy === "authority_only") {
    if (input.spaceKey) return { source: "space", apiKey: input.spaceKey }
    throw new Error(`This authority must add its own API key for "${input.providerId}".`)
  }
  if (policy === "global_with_override") {
    if (input.spaceKey) return { source: "space", apiKey: input.spaceKey }
    if (input.tenantKey) return { source: "tenant", apiKey: input.tenantKey }
    if (input.platformKey) return { source: "platform", apiKey: input.platformKey }
    throw new Error(
      `No API key stored for "${input.providerId}". Add a global key, an authority key, or a platform key.`,
    )
  }
  if (input.tenantKey) return { source: "tenant", apiKey: input.tenantKey }
  if (input.platformKey) return { source: "platform", apiKey: input.platformKey }
  throw new Error(`No API key stored for "${input.providerId}". Add a global key in Models settings or a platform key.`)
}
