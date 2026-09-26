// Rewrites the "Step by step" part of the demo guide from the tour data, with every optional part shown.
// Usage: npx tsx --tsconfig tsconfig.json scripts/generate-tour-guide.ts
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { tourStartMinutes, type TourStep } from "@/lib/programme/demo-tour"
import { FLEVOLAND_TOUR } from "@/lib/programme/flevoland-tour"

const GUIDE = join(process.cwd(), "docs/demo/flevoland-half-day.md")
const HEADING = "## Step by step"

const OPTION_LABEL: Record<string, string> = { aiSetup: "optional part: show how the AI is set up" }
const PAGE_LABEL: Record<string, string> = {
  dashboard: "on the dashboard",
  authority: "on the authority page",
  platform: "on Platform admin",
  published: "on the public page",
}

const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

function stepSection(step: TourStep, number: number, startsAt: number) {
  const { nl, en } = step.text
  const marks = [step.option ? OPTION_LABEL[step.option] : null, step.place.page ? PAGE_LABEL[step.place.page] : null]
    .filter(Boolean)
    .map((mark) => ` · *${mark}*`)
    .join("")
  const lines = [
    `#### ${number}. ${nl.title} / ${en.title} · ${step.estMinutes} min · ${clock(startsAt)}${marks}`,
    "",
    `- **Doen / Do:** ${nl.action}`,
    `  ${en.action}`,
    ...(nl.happening ? [`- **AI-stap / AI step:** ${nl.happening}`] : []),
    `- **De zaal ziet / The room sees:** ${nl.expect}`,
    "",
    `> **NL:** ${nl.narration}`,
    ">",
    `> **EN:** ${en.narration}`,
    "",
  ]
  return lines.join("\n")
}

const tour = FLEVOLAND_TOUR
const starts = tourStartMinutes(tour)
const parts: string[] = [HEADING, "", "Each step lists what to do in Dutch and English, what the room should see, and what the voice says.", ""]
let block = ""
tour.steps.forEach((step, index) => {
  if (step.block !== block) {
    block = step.block
    const info = tour.blocks.find((item) => item.id === block)!
    parts.push(`### ${info.title.nl} / ${info.title.en} (${info.minutes} min, from ${clock(starts[index])})`, "")
  }
  parts.push(stepSection(step, index + 1, starts[index]))
})

const guide = readFileSync(GUIDE, "utf8")
const at = guide.indexOf(HEADING)
if (at < 0) throw new Error(`No "${HEADING}" heading in the guide`)
writeFileSync(GUIDE, `${guide.slice(0, at)}${parts.join("\n").trimEnd()}\n`)
console.log(`Wrote ${tour.steps.length} steps to ${GUIDE}`)
