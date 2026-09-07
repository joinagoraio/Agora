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
} from "@/lib/llm/catalog"
import { applyPromptLanguage, PLATFORM_PROMPT_DEFS } from "@/lib/llm/prompts"
import { humanizeModelId, isLikelyChatModel, selectChatModels } from "@/lib/llm/provider-models"
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
    expect(providerAdapterId("groq", "openai-compatible")).toBe("openai-compatible")
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
  it("humanizes OpenAI and Claude ids", () => {
    expect(humanizeModelId("gpt-4o-mini")).toBe("GPT-4o mini")
    expect(humanizeModelId("claude-3-5-sonnet-latest")).toBe("Claude 3 5 sonnet latest")
  })

  it("keeps chat models and drops embeddings and audio", () => {
    expect(isLikelyChatModel("gpt-4o")).toBe(true)
    expect(isLikelyChatModel("o3-mini")).toBe(true)
    expect(isLikelyChatModel("text-embedding-3-small")).toBe(false)
    expect(isLikelyChatModel("whisper-1")).toBe(false)
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
