import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { onTourStepPage, parseDemoTour, stepDone, tourStartMinutes, tourStepHref, tourStepQuery, type TourAction } from "@/lib/programme/demo-tour"
import { FLEVOLAND_TOUR } from "@/lib/programme/flevoland-tour"

const componentSource = readdirSync(join(process.cwd(), "components"))
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => readFileSync(join(process.cwd(), "components", name), "utf8"))
  .join("\n")

/** A target written as a literal, or chosen by a condition such as `quotable ? "published-passage" : undefined`. */
const hasTarget = (target: string) =>
  componentSource.includes(`data-guidance-target="${target}"`) ||
  new RegExp(`data-guidance-target=\\{[^}]*"${target}"`).test(componentSource)

describe("Flevoland demo tour", () => {
  it("survives a round trip through storage", () => {
    const parsed = parseDemoTour(JSON.parse(JSON.stringify(FLEVOLAND_TOUR)), { allOptions: true })
    expect(parsed?.steps).toHaveLength(FLEVOLAND_TOUR.steps.length)
    expect(parsed?.version).toBe(FLEVOLAND_TOUR.version)
  })

  it("shows the AI set-up part only when the pack turns it on", () => {
    const optional = FLEVOLAND_TOUR.steps.filter((step) => step.option === "aiSetup")
    expect(optional.length).toBe(3)
    const off = parseDemoTour(JSON.parse(JSON.stringify(FLEVOLAND_TOUR)))
    expect(off?.steps.some((step) => step.option)).toBe(false)
    expect(off?.blocks.some((block) => block.id === "ai")).toBe(false)
    const on = parseDemoTour({ ...JSON.parse(JSON.stringify(FLEVOLAND_TOUR)), options: { aiSetup: true } })
    expect(on?.steps.filter((step) => step.option === "aiSetup").map((step) => step.place.page)).toEqual(["platform", "authority", "authority"])
    expect(tourStepHref(optional[0], { workspaceId: "w", spaceId: "s" })).toBe("/admin/platform?tourProgramme=w")
    expect(tourStepHref(optional[1], { workspaceId: "w", spaceId: "s" })).toBe("/spaces/s?tourProgramme=w")
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
      const literal = hasTarget(target)
      const templated =
        (target.startsWith("interests-view-") && componentSource.includes("data-guidance-target={`interests-view-${option}`}")) ||
        (target.startsWith("tool-switch-") && componentSource.includes("data-guidance-target={`tool-switch-${option.id}`}"))
      const analysis = target === "run-analysis" && componentSource.includes('"run-analysis"')
      expect(literal || templated || analysis, target).toBe(true)
    }
  })

  it("lets the autopilot reach only buttons that exist, and check only facts that are counted", () => {
    const factsSource = readFileSync(join(process.cwd(), "lib/actions/demo-tour.ts"), "utf8")
    const actions = (list: TourAction[]): TourAction[] => list.flatMap((action) => (action.do === "group" ? [action, ...actions(action.actions)] : [action]))
    const all = FLEVOLAND_TOUR.steps.flatMap((step) => actions(step.auto ?? []))
    expect(all.length).toBeGreaterThan(20)
    for (const action of all) {
      const target = action.do === "click" || action.do === "type" || action.do === "waitForTarget" ? action.target : action.do === "scrollTo" ? action.target : undefined
      if (target) {
        const literal = hasTarget(target)
        const templated =
          /^(decision|priority|tool-switch)-/.test(target) ||
          target === "run-analysis" ||
          componentSource.includes(`guidanceTarget="${target}"`) ||
          componentSource.includes(`guidanceTarget = "${target}"`)
        expect(literal || templated, target).toBe(true)
      }
    }
    const conditions = [
      ...FLEVOLAND_TOUR.steps.flatMap((step) => step.doneWhen ?? []),
      ...all.flatMap((action) => [action.unless, action.onlyIf, action.do === "waitFor" ? action.condition : undefined]),
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition))
    for (const condition of conditions) {
      expect(factsSource.includes(`    ${condition.fact}`), condition.fact).toBe(true)
      if (condition.atLeastFact) expect(factsSource.includes(`    ${condition.atLeastFact}`), condition.atLeastFact).toBe(true)
    }
  })

  it("knows which steps are done from the facts", () => {
    const workup = FLEVOLAND_TOUR.steps.find((step) => step.id === "workup")!
    expect(stepDone(workup, { workups: 2, chosen: 3 })).toBe(false)
    expect(stepDone(workup, { workups: 3, chosen: 3 })).toBe(true)
    expect(stepDone(workup, null)).toBe(false)
  })

  it("keeps the parts in the agreed half-day order", () => {
    const order = FLEVOLAND_TOUR.steps.map((step) => step.block).filter((block, index, all) => all.indexOf(block) === index)
    expect(order).toEqual(FLEVOLAND_TOUR.blocks.map((block) => block.id))
  })

  it("goes to the dashboard and the public page, and knows when it is there", () => {
    const ids = { workspaceId: "w", spaceId: "s" }
    const dashboard = FLEVOLAND_TOUR.steps.find((step) => step.id === "dashboard")!
    const published = FLEVOLAND_TOUR.steps.find((step) => step.id === "public-page")!
    expect(tourStepHref(dashboard, ids)).toBe("/dashboard?tourProgramme=w")
    expect(tourStepHref(published, ids)).toBe("/workspaces/w/programme/published?tourProgramme=w")
    expect(onTourStepPage(published, "/published/abc", ids)).toBe(true)
    expect(onTourStepPage(published, "/workspaces/w/programme", ids)).toBe(false)
    expect(onTourStepPage(dashboard, "/dashboard", ids)).toBe(true)
    const programmeStep = FLEVOLAND_TOUR.steps.find((step) => step.id === "sources")!
    expect(onTourStepPage(programmeStep, "/workspaces/w/programme", ids)).toBe(true)
    expect(onTourStepPage(programmeStep, "/published/abc", ids)).toBe(false)
  })

  it("covers the whole application, from the dashboard to the end of consultation", () => {
    const ids = FLEVOLAND_TOUR.steps.map((step) => step.id)
    for (const id of ["dashboard", "authority", "team", "ask", "comments", "common-notes", "answer-once", "pages", "public-page", "responses", "consultation-handle", "topic-summary", "public-summary", "appeal"]) {
      expect(ids, id).toContain(id)
    }
    const narratedOnly = FLEVOLAND_TOUR.steps.filter((step) => !step.auto?.length).map((step) => step.id)
    expect(narratedOnly).toEqual(["welcome", "different-kind", "structure", "knowledge", "configuration", "agents", "read-findings", "status", "questions"])
  })

  it("builds the workbench address for a step", () => {
    expect(tourStepQuery({ ...FLEVOLAND_TOUR.steps[0], place: { view: "knowledge" } })).toBe("view=knowledge")
    expect(tourStepQuery({ ...FLEVOLAND_TOUR.steps[0], place: { view: "document", section: "measures" } })).toBe("view=document&section=measures")
    expect(tourStepQuery({ ...FLEVOLAND_TOUR.steps[0], place: { view: "document", mode: "read" } })).toBe("view=document&mode=read")
    expect(tourStartMinutes(FLEVOLAND_TOUR)[1]).toBe(FLEVOLAND_TOUR.steps[0].estMinutes)
  })
})
