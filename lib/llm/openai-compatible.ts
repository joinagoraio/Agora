import {
  chatCompletionSampling,
  chatCompletionTokenLimit,
  modelHasFixedSampling,
  rejectedCompletionParameter,
} from "@/lib/llm/model-params"
import type { LlmAdapter } from "@/lib/llm/types"

const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1"
/** Reasoning models spend completion tokens on thinking before they answer. */
const REASONING_MIN_COMPLETION_TOKENS = 32000

function readCompletionText(payload: {
  choices?: Array<{ message?: { content?: unknown } }>
}): string {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === "string") {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text
        }
        return ""
      })
      .join("")
      .trim()
  }
  return ""
}

export const completeOpenAiCompatible: LlmAdapter = async (input, apiKey) => {
  const base = (input.endpoint || DEFAULT_OPENAI_ENDPOINT).replace(/\/$/, "")
  const fixedSampling = modelHasFixedSampling(input.model)
  const requested = input.maxTokens ?? 8000
  const maxTokens = fixedSampling ? Math.max(requested, REASONING_MIN_COMPLETION_TOKENS) : requested

  const send = (options: { completionTokens: boolean; temperature: boolean }) =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        ...(options.temperature ? chatCompletionSampling(input.model, input.temperature ?? 0.3) : {}),
        ...(options.completionTokens ? { max_completion_tokens: maxTokens } : chatCompletionTokenLimit(input.model, maxTokens)),
        ...(input.reasoningEffort && (fixedSampling || options.completionTokens)
          ? { reasoning_effort: input.reasoningEffort }
          : {}),
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
    })

  let options = { completionTokens: fixedSampling, temperature: !fixedSampling }
  let response = await send(options)

  for (let attempt = 0; attempt < 2 && response.status === 400; attempt += 1) {
    const detail = await response.clone().text().catch(() => "")
    const rejected = rejectedCompletionParameter(detail)
    if (rejected === "max_tokens" && !options.completionTokens) {
      options = { ...options, completionTokens: true }
    } else if (rejected === "temperature" && options.temperature) {
      options = { ...options, temperature: false }
    } else {
      break
    }
    response = await send(options)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    if (/insufficient_quota|credit_balance_exhausted/.test(detail)) {
      throw new Error("The AI provider account has no credits left. Add credits to the provider account, then try again.")
    }
    if (response.status === 429) {
      throw new Error("The AI provider is receiving too many requests. Wait a minute, then try again.")
    }
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${detail.slice(0, 400)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>
  }
  const text = readCompletionText(payload)
  if (!text && payload.choices?.[0]?.finish_reason === "length") {
    throw new Error(`${input.model} reached its length limit before it answered. Try again with less evidence or a smaller model.`)
  }
  return { text, provider: "openai-compatible", model: input.model }
}
