import { describe, expect, it } from "vitest"

import { speakableParts, speakableText } from "@/lib/speech/speakable"

describe("speakable answers", () => {
  it("drops citation codes, markdown and links", () => {
    const text = speakableText(
      '## Samenvatting\n\n- **Vitale steden** groeien [citation:{"documentId":"a","pageNumber":12}].\n- Zie [de visie](https://example.org/visie).\n\n| a | b |\n| - | - |',
    )
    expect(text).toBe("Samenvatting\n\nVitale steden groeien.\nZie de visie.")
  })

  it("splits long text at sentence ends", () => {
    const text = Array.from({ length: 40 }, (_, index) => `Zin nummer ${index} gaat over wonen.`).join(" ")
    const parts = speakableParts(text, 200)
    expect(parts.length).toBeGreaterThan(5)
    expect(parts.every((part) => part.length <= 200)).toBe(true)
    expect(parts.join(" ")).toBe(text)
  })
})
