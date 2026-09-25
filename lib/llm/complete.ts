import { completeAnthropic } from "@/lib/llm/anthropic"
import { completeOpenAiCompatible } from "@/lib/llm/openai-compatible"
import { apiKeyForProviderRequest } from "@/lib/llm/provider-models"
import type { LlmAdapter, LlmCompleteInput, LlmCompleteResult } from "@/lib/llm/types"

const ADAPTERS: Record<string, LlmAdapter> = {
  "openai-compatible": completeOpenAiCompatible,
  openai: completeOpenAiCompatible,
  anthropic: completeAnthropic,
}

export function resolveLlmAdapter(provider: string): LlmAdapter {
  const adapter = ADAPTERS[provider]
  if (!adapter) {
    throw new Error(`Unknown LLM provider "${provider}". Supported: ${Object.keys(ADAPTERS).join(", ")}`)
  }
  return adapter
}

export async function completeLlm(input: LlmCompleteInput): Promise<LlmCompleteResult> {
  const adapter = resolveLlmAdapter(input.provider)
  const apiKey = apiKeyForProviderRequest(input.apiKey, input.endpoint)
  if (!apiKey) {
    throw new Error(
      `No API key provided for provider "${input.provider}". Store a key in Platform admin (or organisation keys if this org uses its own accounts).`,
    )
  }
  const result = await adapter(input, apiKey)
  if (input.usage && result.tokens) {
    const { recordLlmUsage } = await import("@/lib/llm/usage")
    await recordLlmUsage({
      workspaceId: input.usage.workspaceId ?? null,
      kind: input.usage.kind,
      provider: result.provider,
      model: result.model,
      inputTokens: result.tokens.input,
      outputTokens: result.tokens.output,
    })
  }
  return result
}

export function listLlmProviders(): string[] {
  return Object.keys(ADAPTERS)
}
