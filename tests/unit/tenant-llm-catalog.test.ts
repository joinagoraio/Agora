import { describe, expect, it } from "vitest"
import {
  canOverrideAuthorityCatalog,
  canStoreSpaceApiKeys,
  canStoreTenantApiKeys,
  isCatalogEntryEnabled,
  isPlatformTask,
  mapLegacyKeyPolicy,
  pickVaultApiKey,
  providerAdapterId,
  slugifyProviderId,
  isAllowedForAgoraKeyOrgs,
  nextCatalogVisibility,
  sanitizeCatalogVisibility,
  withVisibleCatalogModels,
  writeCatalogAllowed,
  writeCatalogEnabled,
} from "@/lib/llm/catalog"
import { applyPromptLanguage, PLATFORM_PROMPT_DEFS } from "@/lib/llm/prompts"
import {
  BUILTIN_CHAT_MODELS,
  BUILTIN_PROVIDERS,
  availableBuiltinProviders,
  builtinChatModelsForProvider,
  builtinProviderById,
  canAddBuiltinProvider,
  compareLlmModelsForList,
  ensurePlatformTaskModelRows,
  isCorePlatformProvider,
  llmModelListPreviewCount,
  previouslyEnabledModelIds,
  selectPlatformToolModels,
} from "@/lib/llm/builtin-catalog"
import {
  apiKeyForProviderRequest,
  humanizeModelId,
  isLikelyChatModel,
  isLocalLlmEndpoint,
  isOfficialOpenAiEndpoint,
  selectChatModels,
} from "@/lib/llm/provider-models"
import { isTenantAdminRole } from "@/lib/tenant/domain"

describe("tenant admin roles", () => {
  it("treats owner and admin as tenant admins", () => {
    expect(isTenantAdminRole("owner")).toBe(true)
    expect(isTenantAdminRole("admin")).toBe(true)
    expect(isTenantAdminRole("member")).toBe(false)
    expect(isTenantAdminRole(undefined)).toBe(false)
  })
})

describe("platform llm catalog helpers", () => {
  it("maps provider ids to adapter ids", () => {
    expect(providerAdapterId("anthropic")).toBe("anthropic")
    expect(providerAdapterId("openai")).toBe("openai-compatible")
    expect(providerAdapterId("gemini")).toBe("openai-compatible")
    expect(providerAdapterId("groq", "openai-compatible")).toBe("openai-compatible")
    expect(providerAdapterId("ollama")).toBe("openai-compatible")
    expect(providerAdapterId("openrouter")).toBe("openai-compatible")
    expect(providerAdapterId("xai")).toBe("openai-compatible")
  })

  it("recognises built-in platform tasks", () => {
    expect(isPlatformTask("help")).toBe(true)
    expect(isPlatformTask("space_ask")).toBe(true)
    expect(isPlatformTask("chat_preview")).toBe(true)
    expect(isPlatformTask("summarize")).toBe(true)
    expect(isPlatformTask("query_rewrite")).toBe(true)
    expect(isPlatformTask("enhance")).toBe(true)
    expect(isPlatformTask("overheid_search")).toBe(true)
    expect(isPlatformTask("chat_title")).toBe(true)
    expect(isPlatformTask("unknown")).toBe(false)
  })

  it("slugifies provider ids", () => {
    expect(slugifyProviderId(" OpenAI Compatible ")).toBe("openai-compatible")
    expect(slugifyProviderId("Groq!!!")).toBe("groq")
  })
})

