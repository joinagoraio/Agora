import type { LlmAdapterId } from "@/lib/llm/catalog"
import { isLocalLlmEndpoint } from "@/lib/llm/provider-models"

export type BuiltinProvider = {
  id: string
  label: string
  adapter: LlmAdapterId
  endpoint: string
  sortOrder: number
}

export type BuiltinChatModel = {
  providerId: string
  modelId: string
  label: string
  costHint: "low" | "mid" | "high"
}

/** Providers Agora offers before someone adds a custom endpoint. */
export const BUILTIN_PROVIDERS: readonly BuiltinProvider[] = [
  {
    id: "openai",
    label: "OpenAI",
    adapter: "openai-compatible",
    endpoint: "https://api.openai.com/v1",
    sortOrder: 1,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    adapter: "anthropic",
    endpoint: "https://api.anthropic.com/v1",
    sortOrder: 2,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    adapter: "openai-compatible",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    sortOrder: 3,
  },
  {
    id: "groq",
    label: "Groq",
    adapter: "openai-compatible",
    endpoint: "https://api.groq.com/openai/v1",
    sortOrder: 4,
  },
  {
    id: "xai",
    label: "xAI Grok",
    adapter: "openai-compatible",
    endpoint: "https://api.x.ai/v1",
    sortOrder: 5,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    adapter: "openai-compatible",
    endpoint: "http://127.0.0.1:11434/v1",
    sortOrder: 6,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    adapter: "openai-compatible",
    endpoint: "https://openrouter.ai/api/v1",
    sortOrder: 7,
  },
]

