import { chatCompletionSampling, chatCompletionTokenLimit, modelHasFixedSampling } from "@/lib/llm/model-params"
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
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      ...chatCompletionSampling(input.model, input.temperature ?? 0.3),
      ...chatCompletionTokenLimit(input.model, input.maxTokens ?? 8000),
      ...(input.reasoningEffort && modelHasFixedSampling(input.model)
        ? { reasoning_effort: input.reasoningEffort }
        : {}),
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${detail.slice(0, 400)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  return { text: readCompletionText(payload), provider: "openai-compatible", model: input.model }
}