describe("vault key policy", () => {
  it("maps legacy policies onto the new access model", () => {
    expect(mapLegacyKeyPolicy("platform_only")).toBe("global")
    expect(mapLegacyKeyPolicy("allow_byok")).toBe("global_with_override")
    expect(mapLegacyKeyPolicy("authority_only")).toBe("authority_only")
  })

  it("uses only the platform key when the organisation must use Agora keys", () => {
    expect(
      pickVaultApiKey({
        accessPolicy: "global_with_override",
        keyPolicy: "platform_only",
        spaceKey: "space-secret",
        tenantKey: "tenant-secret",
        platformKey: "platform-secret",
        providerId: "openai",
      }),
    ).toEqual({ source: "platform", apiKey: "platform-secret" })
    expect(() =>
      pickVaultApiKey({
        accessPolicy: "authority_only",
        keyPolicy: "platform_only",
        spaceKey: "space-secret",
        tenantKey: "tenant-secret",
        platformKey: null,
        providerId: "openai",
      }),
    ).toThrow(/Agora platform API key/)
  })

  it("uses a tenant key before the platform key in global mode when organisation keys are allowed", () => {
    expect(
      pickVaultApiKey({
        accessPolicy: "global",
        keyPolicy: "allow_byok",
        tenantKey: "tenant-secret",
        platformKey: "platform-secret",
        providerId: "openai",
      }),
    ).toEqual({ source: "tenant", apiKey: "tenant-secret" })
  })

  it("falls back to the platform key in global mode when organisation keys are allowed", () => {
    expect(
      pickVaultApiKey({
        accessPolicy: "global",
        keyPolicy: "allow_byok",
        tenantKey: null,
        platformKey: "platform-secret",
        providerId: "openai",
      }),
    ).toEqual({ source: "platform", apiKey: "platform-secret" })
  })

  it("lets an authority key override the global key", () => {
    expect(
      pickVaultApiKey({
        accessPolicy: "global_with_override",
        keyPolicy: "allow_byok",
        spaceKey: "space-secret",
        tenantKey: "tenant-secret",
        platformKey: "platform-secret",
        providerId: "openai",
      }),
    ).toEqual({ source: "space", apiKey: "space-secret" })
  })

  it("requires an authority key when the policy is authority-only", () => {
    expect(() =>
      pickVaultApiKey({
        accessPolicy: "authority_only",
        keyPolicy: "allow_byok",
        spaceKey: null,
        tenantKey: "tenant-secret",
        platformKey: "platform-secret",
        providerId: "openai",
      }),
    ).toThrow(/authority must add/)
  })

  it("throws when global mode has no tenant or platform key", () => {
    expect(() =>
      pickVaultApiKey({
        accessPolicy: "global",
        keyPolicy: "allow_byok",
        tenantKey: null,
        platformKey: null,
        providerId: "openai",
      }),
    ).toThrow(/No API key stored/)
  })
})

describe("catalog access policy", () => {
  it("uses only tenant flags in global mode", () => {
    expect(
      isCatalogEntryEnabled({
        policy: "global",
        tenantProviderEnabled: true,
        tenantModelEnabled: true,
        spaceProviderEnabled: false,
        spaceModelEnabled: false,
      }),
    ).toBe(true)
  })

  it("lets authority flags override tenant flags", () => {
    expect(
      isCatalogEntryEnabled({
        policy: "global_with_override",
        tenantProviderEnabled: true,
        tenantModelEnabled: true,
        spaceProviderEnabled: true,
        spaceModelEnabled: false,
      }),
    ).toBe(false)
  })

  it("requires explicit authority flags when authorities own the catalog", () => {
    expect(
      isCatalogEntryEnabled({
        policy: "authority_only",
        tenantProviderEnabled: true,
        tenantModelEnabled: true,
        spaceProviderEnabled: null,
        spaceModelEnabled: null,
      }),
    ).toBe(false)
    expect(canStoreTenantApiKeys({ accessPolicy: "global", keyPolicy: "allow_byok" })).toBe(true)
    expect(canStoreTenantApiKeys({ accessPolicy: "authority_only", keyPolicy: "allow_byok" })).toBe(false)
    expect(canStoreSpaceApiKeys({ accessPolicy: "authority_only", keyPolicy: "allow_byok" })).toBe(true)
    expect(canStoreTenantApiKeys({ accessPolicy: "global", keyPolicy: "platform_only" })).toBe(false)
    expect(canStoreSpaceApiKeys({ accessPolicy: "authority_only", keyPolicy: "platform_only" })).toBe(false)
    expect(canOverrideAuthorityCatalog("global")).toBe(false)
  })
})

describe("platform prompt catalog", () => {
  it("ships defaults for tools, playbooks, identities, and agent seeds", () => {
    const ids = PLATFORM_PROMPT_DEFS.map((entry) => entry.id)
    expect(ids).toContain("help")
    expect(ids).toContain("summarize")
    expect(ids).toContain("overheid_rank")
    expect(ids).toContain("playbook.draft")
    expect(ids).toContain("identity.chat")
    expect(ids).toContain("agent.quality.qc")
  })

  it("appends a language requirement without replacing the prompt body", () => {
    expect(applyPromptLanguage("Write a summary.", "Dutch")).toMatch(/Write a summary/)
    expect(applyPromptLanguage("Write a summary.", "Dutch")).toMatch(/Dutch/)
    expect(applyPromptLanguage("Write a summary.", "  ")).toBe("Write a summary.")
  })
})

