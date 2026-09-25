import { describe, expect, it } from "vitest"

import { priceFor, tokenCost } from "@/lib/llm/prices"

describe("LLM prices", () => {
  it("prices the demo's models, most specific name first", () => {
    expect(priceFor("gpt-5.6")).toEqual({ input: 4, output: 20 })
    expect(priceFor("gpt-5.6-luna")).toEqual({ input: 0.2, output: 1.2 })
    expect(priceFor("openai/gpt-5.6-terra")).toEqual({ input: 2, output: 12 })
    expect(priceFor("gpt-realtime")).toEqual({ input: 32, output: 64 })
  })

  it("turns tokens into dollars, and says when a model has no price", () => {
    expect(tokenCost("gpt-5.6", 1_000_000, 100_000)).toBeCloseTo(6)
    expect(tokenCost("some-local-model", 1000, 1000)).toBeNull()
  })
})
