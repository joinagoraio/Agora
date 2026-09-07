import { completeAnthropic } from "@/lib/llm/anthropic"
import { completeOpenAiCompatible } from "@/lib/llm/openai-compatible"
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
  const apiKey = input.apiKey?.trim()
  if (!apiKey) {
    throw new Error(
      `No API key provided for provider "${input.provider}". Store a key in Platform admin (or organisation keys if this org uses its own accounts).`,
    )
  }
  return adapter(input, apiKey)
}

export function listLlmProviders(): string[] {
  return Object.keys(ADAPTERS)
}
