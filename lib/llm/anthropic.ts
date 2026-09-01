import type { LlmAdapter, LlmMessage } from "@/lib/llm/types"

const DEFAULT_ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1"

function splitSystem(messages: LlmMessage[]): { system: string; messages: LlmMessage[] } {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n")
  return {
    system,
    messages: messages.filter((m) => m.role !== "system"),
  }
}

export const completeAnthropic: LlmAdapter = async (input, apiKey) => {
  const base = (input.endpoint || DEFAULT_ANTHROPIC_ENDPOINT).replace(/\/$/, "")
  const { system, messages } = splitSystem(input.messages)
  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens ?? 8000,
      temperature: input.temperature ?? 0.3,
      system: system || undefined,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Anthropic request failed (${response.status}): ${detail.slice(0, 400)}`)
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  const text = (payload.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim()
  return { text, provider: "anthropic", model: input.model }
}
