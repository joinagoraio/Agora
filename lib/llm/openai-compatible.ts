import type { LlmAdapter } from "@/lib/llm/types"

const DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1"

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
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 8000,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${detail.slice(0, 400)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = payload.choices?.[0]?.message?.content?.trim() || ""
  return { text, provider: "openai-compatible", model: input.model }
}