/** Chat models Agora offers before a provider key loads the live list. */
export const BUILTIN_CHAT_MODELS: readonly BuiltinChatModel[] = [
  { providerId: "openai", modelId: "gpt-6-astra", label: "GPT-6 Astra", costHint: "high" },
  { providerId: "openai", modelId: "gpt-5.6", label: "GPT-5.6", costHint: "high" },
  { providerId: "openai", modelId: "gpt-5.6-sol", label: "GPT-5.6 Sol", costHint: "high" },
  { providerId: "openai", modelId: "gpt-5.6-terra", label: "GPT-5.6 Terra", costHint: "mid" },
  { providerId: "openai", modelId: "gpt-5.6-luna", label: "GPT-5.6 Luna", costHint: "low" },
  { providerId: "openai", modelId: "gpt-5.5", label: "GPT-5.5", costHint: "high" },
  { providerId: "openai", modelId: "gpt-5.4", label: "GPT-5.4", costHint: "mid" },
  { providerId: "openai", modelId: "gpt-5.4-mini", label: "GPT-5.4 mini", costHint: "low" },
  { providerId: "openai", modelId: "gpt-5.4-nano", label: "GPT-5.4 nano", costHint: "low" },
  { providerId: "openai", modelId: "gpt-5", label: "GPT-5", costHint: "high" },
  { providerId: "openai", modelId: "gpt-5-mini", label: "GPT-5 mini", costHint: "mid" },
  { providerId: "openai", modelId: "gpt-5-nano", label: "GPT-5 nano", costHint: "low" },
  { providerId: "openai", modelId: "gpt-4.1", label: "GPT-4.1", costHint: "mid" },
  { providerId: "openai", modelId: "gpt-4.1-mini", label: "GPT-4.1 mini", costHint: "low" },
  { providerId: "openai", modelId: "gpt-4.1-nano", label: "GPT-4.1 nano", costHint: "low" },
  { providerId: "openai", modelId: "gpt-4o", label: "GPT-4o", costHint: "mid" },
  { providerId: "openai", modelId: "gpt-4o-mini", label: "GPT-4o mini", costHint: "low" },
  { providerId: "openai", modelId: "o4-mini", label: "o4 mini", costHint: "mid" },
  { providerId: "openai", modelId: "o3", label: "o3", costHint: "high" },
  { providerId: "openai", modelId: "o3-mini", label: "o3 mini", costHint: "mid" },
  { providerId: "anthropic", modelId: "claude-fable-5", label: "Claude Fable 5", costHint: "high" },
  { providerId: "anthropic", modelId: "claude-opus-5", label: "Claude Opus 5", costHint: "high" },
  { providerId: "anthropic", modelId: "claude-sonnet-5", label: "Claude Sonnet 5", costHint: "mid" },
  { providerId: "anthropic", modelId: "claude-haiku-4-5", label: "Claude Haiku 4.5", costHint: "low" },
  { providerId: "anthropic", modelId: "claude-opus-4-8", label: "Claude Opus 4.8", costHint: "high" },
  { providerId: "anthropic", modelId: "claude-opus-4-7", label: "Claude Opus 4.7", costHint: "high" },
  { providerId: "anthropic", modelId: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", costHint: "mid" },
  { providerId: "anthropic", modelId: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", costHint: "mid" },
  { providerId: "anthropic", modelId: "claude-opus-4-5", label: "Claude Opus 4.5", costHint: "high" },
  { providerId: "anthropic", modelId: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", costHint: "mid" },
  { providerId: "anthropic", modelId: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", costHint: "low" },
  { providerId: "gemini", modelId: "gemini-3.8-flash", label: "Gemini 3.8 Flash", costHint: "mid" },
  { providerId: "gemini", modelId: "gemini-2.5-pro", label: "Gemini 2.5 Pro", costHint: "high" },
  { providerId: "gemini", modelId: "gemini-2.5-flash", label: "Gemini 2.5 Flash", costHint: "mid" },
  { providerId: "gemini", modelId: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", costHint: "low" },
  { providerId: "gemini", modelId: "gemini-2.0-flash", label: "Gemini 2.0 Flash", costHint: "low" },
  { providerId: "groq", modelId: "openai/gpt-oss-120b", label: "GPT-OSS 120B", costHint: "high" },
  { providerId: "groq", modelId: "openai/gpt-oss-20b", label: "GPT-OSS 20B", costHint: "low" },
  { providerId: "groq", modelId: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B", costHint: "mid" },
  { providerId: "xai", modelId: "grok-4.6", label: "Grok 4.6", costHint: "high" },
  { providerId: "xai", modelId: "grok-4.5", label: "Grok 4.5", costHint: "high" },
  { providerId: "xai", modelId: "grok-4.3", label: "Grok 4.3", costHint: "high" },
  { providerId: "xai", modelId: "grok-4", label: "Grok 4", costHint: "high" },
  { providerId: "xai", modelId: "grok-3-mini", label: "Grok 3 mini", costHint: "low" },
  { providerId: "ollama", modelId: "llama3.2", label: "Llama 3.2", costHint: "low" },
  { providerId: "ollama", modelId: "llama3.1", label: "Llama 3.1", costHint: "mid" },
  { providerId: "ollama", modelId: "qwen2.5", label: "Qwen 2.5", costHint: "mid" },
  { providerId: "ollama", modelId: "mistral", label: "Mistral", costHint: "low" },
  { providerId: "ollama", modelId: "gemma2", label: "Gemma 2", costHint: "low" },
  { providerId: "ollama", modelId: "deepseek-r1", label: "DeepSeek R1", costHint: "mid" },
  { providerId: "ollama", modelId: "phi4", label: "Phi-4", costHint: "low" },
  { providerId: "openrouter", modelId: "openai/gpt-oss-120b", label: "GPT-OSS 120B", costHint: "high" },
  { providerId: "openrouter", modelId: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", costHint: "mid" },
  { providerId: "openrouter", modelId: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", costHint: "mid" },
  { providerId: "openrouter", modelId: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", costHint: "mid" },
  { providerId: "openrouter", modelId: "deepseek/deepseek-chat", label: "DeepSeek Chat", costHint: "low" },
]

export function builtinChatModelsForProvider(providerId: string): BuiltinChatModel[] {
  return BUILTIN_CHAT_MODELS.filter((model) => model.providerId === providerId)
}

/** Always on the platform list. Other built-ins wait until someone adds them. */
export const CORE_PLATFORM_PROVIDER_IDS = ["openai", "anthropic"] as const

export function isCorePlatformProvider(id: string): boolean {
  return (CORE_PLATFORM_PROVIDER_IDS as readonly string[]).includes(id)
}

export function builtinProviderById(id: string): BuiltinProvider | undefined {
  return BUILTIN_PROVIDERS.find((provider) => provider.id === id)
}

/** Built-in providers that are not yet enabled on the platform list. */
export function availableBuiltinProviders(enabledProviderIds: Iterable<string>): BuiltinProvider[] {
  const have = new Set(enabledProviderIds)
  return BUILTIN_PROVIDERS.filter((provider) => !have.has(provider.id))
}

/** Local Ollama stays in the add list, but Agora has no local server to attach. */
export function canAddBuiltinProvider(provider: Pick<BuiltinProvider, "id" | "endpoint">): boolean {
  return provider.id !== "ollama" && !isLocalLlmEndpoint(provider.endpoint)
}

export const LLM_MODEL_LIST_PREVIEW_COUNT = 4

export type LlmModelListSortable = {
  enabled?: boolean
  providerId?: string
  provider_id?: string
  model_id?: string
  modelId?: string
  sort_order?: number
  label?: string
}

const builtinRank = new Map(
  BUILTIN_CHAT_MODELS.map((model, index) => [`${model.providerId}:${model.modelId}`, index]),
)

function modelListKey(model: LlmModelListSortable): string {
  const provider = model.providerId || model.provider_id || ""
  const id = model.model_id || model.modelId || ""
  return `${provider}:${id}`
}

/** Enabled models first, then newest to oldest, so the collapsed preview is the live set. */
export function compareLlmModelsForList(a: LlmModelListSortable, b: LlmModelListSortable): number {
  const aOn = Boolean(a.enabled)
  const bOn = Boolean(b.enabled)
  if (aOn !== bOn) return aOn ? -1 : 1
  const aRank = builtinRank.get(modelListKey(a))
  const bRank = builtinRank.get(modelListKey(b))
  if (aRank != null && bRank != null) return aRank - bRank
  if (aRank != null) return -1
  if (bRank != null) return 1
  return (b.sort_order ?? 0) - (a.sort_order ?? 0) || String(a.label || "").localeCompare(String(b.label || ""))
}

export function llmModelListPreviewCount(enabledCount: number): number {
  return enabledCount > 0 ? enabledCount : LLM_MODEL_LIST_PREVIEW_COUNT
}

export function previouslyEnabledModelIds<T extends { id: string; enabled?: boolean }>(models: T[]): string[] {
  return models.filter((model) => model.enabled).map((model) => model.id)
}

/** Models Built-in tools may use: provider on the list and model enabled. Newest first. */
export function selectPlatformToolModels<
  T extends LlmModelListSortable & { id: string; provider_id?: string },
>(models: T[] | null | undefined, providers: Array<{ id: string; enabled?: boolean }> | null | undefined): T[] {
  const on = new Set((providers || []).filter((provider) => provider.enabled).map((provider) => provider.id))
  return (models || [])
    .filter((model) => Boolean(model.enabled) && on.has(String(model.provider_id || model.providerId || "")))
    .slice()
    .sort((a, b) =>
      compareLlmModelsForList(
        { ...a, providerId: a.providerId || a.provider_id },
        { ...b, providerId: b.providerId || b.provider_id },
      ),
    )
}

/** Keep every built-in tool on an eligible model. Missing or stale rows take the first (newest) one. */
export function ensurePlatformTaskModelRows(
  tasks: Array<{ task: string; model_id: string }> | null | undefined,
  eligibleIds: string[],
  taskIds: readonly string[],
): Array<{ task: string; model_id: string }> {
  const firstId = eligibleIds[0]
  if (!firstId) return tasks || []
  const allowed = new Set(eligibleIds)
  const current = new Map((tasks || []).map((row) => [row.task, row.model_id]))
  return taskIds.map((task) => ({
    task,
    model_id: allowed.has(current.get(task) || "") ? (current.get(task) as string) : firstId,
  }))
}
