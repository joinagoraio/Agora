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

/** An interest counts as having measures once it has this many, so one broad proposal does not cover three interests. */
export const ENOUGH_MEASURES_PER_INTEREST = 3

/** Counts of what exists in the programme, such as work-ups written or chapters approved. */
export type TourFacts = Record<string, number>

/** Holds when `fact` is at least `min`, and at least the value of `atLeastFact` when given. */
export type TourCondition = { fact: string; min?: number; atLeastFact?: string }

type ActionGuards = {
  /** Skip this action when the condition already holds. */
  unless?: TourCondition
  /** Run this action only when the condition holds. */
  onlyIf?: TourCondition
  /** Carry on when the element never appears. */
  optional?: boolean
}

/** What the autopilot does on a step, in order. Targets are `data-guidance-target` values. */
export type TourAction = ActionGuards &
  (
    | { do: "click"; target: string; state?: string }
    | { do: "type"; target: string; text: Record<TourLanguage, string> }
    | { do: "wait"; ms: number }
    | { do: "waitJob"; kind: BackgroundJobKind }
    | { do: "waitFor"; condition: TourCondition; timeoutMs?: number }
    | { do: "waitNarration" }
    | { do: "key"; key: string }
    | { do: "scrollTo"; text: string }
    | { do: "pause" }
    | { do: "group"; actions: TourAction[] }
  )

export type TourStep = {
  id: string
  block: string
  /** Where to go: a workbench section, the document, or the knowledge view. */
  place: {
    view: "document" | "knowledge"
    section?: ProgrammeWorkbenchSection
    mode?: "read" | "edit"
    /** Steps outside the programme: the authority page, or the platform's AI settings. */
    page?: TourPage
  }
  /** A step that belongs to an optional part of the tour, shown only when the pack turns it on. */
  option?: TourOption
  /** Something extra the tour panel shows on this step, such as the summary of what the room asked. */
  panel?: TourPanel
  /** The `data-guidance-target` of the button to highlight. */
  target?: string
  /** The `data-guidance-target` of a tab or opener to click on arrival, for sub-views and modals. */
  click?: string
  /** A background job this step starts; the panel shows its progress. */
  waitForJob?: BackgroundJobKind
  estMinutes: number
  text: Record<TourLanguage, TourText>
  /** What the autopilot does here. */
  auto?: TourAction[]
  /** The step counts as done when all of these hold. */
  doneWhen?: TourCondition[]
}

export function conditionHolds(condition: TourCondition, facts: TourFacts) {
  const value = facts[condition.fact] ?? 0
  if (value < (condition.min ?? 1)) return false
  if (condition.atLeastFact && value < (facts[condition.atLeastFact] ?? 0)) return false
  return true
}

export function stepDone(step: TourStep, facts: TourFacts | null) {
  if (!facts || !step.doneWhen?.length) return false
  return step.doneWhen.every((condition) => conditionHolds(condition, facts))
}

const ACTIONS = new Set(["click", "type", "wait", "waitJob", "waitFor", "waitNarration", "key", "scrollTo", "pause", "group"])

function asCondition(raw: unknown): TourCondition | undefined {
  const row = raw as Record<string, unknown> | null
  if (!row || typeof row.fact !== "string") return undefined
  return {
    fact: row.fact,
    min: typeof row.min === "number" ? row.min : undefined,
    atLeastFact: typeof row.atLeastFact === "string" ? row.atLeastFact : undefined,
  }
}

function asActions(raw: unknown): TourAction[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const row = item as Record<string, unknown> | null
    if (!row || typeof row.do !== "string" || !ACTIONS.has(row.do)) return []
    const action = { ...row } as Record<string, unknown>
    if (row.unless) action.unless = asCondition(row.unless)
    if (row.onlyIf) action.onlyIf = asCondition(row.onlyIf)
    if (row.condition) action.condition = asCondition(row.condition)
    if (row.do === "group") action.actions = asActions(row.actions)
    if (row.do === "waitJob" && !BACKGROUND_JOB_KINDS.some((kind) => kind === row.kind)) return []
    return [action as TourAction]
  })
}

export type TourBlock = { id: string; title: Record<TourLanguage, string>; minutes: number }

export const TOUR_PAGES = ["programme", "authority", "platform"] as const
export type TourPage = (typeof TOUR_PAGES)[number]

export const TOUR_PANELS = ["digest"] as const
export type TourPanel = (typeof TOUR_PANELS)[number]

export const TOUR_OPTIONS = ["aiSetup"] as const
export type TourOption = (typeof TOUR_OPTIONS)[number]

export type DemoTour = {
  version: number
  blocks: TourBlock[]
  steps: TourStep[]
  /** Optional parts the pack turns on. */
  options?: Partial<Record<TourOption, boolean>>
  /** The voice a new presenter starts with; each browser can switch. */
  defaultVoice?: TourVoice
}

export const TOUR_VOICES = ["female", "male"] as const
export type TourVoice = (typeof TOUR_VOICES)[number]

/** Stored narration: public audio URL per voice, language and step id. */
export type TourNarration = Record<TourVoice, Record<TourLanguage, Record<string, string>>>

/** Where a step happens: the programme workbench, the authority page, or the platform's AI settings. */
export function tourStepHref(step: TourStep, ids: { workspaceId: string; spaceId: string }) {
  const back = `tourProgramme=${encodeURIComponent(ids.workspaceId)}`
  if (step.place.page === "authority") return `/spaces/${ids.spaceId}?${back}`
  if (step.place.page === "platform") return `/admin/platform?${back}`
  return `/workspaces/${ids.workspaceId}/programme?${tourStepQuery(step)}`
}

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

/**
 * Reads a stored tour, dropping steps that are incomplete, and steps of optional parts the pack has not
 * turned on unless `allOptions` is set (for recording narration ahead of time).
 */
export function parseDemoTour(raw: unknown, { allOptions = false }: { allOptions?: boolean } = {}): DemoTour | null {
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
          page: TOUR_PAGES.find((page) => page === place.page && page !== "programme"),
        },
        option: TOUR_OPTIONS.find((option) => option === step.option),
        panel: TOUR_PANELS.find((panel) => panel === step.panel),
        target: typeof step.target === "string" ? step.target : undefined,
        click: typeof step.click === "string" ? step.click : undefined,
        waitForJob: job,
        estMinutes: typeof step.estMinutes === "number" ? step.estMinutes : 1,
        text: { nl, en },
        auto: asActions(step.auto),
        doneWhen: Array.isArray(step.doneWhen)
          ? step.doneWhen.map(asCondition).filter((condition): condition is TourCondition => Boolean(condition))
          : undefined,
      } satisfies TourStep,
    ]
  })
  const rawOptions = ((row as { options?: unknown }).options ?? {}) as Record<string, unknown>
  const options = Object.fromEntries(TOUR_OPTIONS.map((option) => [option, rawOptions[option] === true])) as Record<TourOption, boolean>
  const shown = allOptions ? steps : steps.filter((step) => !step.option || options[step.option])
  if (shown.length === 0) return null
  const usedBlocks = new Set(shown.map((step) => step.block))
  return {
    version: typeof (row as { version?: unknown }).version === "number" ? (row as { version: number }).version : 0,
    blocks: blocks.filter((block) => usedBlocks.has(block.id)),
    steps: shown,
    options,
    defaultVoice: (row as { defaultVoice?: unknown }).defaultVoice === "male" ? "male" : "female",
  }
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
