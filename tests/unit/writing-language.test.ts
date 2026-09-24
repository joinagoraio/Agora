import { describe, expect, it } from "vitest"
import { writingLanguageCode, writingLanguageName } from "@/lib/programme/writing-language"

describe("writing language", () => {
  it("accepts only English and Dutch codes", () => {
    expect(writingLanguageCode("nl")).toBe("nl")
    expect(writingLanguageCode("en")).toBe("en")
    expect(writingLanguageCode(null)).toBe("en")
    expect(writingLanguageCode("fr")).toBe("en")
  })

  it("names the language for prompts", () => {
    expect(writingLanguageName("nl")).toBe("Dutch")
    expect(writingLanguageName("en")).toBe("English")
  })
})
