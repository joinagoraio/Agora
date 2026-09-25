import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { parseDemoTour, tourStartMinutes, tourStepQuery } from "@/lib/programme/demo-tour"
import { FLEVOLAND_TOUR } from "@/lib/programme/flevoland-tour"

const componentSource = readdirSync(join(process.cwd(), "components"))
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => readFileSync(join(process.cwd(), "components", name), "utf8"))
  .join("\n")

describe("Flevoland demo tour", () => {
  it("survives a round trip through storage", () => {
    const parsed = parseDemoTour(JSON.parse(JSON.stringify(FLEVOLAND_TOUR)))
    expect(parsed?.steps).toHaveLength(FLEVOLAND_TOUR.steps.length)
    expect(parsed?.version).toBe(FLEVOLAND_TOUR.version)
  })

  it("has unique steps in known parts, with text in both languages", () => {
    const blocks = new Set(FLEVOLAND_TOUR.blocks.map((block) => block.id))
    const ids = FLEVOLAND_TOUR.steps.map((step) => step.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const step of FLEVOLAND_TOUR.steps) {
      expect(blocks.has(step.block)).toBe(true)
      for (const language of ["nl", "en"] as const) {
        expect(step.text[language].action.length).toBeGreaterThan(10)
        expect(step.text[language].narration.length).toBeGreaterThan(40)
      }
    }
  })

  it("points only at buttons that exist", () => {
    const targets = FLEVOLAND_TOUR.steps.flatMap((step) => [step.target, step.click]).filter(Boolean) as string[]
    for (const target of new Set(targets)) {
      const literal = componentSource.includes(`data-guidance-target="${target}"`)
      const templated = target.startsWith("interests-view-") && componentSource.includes("data-guidance-target={`interests-view-${option}`}")
      const analysis = target === "run-analysis" && componentSource.includes('"run-analysis"')
      expect(literal || templated || analysis, target).toBe(true)
    }
  })

  it("keeps the parts in the agreed half-day order", () => {
    const order = FLEVOLAND_TOUR.steps.map((step) => step.block).filter((block, index, all) => all.indexOf(block) === index)
    expect(order).toEqual(FLEVOLAND_TOUR.blocks.map((block) => block.id))
  })

  it("builds the workbench address for a step", () => {
    expect(tourStepQuery({ ...FLEVOLAND_TOUR.steps[0], place: { view: "knowledge" } })).toBe("view=knowledge")
    expect(tourStepQuery({ ...FLEVOLAND_TOUR.steps[0], place: { view: "document", section: "measures" } })).toBe("view=document&section=measures")
    expect(tourStepQuery({ ...FLEVOLAND_TOUR.steps[0], place: { view: "document", mode: "read" } })).toBe("view=document&mode=read")
    expect(tourStartMinutes(FLEVOLAND_TOUR)[1]).toBe(FLEVOLAND_TOUR.steps[0].estMinutes)
  })
})
