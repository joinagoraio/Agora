import { env } from "@/lib/env"
import { completeAnthropic } from "@/lib/llm/anthropic"
import { completeOpenAiCompatible } from "@/lib/llm/openai-compatible"
import type { LlmAdapter, LlmCompleteInput, LlmCompleteResult } from "@/lib/llm/types"

const ADAPTERS: Record<string, LlmAdapter> = {
  "openai-compatible": completeOpenAiCompatible,
  openai: completeOpenAiCompatible,
  anthropic: completeAnthropic,
}

function resolveApiKey(input: LlmCompleteInput): string {
  const ref = input.credentialsRef?.trim()
  if (ref) {
    const fromEnv = process.env[ref]
    if (fromEnv) return fromEnv
  }
  if (input.provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY
    if (key) return key
  }
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY
  throw new Error(
    `No API key for provider "${input.provider}". Set ${ref || (input.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY")}.`,
  )
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
  const apiKey = resolveApiKey(input)
  return adapter(input, apiKey)
}

export function listLlmProviders(): string[] {
  return Object.keys(ADAPTERS)
}
