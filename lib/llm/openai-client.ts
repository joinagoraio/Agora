import OpenAI from "openai"
import type { ResolvedLlmTarget } from "@/lib/llm/catalog"

export function openaiClientForTarget(target: ResolvedLlmTarget): OpenAI {
  if (target.provider === "anthropic") {
    throw new Error("This action needs an OpenAI-compatible model. Assign one in Platform admin.")
  }
  const baseURL = target.endpoint?.replace(/\/$/, "") || undefined
  return new OpenAI({
    apiKey: target.apiKey,
    ...(baseURL ? { baseURL } : {}),
  })
}
