import { BACKGROUND_JOB_KINDS, type BackgroundJobKind } from "@/lib/programme/jobs"
import { isProgrammeWorkbenchSection, type ProgrammeWorkbenchSection } from "@/lib/programme/domain"

export type TourLanguage = "nl" | "en"

export type TourText = {
  /** Short heading for the strip. */
  title: string
  /** What the presenter does on screen. */
  action: string
  /** Why this matters, the talking point. */
  why: string
  /** What Agora is doing while it works, for steps that start an AI job. */
  happening?: string
  /** What the room should see when the step is done. */
  expect: string
  /** What the presenter voice says. */
  narration: string
}

export type TourStep = {
  id: string
  block: string
  /** Where to go: a workbench section, the document, or the knowledge view. */
  place: { view: "document" | "knowledge"; section?: ProgrammeWorkbenchSection; mode?: "read" | "edit" }
  /** The `data-guidance-target` of the button to highlight. */
  target?: string
  /** The `data-guidance-target` of a tab or opener to click on arrival, for sub-views and modals. */
  click?: string
  /** A background job this step starts; the panel shows its progress. */
  waitForJob?: BackgroundJobKind
  estMinutes: number
  text: Record<TourLanguage, TourText>
}

export type TourBlock = { id: string; title: Record<TourLanguage, string>; minutes: number }

export type DemoTour = { version: number; blocks: TourBlock[]; steps: TourStep[] }

/** Stored narration: public audio URL per language and step id. */
export type TourNarration = Record<TourLanguage, Record<string, string>>

/** The query string that puts the workbench where a step happens. */
export function tourStepQuery(step: TourStep) {
  const params = new URLSearchParams()
  if (step.place.view === "knowledge") {
    params.set("view", "knowledge")
    return params.toString()
  }
  params.set("view", "document")
  if (step.place.section === "outline") params.set("structure", "1")
  else if (step.place.section && step.place.section !== "editor") params.set("section", step.place.section)
  if (step.place.mode) params.set("mode", step.place.mode)
  return params.toString()
}

function asText(raw: unknown): TourText | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const field = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "")
  if (!field("title")) return null
  return {
    title: field("title"),
    action: field("action"),
    why: field("why"),
    happening: field("happening") || undefined,
    expect: field("expect"),
    narration: field("narration") || field("why"),
  }
}

/** Reads a stored tour, dropping steps that are incomplete. */
export function parseDemoTour(raw: unknown): DemoTour | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as { blocks?: unknown; steps?: unknown }
  const blocks = (Array.isArray(row.blocks) ? row.blocks : []).flatMap((item) => {
    const block = item as Record<string, unknown>
    const title = block?.title as Record<string, unknown> | undefined
    if (typeof block?.id !== "string" || typeof title?.nl !== "string" || typeof title?.en !== "string") return []
    return [{ id: block.id, title: { nl: title.nl, en: title.en }, minutes: typeof block.minutes === "number" ? block.minutes : 0 }]
  })
  const steps = (Array.isArray(row.steps) ? row.steps : []).flatMap((item) => {
    const step = item as Record<string, unknown>
    const text = step?.text as Record<string, unknown> | undefined
    const nl = asText(text?.nl)
    const en = asText(text?.en)
    const place = step?.place as Record<string, unknown> | undefined
    if (typeof step?.id !== "string" || typeof step.block !== "string" || !nl || !en || !place) return []
    const view = place.view === "knowledge" ? "knowledge" : "document"
    const section = isProgrammeWorkbenchSection(place.section) ? place.section : undefined
    const job = BACKGROUND_JOB_KINDS.find((kind) => kind === step.waitForJob)
    return [
      {
        id: step.id,
        block: step.block,
        place: {
          view,
          section,
          mode: place.mode === "read" || place.mode === "edit" ? place.mode : undefined,
        },
        target: typeof step.target === "string" ? step.target : undefined,
        click: typeof step.click === "string" ? step.click : undefined,
        waitForJob: job,
        estMinutes: typeof step.estMinutes === "number" ? step.estMinutes : 1,
        text: { nl, en },
      } satisfies TourStep,
    ]
  })
  if (steps.length === 0) return null
  return { version: typeof (row as { version?: unknown }).version === "number" ? (row as { version: number }).version : 0, blocks, steps }
}

export function tourLanguage(locale: string | null | undefined): TourLanguage {
  return locale?.toLowerCase().startsWith("nl") ? "nl" : "en"
}

/** Minutes from the start of the tour to the start of each step. */
export function tourStartMinutes(tour: DemoTour): number[] {
  let elapsed = 0
  return tour.steps.map((step) => {
    const start = elapsed
    elapsed += step.estMinutes
    return start
  })
}
