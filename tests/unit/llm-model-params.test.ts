import { describe, expect, it } from "vitest"
import {
  chatCompletionSampling,
  chatCompletionTokenLimit,
  modelHasFixedSampling,
  rejectedCompletionParameter,
} from "@/lib/llm/model-params"

describe("chat completion sampling", () => {
  it("omits temperature for GPT-5 and o-series models", () => {
    expect(modelHasFixedSampling("gpt-5.4-mini")).toBe(true)
    expect(modelHasFixedSampling("gpt-5")).toBe(true)
    expect(modelHasFixedSampling("o3-mini")).toBe(true)
    expect(chatCompletionSampling("gpt-5-mini", 0.7)).toEqual({})
    expect(chatCompletionTokenLimit("gpt-5-mini", 8000)).toEqual({ max_completion_tokens: 8000 })
  })

  it("treats later GPT generations and o-series the same way", () => {
    expect(modelHasFixedSampling("gpt-6-astra")).toBe(true)
    expect(modelHasFixedSampling("o4-mini-2025-04-16")).toBe(true)
    expect(chatCompletionTokenLimit("gpt-6-astra", 8000)).toEqual({ max_completion_tokens: 8000 })
  })

  it("keeps temperature and max_tokens for GPT-4 class models", () => {
    expect(modelHasFixedSampling("gpt-4o-mini")).toBe(false)
    expect(modelHasFixedSampling("openai/gpt-oss-120b")).toBe(false)
    expect(chatCompletionSampling("gpt-4o-mini", 0.7)).toEqual({ temperature: 0.7 })
    expect(chatCompletionTokenLimit("gpt-4o-mini", 8000)).toEqual({ max_tokens: 8000 })
  })

  it("reads which setting a provider rejected", () => {
    expect(
      rejectedCompletionParameter(
        `{"error":{"message":"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.","code":"unsupported_parameter"}}`,
      ),
    ).toBe("max_tokens")
    expect(rejectedCompletionParameter(`{"error":{"message":"Unsupported value: 'temperature' does not support 0.3","code":"unsupported_value"}}`)).toBe(
      "temperature",
    )
    expect(rejectedCompletionParameter(`{"error":{"message":"Rate limit"}}`)).toBeNull()
  })
})
