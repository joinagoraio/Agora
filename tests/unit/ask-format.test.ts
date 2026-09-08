import { describe, expect, it } from "vitest"
import { compileAskAnswer } from "@/lib/chat/ask-format"

const SMART_GOALS = `The programme’s SMART goals are set out in the “Challenges and goals” document (page 1). They are:

“Reduce urban noise levels by 20% ins residential areas within five years through targeted noise abatement measures.”
“Increase the proportion of electric and hybrid vehicles in the city’s transportation fleet to 30% within three years.”
“Launch a public awareness campaign on the health risks of noise and air pollution, aiming for a 50% increase in community engagement within two years.”
“Establish a real-time air quality monitoring network across the city within 18 months to provide data for policy adjustments.”
“Develop an interdepartmental task force to align noise and air quality policies across transportation, urban planning, and health sectors within one year.”
Each goal is linked to a clear owner role and an indicator to track progress, ensuring accountability and measurability.`

describe("compileAskAnswer", () => {
  it("turns quoted SMART goals into a heading, lead, list, and closing line", () => {
    const formatted = compileAskAnswer(SMART_GOALS, { question: "What are the SMART goals?" })

    expect(formatted).toMatch(/^## SMART Goals/)
    expect(formatted).toContain("“Challenges and goals” document")
    expect(formatted).toContain("- “Reduce urban noise levels by 20% ins residential areas")
    expect(formatted).toContain("- “Increase the proportion of electric and hybrid vehicles")
    expect(formatted).toContain("- “Develop an interdepartmental task force")
    expect(formatted).toContain("Each goal is linked to a clear owner role")
    expect(formatted.indexOf("- “Reduce urban noise")).toBeLessThan(formatted.indexOf("Each goal is linked"))
  })

  it("is idempotent once the list is already markdown", () => {
    const once = compileAskAnswer(SMART_GOALS, { question: "What are the SMART goals?" })
    expect(compileAskAnswer(once, { question: "What are the SMART goals?" })).toBe(once)
  })

  it("keeps structured citations on quoted list items", () => {
    const formatted = compileAskAnswer(
      `They are:\n“Reduce urban noise levels by 20% in residential areas within five years.” [citation:{"quote":"Reduce urban noise levels by 20% in residential areas within five years.","documentId":"doc-1","pageNumber":1}]\n“Increase the proportion of electric and hybrid vehicles in the city’s transportation fleet to 30% within three years.” [citation:{"quote":"Increase the proportion of electric and hybrid vehicles in the city’s transportation fleet to 30% within three years.","documentId":"doc-1","pageNumber":1}]\n“Launch a public awareness campaign on the health risks of noise and air pollution.” [citation:{"quote":"Launch a public awareness campaign on the health risks of noise and air pollution.","documentId":"doc-1","pageNumber":1}]`,
    )
    expect(formatted).toContain("- “Reduce urban noise levels")
    expect(formatted).toContain('[citation:{"quote":"Reduce urban noise levels')
    expect(formatted.match(/\[citation:/g)?.length).toBe(3)
  })

  it("drops leftover 1. markers when the model numbered every quoted goal", () => {
    const formatted = compileAskAnswer(
      `The programme’s SMART goals are set out in the “Challenges and goals” document (page 1). They are:
1. “Reduce urban noise levels by 20% ins residential areas within five years through targeted noise abatement measures.”
1. “Increase the proportion of electric and hybrid vehicles in the city’s transportation fleet to 30% within three years.”
1. “Launch a public awareness campaign on the health risks of noise and air pollution, aiming for a 50% increase in community engagement within two years.”
1. “Establish a real-time air quality monitoring network across the city within 18 months to provide data for policy adjustments.”
1. “Develop an interdepartmental task force to align noise and air quality policies across transportation, urban planning, and health sectors within one year.”
Each goal is linked to a clear owner role and an indicator to track progress, ensuring accountability and measurability.`,
      { question: "what are the goals of this programme?" },
    )
    expect(formatted).not.toMatch(/1\.\s*1\./)
    expect(formatted).not.toMatch(/^1\./m)
    expect(formatted).toContain("- “Reduce urban noise levels")
    expect(formatted).toContain("They are:")
  })

  it("leaves a short prose answer without a list unchanged", () => {
    const prose = "The programme is about noise and air quality in Amsterdam."
    expect(compileAskAnswer(prose, { question: "What is this programme about?" })).toBe(prose)
  })
})
