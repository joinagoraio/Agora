import {
  chatCompletionSampling,
  chatCompletionTokenLimit,
  modelHasFixedSampling,
  rejectedCompletionParameter,
} from "@/lib/llm/model-params"
import type { LlmAdapter } from "@/lib/llm/types"

const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1"

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
  const maxTokens = input.maxTokens ?? 8000

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
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${detail.slice(0, 400)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  return { text: readCompletionText(payload), provider: "openai-compatible", model: input.model }
}