describe("provider model listing", () => {
  it("humanizes OpenAI, Claude, and Gemini ids", () => {
    expect(humanizeModelId("gpt-4o-mini")).toBe("GPT-4o mini")
    expect(humanizeModelId("claude-3-5-sonnet-latest")).toBe("Claude 3 5 sonnet latest")
    expect(humanizeModelId("gemini-2.5-flash")).toBe("Gemini 2.5 flash")
    expect(humanizeModelId("openai/gpt-oss-120b")).toBe("GPT-oss 120b")
    expect(humanizeModelId("grok-4.6")).toBe("Grok 4.6")
  })

  it("keeps chat models and drops embeddings and audio", () => {
    expect(isLikelyChatModel("gpt-4o")).toBe(true)
    expect(isLikelyChatModel("gpt-5.6-sol")).toBe(true)
    expect(isLikelyChatModel("o3-mini")).toBe(true)
    expect(isLikelyChatModel("gemini-3.8-flash")).toBe(true)
    expect(isLikelyChatModel("openai/gpt-oss-120b")).toBe(true)
    expect(isLikelyChatModel("llama3.1")).toBe(true)
    expect(isLikelyChatModel("qwen/qwen3.6-27b")).toBe(true)
    expect(isLikelyChatModel("grok-4.6")).toBe(true)
    expect(isLikelyChatModel("text-embedding-3-small")).toBe(false)
    expect(isLikelyChatModel("whisper-1")).toBe(false)
    expect(isLikelyChatModel("gpt-image-1")).toBe(false)
    expect(isLikelyChatModel("gemini-2.5-flash-image")).toBe(false)
  })

  it("ships built-in catalogs for Gemini, Groq, xAI Grok, Ollama, and OpenRouter", () => {
    const openai = builtinChatModelsForProvider("openai").map((model) => model.modelId)
    const anthropic = builtinChatModelsForProvider("anthropic").map((model) => model.modelId)
    const gemini = builtinChatModelsForProvider("gemini").map((model) => model.modelId)
    const xai = builtinChatModelsForProvider("xai").map((model) => model.modelId)
    expect(openai).toEqual(expect.arrayContaining(["gpt-6-astra", "gpt-5.6-sol", "gpt-4o", "gpt-4o-mini"]))
    expect(anthropic).toEqual(expect.arrayContaining(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]))
    expect(gemini).toEqual(expect.arrayContaining(["gemini-3.8-flash", "gemini-2.5-pro", "gemini-2.5-flash"]))
    expect(xai).toEqual(expect.arrayContaining(["grok-4.6", "grok-4", "grok-3-mini"]))
    expect(BUILTIN_PROVIDERS.map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["openai", "anthropic", "gemini", "groq", "xai", "ollama", "openrouter"]),
    )
    expect(BUILTIN_CHAT_MODELS.every((model) => model.modelId.length > 0 && model.label.length > 0)).toBe(true)
    expect(isCorePlatformProvider("openai")).toBe(true)
    expect(isCorePlatformProvider("anthropic")).toBe(true)
    expect(isCorePlatformProvider("ollama")).toBe(false)
    expect(availableBuiltinProviders(["openai", "anthropic"]).map((provider) => provider.id)).toEqual(
      expect.arrayContaining(["gemini", "groq", "xai", "ollama", "openrouter"]),
    )
    expect(availableBuiltinProviders(BUILTIN_PROVIDERS.map((provider) => provider.id))).toEqual([])
    expect(canAddBuiltinProvider(builtinProviderById("xai")!)).toBe(true)
    expect(canAddBuiltinProvider(builtinProviderById("ollama")!)).toBe(false)
    expect(
      withVisibleCatalogModels([
        {
          id: "xai",
          llm_models: [
            { id: "a", enabled: true },
            { id: "b", enabled: false },
          ],
        },
      ])[0].llm_models,
    ).toEqual([{ id: "a", enabled: true }])
    expect(isAllowedForAgoraKeyOrgs({ enabled: true, default_for_tenants: true })).toBe(true)
    expect(isAllowedForAgoraKeyOrgs({ enabled: true, default_for_tenants: false })).toBe(false)
    expect(isAllowedForAgoraKeyOrgs({ enabled: false, default_for_tenants: true })).toBe(false)
    expect(sanitizeCatalogVisibility({ enabled: false, default_for_tenants: true })).toEqual({
      enabled: false,
      default_for_tenants: false,
    })
    expect(nextCatalogVisibility({ enabled: false, default_for_tenants: false }, { default_for_tenants: true })).toEqual({
      enabled: true,
      default_for_tenants: true,
    })
    expect(nextCatalogVisibility({ enabled: true, default_for_tenants: true }, { enabled: false })).toEqual({
      enabled: false,
      default_for_tenants: false,
    })
    expect(nextCatalogVisibility({ enabled: true, default_for_tenants: true }, { enabled: true })).toEqual({
      enabled: true,
      default_for_tenants: true,
    })
    expect(writeCatalogAllowed(true)).toEqual({ enabled: true, default_for_tenants: true })
    expect(writeCatalogEnabled(false)).toEqual({ enabled: false, default_for_tenants: false })
    expect(writeCatalogEnabled(true)).toEqual({ enabled: true })
    expect(
      [
        { id: "old", enabled: false, providerId: "openai", model_id: "gpt-4o", label: "GPT-4o" },
        { id: "new", enabled: true, providerId: "openai", model_id: "gpt-5.6", label: "GPT-5.6" },
        { id: "newer", enabled: true, providerId: "openai", model_id: "gpt-6-astra", label: "GPT-6 Astra" },
      ].sort(compareLlmModelsForList).map((model) => model.id),
    ).toEqual(["newer", "new", "old"])
    expect(llmModelListPreviewCount(3)).toBe(3)
    expect(llmModelListPreviewCount(0)).toBe(4)
    expect(
      previouslyEnabledModelIds([
        { id: "a", enabled: true },
        { id: "b", enabled: false },
        { id: "c", enabled: true },
      ]),
    ).toEqual(["a", "c"])
    expect(
      selectPlatformToolModels(
        [
          { id: "off-provider", enabled: true, provider_id: "anthropic", model_id: "claude-opus-4.6", label: "Opus" },
          { id: "off-model", enabled: false, provider_id: "openai", model_id: "gpt-5.6", label: "GPT-5.6" },
          { id: "older", enabled: true, provider_id: "openai", model_id: "gpt-5.4", label: "GPT-5.4" },
          { id: "newest", enabled: true, provider_id: "openai", model_id: "gpt-5.6", label: "GPT-5.6" },
        ],
        [
          { id: "openai", enabled: true },
          { id: "anthropic", enabled: false },
        ],
      ).map((model) => model.id),
    ).toEqual(["newest", "older"])
    expect(
      ensurePlatformTaskModelRows(
        [
          { task: "help", model_id: "older" },
          { task: "chat", model_id: "gone" },
        ],
        ["newest", "older"],
        ["help", "chat", "draft"],
      ),
    ).toEqual([
      { task: "help", model_id: "older" },
      { task: "chat", model_id: "newest" },
      { task: "draft", model_id: "newest" },
    ])
    expect(ensurePlatformTaskModelRows([{ task: "help", model_id: "older" }], [], ["help"])).toEqual([
      { task: "help", model_id: "older" },
    ])
    expect(
      withVisibleCatalogModels(
        [
          {
            id: "openai",
            llm_models: [
              { id: "allowed", enabled: true, default_for_tenants: true },
              { id: "catalog-only", enabled: true, default_for_tenants: false },
            ],
          },
        ],
        { allowedForAgoraKeyOrgs: true },
      )[0].llm_models,
    ).toEqual([{ id: "allowed", enabled: true, default_for_tenants: true }])
  })

  it("treats Gemini and Groq endpoints as non-OpenAI so open-weight ids stay in the list", () => {
    expect(isOfficialOpenAiEndpoint(null)).toBe(true)
    expect(isOfficialOpenAiEndpoint("https://api.openai.com/v1")).toBe(true)
    expect(isOfficialOpenAiEndpoint("https://generativelanguage.googleapis.com/v1beta/openai")).toBe(false)
    expect(isOfficialOpenAiEndpoint("https://api.groq.com/openai/v1")).toBe(false)
    expect(isOfficialOpenAiEndpoint("https://api.x.ai/v1")).toBe(false)
    expect(isLocalLlmEndpoint("http://127.0.0.1:11434/v1")).toBe(true)
    expect(isLocalLlmEndpoint("https://api.openai.com/v1")).toBe(false)
    expect(apiKeyForProviderRequest(null, "http://127.0.0.1:11434/v1")).toBe("local")
    expect(apiKeyForProviderRequest(null, "https://api.groq.com/openai/v1")).toBeNull()

    const sorted = selectChatModels(
      [
        { id: "llama3.1", label: "llama" },
        { id: "nomic-embed-text", label: "embed" },
      ],
      "openai-compatible",
      "http://127.0.0.1:11434/v1",
    )
    expect(sorted.map((model) => model.id)).toEqual(["llama3.1"])
  })

  it("sorts aliases ahead of dated snapshots", () => {
    const sorted = selectChatModels(
      [
        { id: "gpt-4o-mini-2024-07-18", label: "dated" },
        { id: "gpt-4o-mini", label: "alias" },
        { id: "text-embedding-3-large", label: "embed" },
      ],
      "openai-compatible",
    )
    expect(sorted.map((model) => model.id)).toEqual(["gpt-4o-mini", "gpt-4o-mini-2024-07-18"])
  })
})
