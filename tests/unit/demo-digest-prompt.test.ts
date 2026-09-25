import { describe, expect, it } from "vitest"

import { digestPrompt } from "@/lib/demo/digest-prompt"
import { FLEVOLAND_TOUR } from "@/lib/programme/flevoland-tour"

describe("end-of-demo summary", () => {
  it("asks for the five headings in the screen language, without names or literal questions", () => {
    const prompt = digestPrompt(
      [{ source: "questions", stepId: "register", question: "Wie beslist over de maatregelen?", answer: "De ambtenaar.", createdAt: "" }],
      "nl",
    )
    for (const heading of ["Onderwerpen", "Waar de antwoorden tekortschoten", "Wat onduidelijk leek of ontbrak", "Verbeterpunten", "Vervolgvragen voor het team"]) {
      expect(prompt.system).toContain(`## ${heading}`)
    }
    expect(prompt.system).toMatch(/never name people/)
    expect(prompt.system).toMatch(/do not quote a question literally/)
    expect(prompt.user).toContain('spoken, Questions button, during tour step "register"')
  })

  it("keeps the log to a size the model can read", () => {
    const entries = Array.from({ length: 120 }, (_, index) => ({
      source: "ask" as const,
      stepId: null,
      question: `Vraag ${index}`,
      answer: "x".repeat(5000),
      createdAt: "",
    }))
    const prompt = digestPrompt(entries, "en")
    expect(prompt.user).not.toContain("Vraag 39\n")
    expect(prompt.user).toContain("Vraag 119")
    expect(prompt.user.length).toBeLessThan(80 * 1000)
  })

  it("opens the tour with what kind of application Agora is, and ends with the summary", () => {
    expect(FLEVOLAND_TOUR.steps[1].id).toBe("different-kind")
    expect(FLEVOLAND_TOUR.steps[1].text.nl.narration).toContain("in bèta")
    const last = FLEVOLAND_TOUR.steps[FLEVOLAND_TOUR.steps.length - 1]
    expect(last.id).toBe("digest")
    expect(last.panel).toBe("digest")
  })
})
