import { describe, expect, it } from "vitest"
import {
  chatCompletionSampling,
  chatCompletionTokenLimit,
  modelHasFixedSampling,
} from "@/lib/llm/model-params"

describe("chat completion sampling", () => {
  it("omits temperature for GPT-5 and o-series models", () => {
    expect(modelHasFixedSampling("gpt-5.4-mini")).toBe(true)
    expect(modelHasFixedSampling("gpt-5")).toBe(true)
    expect(modelHasFixedSampling("o3-mini")).toBe(true)
    expect(chatCompletionSampling("gpt-5-mini", 0.7)).toEqual({})
    expect(chatCompletionTokenLimit("gpt-5-mini", 8000)).toEqual({ max_completion_tokens: 8000 })
  })

  it("keeps temperature and max_tokens for GPT-4 class models", () => {
    expect(modelHasFixedSampling("gpt-4o-mini")).toBe(false)
    expect(chatCompletionSampling("gpt-4o-mini", 0.7)).toEqual({ temperature: 0.7 })
    expect(chatCompletionTokenLimit("gpt-4o-mini", 8000)).toEqual({ max_tokens: 8000 })
  })
})
