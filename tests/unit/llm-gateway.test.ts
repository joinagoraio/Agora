import { describe, expect, it } from "vitest"
import { listLlmProviders, resolveLlmAdapter } from "@/lib/llm"
import { completeOpenAiCompatible } from "@/lib/llm/openai-compatible"
import { completeAnthropic } from "@/lib/llm/anthropic"

describe("pluggable LLM gateway", () => {
  it("exposes openai-compatible and anthropic adapters", () => {
    expect(listLlmProviders()).toEqual(expect.arrayContaining(["openai-compatible", "anthropic"]))
    expect(resolveLlmAdapter("openai-compatible")).toBe(completeOpenAiCompatible)
    expect(resolveLlmAdapter("anthropic")).toBe(completeAnthropic)
    expect(resolveLlmAdapter("openai")).toBe(completeOpenAiCompatible)
  })

  it("rejects unknown providers", () => {
    expect(() => resolveLlmAdapter("vendor-catalog-only")).toThrow(/Unknown LLM provider/)
  })
})
