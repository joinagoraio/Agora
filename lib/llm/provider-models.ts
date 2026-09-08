import type { LlmAdapterId } from "@/lib/llm/catalog"

export const DEFAULT_OPENAI_COMPAT_ENDPOINT = "https://api.openai.com/v1"
export const DEFAULT_ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1"
export const LOCAL_LLM_PLACEHOLDER_KEY = "local"

export type RemoteProviderModel = {
  id: string
  label: string
}

const NON_CHAT_MODEL_RE =
  /(whisper|tts|dall-e|embed|moderation|transcribe|realtime|audio-|image|sora|computer-use|babbage|davinci|ada$|omni-moderation|cyber|daybreak)/i

const CHAT_PREFIX_RE =
  /^(gpt-|chatgpt-|o[1-9]|claude|gemini-|llama|qwen|mistral|mixtral|deepseek|gemma|phi|command|grok|kimi|minimax)/

export function isOfficialOpenAiEndpoint(endpoint?: string | null): boolean {
  if (!endpoint?.trim()) return true
  try {
    return new URL(endpoint).hostname.replace(/^www\./, "") === "api.openai.com"
  } catch {
    return /api\.openai\.com/i.test(endpoint)
  }
}

export function isLocalLlmEndpoint(endpoint?: string | null): boolean {
  if (!endpoint?.trim()) return false
  try {
    const host = new URL(endpoint).hostname
    return host === "localhost" || host === "127.0.0.1"
  } catch {
    return false
  }
}

export function apiKeyForProviderRequest(apiKey?: string | null, endpoint?: string | null): string | null {
  const trimmed = apiKey?.trim() || ""
  if (trimmed) return trimmed
  if (isLocalLlmEndpoint(endpoint)) return LOCAL_LLM_PLACEHOLDER_KEY
  return null
}

export function humanizeModelId(modelId: string): string {
  const trimmed = modelId.trim()
  const slash = trimmed.lastIndexOf("/")
  const leaf = slash >= 0 ? trimmed.slice(slash + 1) : trimmed
  if (/^gpt-/i.test(leaf)) return `GPT-${leaf.slice(4).replace(/-/g, " ")}`
  if (/^claude-/i.test(leaf)) return `Claude ${leaf.slice(7).replace(/-/g, " ")}`
  if (/^gemini-/i.test(leaf)) return `Gemini ${leaf.slice(7).replace(/-/g, " ")}`
  if (/^grok-/i.test(leaf)) return `Grok ${leaf.slice(5).replace(/-/g, " ")}`
  return leaf.replace(/-/g, " ")
}

export function isLikelyChatModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  if (NON_CHAT_MODEL_RE.test(id)) return false
  const leaf = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id
  return CHAT_PREFIX_RE.test(leaf) || CHAT_PREFIX_RE.test(id)
}

export function selectChatModels(
  models: RemoteProviderModel[],
  adapter: LlmAdapterId,
  endpoint?: string | null,
): RemoteProviderModel[] {
  if (adapter === "anthropic") return sortRemoteModels(models)
  if (!isOfficialOpenAiEndpoint(endpoint)) {
    return sortRemoteModels(models.filter((model) => !NON_CHAT_MODEL_RE.test(model.id)))
  }
  const chat = models.filter((model) => isLikelyChatModel(model.id))
  const chosen = chat.length > 0 ? chat : models.filter((model) => !NON_CHAT_MODEL_RE.test(model.id))
  return sortRemoteModels(chosen)
}

export function sortRemoteModels(models: RemoteProviderModel[]): RemoteProviderModel[] {
  return [...models].sort((a, b) => {
    const aDated = /-\d{4}-\d{2}-\d{2}$/.test(a.id)
    const bDated = /-\d{4}-\d{2}-\d{2}$/.test(b.id)
    if (aDated !== bDated) return aDated ? 1 : -1
    return a.id.localeCompare(b.id)
  })
}

function modelsUrl(endpoint: string | null | undefined, adapter: LlmAdapterId): string {
  const fallback = adapter === "anthropic" ? DEFAULT_ANTHROPIC_ENDPOINT : DEFAULT_OPENAI_COMPAT_ENDPOINT
  return `${(endpoint || fallback).replace(/\/$/, "")}/models`
}

export async function fetchProviderChatModels(input: {
  adapter: LlmAdapterId
  endpoint?: string | null
  apiKey: string
}): Promise<RemoteProviderModel[]> {
  if (input.adapter === "anthropic") {
    return selectChatModels(await fetchAnthropicModels(modelsUrl(input.endpoint, "anthropic"), input.apiKey), "anthropic")
  }
  return selectChatModels(
    await fetchOpenAiCompatibleModels(modelsUrl(input.endpoint, "openai-compatible"), input.apiKey),
    "openai-compatible",
    input.endpoint,
  )
}

async function fetchOpenAiCompatibleModels(url: string, apiKey: string): Promise<RemoteProviderModel[]> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Could not list models (${response.status}): ${detail.slice(0, 240)}`)
  }
  const payload = (await response.json()) as { data?: Array<{ id?: string }> }
  return (payload.data || [])
    .map((row) => row.id?.trim())
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, label: humanizeModelId(id) }))
}

async function fetchAnthropicModels(url: string, apiKey: string): Promise<RemoteProviderModel[]> {
  const models: RemoteProviderModel[] = []
  let afterId: string | undefined
  for (let page = 0; page < 10; page += 1) {
    const next = new URL(url)
    next.searchParams.set("limit", "100")
    if (afterId) next.searchParams.set("after_id", afterId)
    const response = await fetch(next, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(`Could not list Anthropic models (${response.status}): ${detail.slice(0, 240)}`)
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string }>
      has_more?: boolean
      last_id?: string
    }
    for (const row of payload.data || []) {
      const id = row.id?.trim()
      if (!id) continue
      models.push({ id, label: row.display_name?.trim() || humanizeModelId(id) })
    }
    if (!payload.has_more || !payload.last_id) break
    afterId = payload.last_id
  }
  return models
}
