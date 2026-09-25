"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Bot, Check, Compass, Loader2, Pause, Play, Square, Volume2, VolumeX, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useProgrammeJobs } from "@/components/programme-jobs-provider"
import { DemoAskControl } from "@/components/demo-ask"
import { useChatContext } from "@/components/workspace-chat-wrapper"
import { getTourFacts } from "@/lib/actions/demo-tour"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"
import type { SpaceCost } from "@/lib/llm/usage"
import type { BackgroundJobKind } from "@/lib/programme/jobs"
import {
  conditionHolds,
  stepDone,
  TOUR_VOICES,
  tourLanguage,
  tourStartMinutes,
  tourStepHref,
  type DemoTour,
  type TourAction,
  type TourFacts,
  type TourLanguage,
  type TourNarration,
  type TourStep,
  type TourVoice,
} from "@/lib/programme/demo-tour"

type AutopilotState = "off" | "running" | "paused"

/** A message key, translated when shown, so it follows a change of screen language. */
type AutoNote = { key: string; fallback: string; detail?: string }

type ContextValue = {
  workspaceId: string
  tour: DemoTour
  language: TourLanguage
  index: number
  step: TourStep
  open: boolean
  setOpen: (open: boolean) => void
  goTo: (index: number) => void
  next: () => void
  back: () => void
  /** Go to where the current step happens again, and highlight its button. */
  show: () => void
  narrationUrl: string | null
  playing: boolean
  togglePlay: () => void
  voiceOn: boolean
  setVoiceOn: (on: boolean) => void
  voice: TourVoice
  setVoice: (voice: TourVoice) => void
  facts: TourFacts | null
  cost: SpaceCost | null
  autopilot: AutopilotState
  autoNote: AutoNote | null
  startAutopilot: () => void
  pauseAutopilot: () => void
  stopAutopilot: () => void
}

const TourContext = createContext<ContextValue | null>(null)

const HIGHLIGHT = "data-tour-highlight"
const FIND_MS = 8000
const FACTS_MS = 8000

function storageKey(workspaceId: string) {
  return `agora.demoTour.${workspaceId}`
}

type Saved = { index?: number; open?: boolean; voiceOn?: boolean; voice?: TourVoice; autopilot?: AutopilotState }

function readSaved(workspaceId: string): Saved {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId))
    return raw ? (JSON.parse(raw) as Saved) : {}
  } catch {
    return {}
  }
}

function writeSaved(workspaceId: string, saved: Saved) {
  window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(saved))
}

function visible(el: HTMLElement) {
  return el.offsetParent !== null || el.getClientRects().length > 0
}

function findTarget(target: string, state?: string, enabledOnly = false) {
  const wanted = state?.split(/\s+/).filter(Boolean) ?? []
  const matches = [...document.querySelectorAll<HTMLElement>(`[data-guidance-target="${target}"]`)]
  return (
    matches.find((el) => {
      if (!visible(el)) return false
      if (enabledOnly && (el as HTMLButtonElement).disabled) return false
      if (enabledOnly && el.getAttribute("aria-disabled") === "true") return false
      if (enabledOnly && el.hasAttribute("data-disabled")) return false
      const tokens = (el.dataset.guidanceState ?? "").split(/\s+/)
      return wanted.every((token) => tokens.includes(token))
    }) ?? null
  )
}

/** Waits for an element to appear, since sheets and modals render after navigation. */
function whenTarget(target: string, run: (el: HTMLElement) => void) {
  const started = Date.now()
  let timer = 0
  const attempt = () => {
    const el = findTarget(target)
    if (el) {
      run(el)
      return
    }
    if (Date.now() - started < FIND_MS) timer = window.setTimeout(attempt, 200)
  }
  attempt()
  return () => window.clearTimeout(timer)
}

/** Presses an element the way a mouse does, so menus and selects that open on pointer down react too. */
function press(el: HTMLElement) {
  const options = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true } as PointerEventInit
  el.dispatchEvent(new PointerEvent("pointerdown", options))
  el.dispatchEvent(new MouseEvent("mousedown", options))
  el.dispatchEvent(new PointerEvent("pointerup", options))
  el.dispatchEvent(new MouseEvent("mouseup", options))
  el.click()
}

function typeInto(el: HTMLElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

class Stopped extends Error {}
class NotFound extends Error {}

export function DemoTourProvider({
  tour,
  workspaceId,
  spaceId,
  narration,
  children,
}: {
  tour: DemoTour
  workspaceId: string
  spaceId: string
  narration?: TourNarration | null
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { language: uiLanguage, t } = useI18n()
  const language = tourLanguage(uiLanguage)
  const { jobs, refresh: refreshJobs } = useProgrammeJobs()
  const [index, setIndex] = useState(0)
  const [open, setOpenState] = useState(true)
  const [voiceOn, setVoiceOnState] = useState(false)
  const [voice, setVoiceState] = useState<TourVoice>("female")
  const [playing, setPlaying] = useState(false)
  const [visit, setVisit] = useState(0)
  const [facts, setFacts] = useState<TourFacts | null>(null)
  const [cost, setCost] = useState<SpaceCost | null>(null)
  const [autopilot, setAutopilot] = useState<AutopilotState>("off")
  const [autoNote, setAutoNote] = useState<AutoNote | null>(null)
  const [restored, setRestored] = useState(false)
  const [resumeAt, setResumeAt] = useState<number | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const narrationEnd = useRef<Promise<void>>(Promise.resolve())
  const runToken = useRef(0)
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs
  const factsRef = useRef<TourFacts | null>(null)

  useEffect(() => {
    const saved = readSaved(workspaceId)
    if (typeof saved.index === "number") setIndex(Math.min(Math.max(saved.index, 0), tour.steps.length - 1))
    if (typeof saved.open === "boolean") setOpenState(saved.open)
    if (typeof saved.voiceOn === "boolean") setVoiceOnState(saved.voiceOn)
    if (saved.voice && TOUR_VOICES.includes(saved.voice)) setVoiceState(saved.voice)
    if (saved.autopilot === "paused") setAutopilot("paused")
    if (saved.autopilot === "running" && typeof saved.index === "number") setResumeAt(saved.index)
    setRestored(true)
  }, [tour.steps.length, workspaceId])

  useEffect(() => {
    if (!restored) return
    writeSaved(workspaceId, { index, open, voiceOn, voice, autopilot })
  }, [autopilot, index, open, restored, voice, voiceOn, workspaceId])

  const refreshFacts = useCallback(async () => {
    const result = await getTourFacts(workspaceId)
    factsRef.current = result.data
    setFacts(result.data)
    setCost(result.cost)
    return result.data
  }, [workspaceId])

  useEffect(() => {
    if (!open) return
    void refreshFacts()
    const timer = window.setInterval(() => void refreshFacts(), FACTS_MS)
    return () => window.clearInterval(timer)
  }, [open, refreshFacts])

  const step = tour.steps[index] ?? tour.steps[0]
  const urlFor = useCallback(
    (target: TourStep) => narration?.[voice]?.[language]?.[target.id] ?? narration?.female?.[language]?.[target.id] ?? null,
    [language, narration, voice],
  )
  const narrationUrl = urlFor(step)

  const endNarration = useRef<(() => void) | null>(null)

  const stopAudio = useCallback(() => {
    audio.current?.pause()
    endNarration.current?.()
    endNarration.current = null
    setPlaying(false)
  }, [])

  /**
   * Plays one narration; the returned promise settles when it ends, fails, or is stopped.
   * A pause event is ignored: stopping the previous recording fires one a moment later.
   */
  const playAudio = useCallback((url: string | null) => {
    endNarration.current?.()
    endNarration.current = null
    if (!url) {
      narrationEnd.current = Promise.resolve()
      return narrationEnd.current
    }
    audio.current ??= new Audio()
    const player = audio.current
    player.pause()
    player.src = url
    player.currentTime = 0
    narrationEnd.current = new Promise<void>((resolve) => {
      const done = () => {
        player.removeEventListener("ended", done)
        player.removeEventListener("error", done)
        if (endNarration.current === done) endNarration.current = null
        setPlaying(false)
        resolve()
      }
      endNarration.current = done
      player.addEventListener("ended", done)
      player.addEventListener("error", done)
    })
    setPlaying(true)
    void player.play().catch(() => endNarration.current?.())
    return narrationEnd.current
  }, [])

  useEffect(
    () => () => {
      runToken.current += 1
      audio.current?.pause()
    },
    [],
  )

  /** Goes to where a step happens. Returns true when that is another page, which takes the tour over. */
  const navigateTo = useCallback(
    (target: TourStep) => {
      const href = tourStepHref(target, { workspaceId, spaceId })
      const [path, query = ""] = href.split("?")
      if (pathname !== path) {
        router.push(href, { scroll: false })
        return true
      }
      if (!target.place.page && window.location.search.replace(/^\?/, "") !== query) {
        router.replace(href, { scroll: false })
      }
      setVisit((count) => count + 1)
      return false
    },
    [pathname, router, spaceId, workspaceId],
  )

  const pauseAutopilot = useCallback(() => {
    runToken.current += 1
    stopAudio()
    setAutopilot((current) => (current === "off" ? "off" : "paused"))
  }, [stopAudio])

  const stopAutopilot = useCallback(() => {
    runToken.current += 1
    stopAudio()
    setAutopilot("off")
    setAutoNote(null)
  }, [stopAudio])

  const goTo = useCallback(
    (next: number) => {
      if (autopilot === "running") pauseAutopilot()
      const bounded = Math.min(Math.max(next, 0), tour.steps.length - 1)
      stopAudio()
      setIndex(bounded)
      setOpenState(true)
      const target = tour.steps[bounded]
      if (navigateTo(target)) {
        writeSaved(workspaceId, { index: bounded, open: true, voiceOn, voice, autopilot: autopilot === "running" ? "paused" : autopilot })
        return
      }
      if (voiceOn) void playAudio(urlFor(target))
    },
    [autopilot, navigateTo, pauseAutopilot, playAudio, stopAudio, tour.steps, urlFor, voice, voiceOn, workspaceId],
  )

  useEffect(() => {
    if (visit === 0 || !open) return
    const cleanups: Array<() => void> = []
    if (step.click) cleanups.push(whenTarget(step.click, (el) => press(el)))
    if (step.target) {
      const target = step.target
      const delay = window.setTimeout(() => {
        cleanups.push(
          whenTarget(target, (el) => {
            el.setAttribute(HIGHLIGHT, "")
            el.scrollIntoView({ block: "nearest", behavior: "smooth" })
          }),
        )
      }, step.click ? 600 : 0)
      cleanups.push(() => window.clearTimeout(delay))
    }
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      document.querySelectorAll(`[${HIGHLIGHT}]`).forEach((el) => el.removeAttribute(HIGHLIGHT))
    }
  }, [open, step, visit])

  const runAutopilot = useCallback(
    async (fromIndex: number) => {
      const token = ++runToken.current
      const ensure = () => {
        if (runToken.current !== token) throw new Stopped()
      }
      const sleep = async (ms: number) => {
        await new Promise((resolve) => window.setTimeout(resolve, ms))
        ensure()
      }
      const waitForElement = async (action: { target: string; state?: string; optional?: boolean }, enabledOnly: boolean) => {
        const started = Date.now()
        const limit = action.optional ? 10000 : 30000
        for (;;) {
          const el = findTarget(action.target, action.state, enabledOnly)
          if (el) return el
          // An optional press whose button is there in another state is already done, so skip it at once.
          if (action.optional && action.state && findTarget(action.target) && Date.now() - started > 800) throw new NotFound(action.target)
          if (Date.now() - started > limit) throw new NotFound(action.target)
          await sleep(300)
        }
      }
      const waitJob = async (kind: BackgroundJobKind) => {
        const started = Date.now()
        let seenRunning = false
        for (;;) {
          if ((Date.now() - started) % 3000 < 1000) void refreshJobs()
          const job = jobsRef.current[kind]
          if (job?.status === "running") seenRunning = true
          else if (seenRunning || (job && Date.parse(job.updatedAt ?? "") > started)) {
            if (job?.status === "failed") throw new Error(job.error || t("demoTour.jobFailed"))
            return
          } else if (Date.now() - started > 30000) return
          await sleep(1000)
        }
      }
      let resumedHere = false
      const run = async (actions: TourAction[]): Promise<void> => {
        for (const action of actions) {
          ensure()
          if (action.unless || action.onlyIf) {
            const current = await refreshFacts()
            ensure()
            if (action.unless && conditionHolds(action.unless, current)) continue
            if (action.onlyIf && !conditionHolds(action.onlyIf, current)) continue
          }
          try {
            switch (action.do) {
              case "click": {
                const el = await waitForElement(action, true)
                el.scrollIntoView({ block: "center", behavior: "smooth" })
                el.setAttribute(HIGHLIGHT, "")
                await sleep(1100)
                el.removeAttribute(HIGHLIGHT)
                press(el.isConnected && !(el as HTMLButtonElement).disabled ? el : await waitForElement(action, true))
                await sleep(900)
                break
              }
              case "type": {
                const el = await waitForElement(action, false)
                el.focus()
                typeInto(el, action.text[language])
                await sleep(700)
                break
              }
              case "wait":
                await sleep(action.ms)
                break
              case "waitJob":
                await waitJob(action.kind)
                break
              case "waitFor": {
                const started = Date.now()
                for (;;) {
                  if (conditionHolds(action.condition, await refreshFacts())) break
                  if (Date.now() - started > (action.timeoutMs ?? 600000)) throw new Error(t("demoTour.autoTimeout", "This is taking much longer than usual."))
                  await sleep(3000)
                }
                break
              }
              case "waitNarration":
                await narrationEnd.current
                ensure()
                break
              case "key":
                ;(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: action.key, bubbles: true }))
                await sleep(500)
                break
              case "scrollTo": {
                const heading = [...document.querySelectorAll<HTMLElement>("h1, h2, h3")].find((el) =>
                  el.textContent?.toLowerCase().includes(action.text.toLowerCase()),
                )
                heading?.scrollIntoView({ block: "start", behavior: "smooth" })
                await sleep(900)
                break
              }
              case "pause":
                if (resumedHere) break
                setAutoNote({ key: "demoTour.autoBreak", fallback: "Paused for the break. Press Continue when you are ready." })
                runToken.current += 1
                setAutopilot("paused")
                throw new Stopped()
              case "group":
                await run(action.actions)
                break
            }
          } catch (error) {
            if (error instanceof NotFound && action.optional) continue
            throw error
          }
        }
      }

      setAutopilot("running")
      setAutoNote(null)
      try {
        for (let position = fromIndex; position < tour.steps.length; position += 1) {
          ensure()
          const current = tour.steps[position]
          resumedHere = position === fromIndex
          setIndex(position)
          setOpenState(true)
          if (navigateTo(current)) {
            writeSaved(workspaceId, { index: position, open: true, voiceOn, voice, autopilot: "running" })
            return
          }
          await sleep(1600)
          const narrated = playAudio(urlFor(current))
          const done = stepDone(current, await refreshFacts())
          ensure()
          if (!done && current.auto?.length) await run(current.auto)
          await narrated
          ensure()
          await sleep(1200)
        }
        setAutopilot("off")
        setAutoNote({ key: "demoTour.autoFinished", fallback: "The tour is finished." })
      } catch (error) {
        if (error instanceof Stopped) return
        stopAudio()
        setAutopilot("paused")
        setAutoNote(
          error instanceof NotFound
            ? { key: "demoTour.autoNotFound", fallback: "Autopilot could not find the next button. Do this step by hand, then press Continue." }
            : {
                key: "demoTour.autoByHand",
                fallback: "Do this step by hand, then press Continue.",
                detail: error instanceof Error ? error.message : String(error),
              },
        )
      }
    },
    [language, navigateTo, playAudio, refreshFacts, refreshJobs, stopAudio, t, tour.steps, urlFor, voice, voiceOn, workspaceId],
  )

  useEffect(() => {
    if (resumeAt === null) return
    setResumeAt(null)
    void runAutopilot(resumeAt)
  }, [resumeAt, runAutopilot])

  const value = useMemo<ContextValue>(
    () => ({
      workspaceId,
      tour,
      language,
      index,
      step,
      open,
      setOpen: (next) => {
        if (!next) {
          stopAudio()
          if (autopilot === "running") pauseAutopilot()
        }
        setOpenState(next)
      },
      goTo,
      next: () => goTo(index + 1),
      back: () => goTo(index - 1),
      show: () => navigateTo(step),
      narrationUrl,
      playing,
      togglePlay: () => (playing ? stopAudio() : void playAudio(narrationUrl)),
      voiceOn,
      setVoiceOn: (on) => {
        setVoiceOnState(on)
        if (!on) stopAudio()
      },
      voice,
      setVoice: setVoiceState,
      facts,
      cost,
      autopilot,
      autoNote,
      startAutopilot: () => void runAutopilot(index),
      pauseAutopilot,
      stopAutopilot,
    }),
    [autoNote, autopilot, cost, facts, goTo, index, language, narrationUrl, navigateTo, open, pauseAutopilot, playAudio, playing, runAutopilot, step, stopAudio, stopAutopilot, tour, voice, voiceOn, workspaceId],
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

/**
 * Where a tools panel may sit while the tour runs: below the tour strip and left of the open side panel,
 * so both stay visible and clickable.
 */
export function useTourSheetInsets(active: boolean) {
  const [insets, setInsets] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (!active) {
      setInsets(null)
      return
    }
    const measure = () => {
      const strip = document.querySelector("[data-demo-tour-strip]")
      const sidebar = document.querySelector('[data-chat-sidebar="open"]')
      const top = Math.round(strip ? strip.getBoundingClientRect().bottom + 8 : 24)
      const left = sidebar?.getBoundingClientRect().left
      const right = Math.round(left !== undefined && left < window.innerWidth ? window.innerWidth - left + 8 : 24)
      setInsets((current) => (current && current.top === top && current.right === right ? current : { top, right }))
    }
    measure()
    const timer = window.setInterval(measure, 500)
    window.addEventListener("resize", measure)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("resize", measure)
    }
  }, [active])
  return insets
}

/** The tour of the loaded demo, or null outside a demo. */
export function useDemoTour() {
  return useContext(TourContext)
}

function useStepJob(step: TourStep | undefined) {
  const { jobs } = useProgrammeJobs()
  return step?.waitForJob ? (jobs[step.waitForJob] ?? null) : null
}

function VoiceButton({ size = "icon-sm" }: { size?: "icon-sm" | "sm" }) {
  const { t } = useI18n()
  const tour = useDemoTour()
  if (!tour?.narrationUrl) return null
  const label = tour.playing ? t("demoTour.pause", "Pause") : t("demoTour.play", "Play narration")
  return (
    <Button type="button" variant="ghost" size={size} onClick={tour.togglePlay} aria-label={label} title={label}>
      {tour.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      {size === "sm" ? <span>{label}</span> : null}
    </Button>
  )
}

function AutopilotButtons({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  const tour = useDemoTour()
  if (!tour) return null
  if (tour.autopilot === "running") {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={tour.pauseAutopilot} data-demo-autopilot="pause">
        <Pause className="h-3.5 w-3.5" />
        {t("demoTour.autoPause", "Pause autopilot")}
      </Button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={tour.autopilot === "paused" ? "default" : "outline"}
        onClick={tour.startAutopilot}
        data-demo-autopilot="start"
      >
        <Bot className="h-3.5 w-3.5" />
        {tour.autopilot === "paused" ? t("demoTour.autoContinue", "Continue") : t("demoTour.autoStart", "Autopilot")}
      </Button>
      {tour.autopilot === "paused" && !compact ? (
        <Button type="button" size="icon-sm" variant="ghost" onClick={tour.stopAutopilot} aria-label={t("demoTour.autoStop", "Stop autopilot")}>
          <Square className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

/** The slim bar under the programme toolbar; keeps the Tour tab open while Agora presents. */
export function DemoTourStrip() {
  const tour = useDemoTour()
  const { setIsChatOpen, setPanelTab } = useChatContext()
  const running = tour?.autopilot === "running"
  const stepIndex = tour?.index
  useEffect(() => {
    if (!running) return
    setIsChatOpen(true)
    setPanelTab("guidance")
  }, [running, stepIndex, setIsChatOpen, setPanelTab])
  return <TourBar />
}

/**
 * The tour on pages outside the programme, such as the authority page and the platform's AI settings:
 * the bar at the top and a card with what to do and why.
 */
export function DemoTourFloating() {
  const { t } = useI18n()
  const tour = useDemoTour()
  if (!tour || !tour.open) return <DemoTourOpenButton className="fixed right-4 bottom-4 z-50 bg-background shadow" />
  const text = tour.step.text[tour.language]
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 shadow-sm">
        <TourBar />
      </div>
      <div className="h-11" aria-hidden />
      <aside className="fixed right-4 bottom-4 z-50 w-96 max-w-[calc(100vw-2rem)] space-y-2 rounded-lg border bg-background p-4 text-sm shadow-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">{t("demoTour.beta", "Tour · beta")}</p>
        <h2 className="font-semibold leading-snug">{text.title}</h2>
        <p>{text.action}</p>
        <p className="text-muted-foreground">{text.why}</p>
        {tour.autoNote ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            {tour.autoNote.detail ? `${tour.autoNote.detail} ` : ""}
            {t(tour.autoNote.key, tour.autoNote.fallback)}
          </p>
        ) : null}
      </aside>
    </>
  )
}

function TourBar() {
  const { t } = useI18n()
  const tour = useDemoTour()
  const job = useStepJob(tour?.step)
  if (!tour || !tour.open) return null
  const { step, index, language } = tour
  const total = tour.tour.steps.length
  const block = tour.tour.blocks.find((item) => item.id === step.block)
  const text = step.text[language]
  const done = stepDone(step, tour.facts)
  return (
    <div className="relative flex shrink-0 items-center gap-3 border-b bg-sky-50 px-4 py-1.5 text-sm text-sky-950" data-demo-tour-strip="">
      <span className="shrink-0 rounded border border-sky-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
        {t("demoTour.beta", "Tour · beta")}
      </span>
      <div className="min-w-0 flex-1 truncate">
        {block ? <span className="text-sky-800/80">{block.title[language]} · </span> : null}
        <span className="font-medium">{text.title}</span>
        <span className="text-sky-800/70"> · {t("demoTour.stepOf", "Step {{n}} of {{total}}", { n: index + 1, total })}</span>
        {done ? <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-700" aria-label={t("demoTour.done", "Done")} /> : null}
        {job?.status === "running" ? (
          <span className="ml-2 inline-flex items-center gap-1 text-sky-800/80">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("demoTour.jobRunning", "Working")}
          </span>
        ) : null}
      </div>
      <AutopilotButtons compact />
      <DemoAskControl workspaceId={tour.workspaceId} language={language} voice={tour.voice} stepTitle={text.title} />
      <VoiceButton />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => tour.setVoiceOn(!tour.voiceOn)}
        aria-pressed={tour.voiceOn}
        aria-label={tour.voiceOn ? t("demoTour.voiceOff", "Stop the voice presenting") : t("demoTour.voiceOn", "Let the voice present")}
        title={tour.voiceOn ? t("demoTour.voiceOff", "Stop the voice presenting") : t("demoTour.voiceOn", "Let the voice present")}
        className={cn(!tour.narrationUrl && !tour.voiceOn && "hidden")}
      >
        {tour.voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={tour.back}>
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("demoTour.back", "Back")}
      </Button>
      <Button type="button" size="sm" disabled={index >= total - 1} onClick={tour.next} data-demo-tour-next="">
        {t("demoTour.next", "Next")}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => tour.setOpen(false)}
        aria-label={t("demoTour.close", "Close the tour")}
        title={t("demoTour.close", "Close the tour")}
      >
        <X className="h-4 w-4" />
      </Button>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-100">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </div>
  )
}

/** Reopens a closed tour. */
export function DemoTourOpenButton({ className }: { className?: string }) {
  const { t } = useI18n()
  const tour = useDemoTour()
  if (!tour || tour.open) return null
  return (
    <Button type="button" variant="ghost" size="sm" className={className} onClick={() => tour.setOpen(true)}>
      <Compass className="h-3.5 w-3.5" />
      {t("demoTour.open", "Guided tour")}
    </Button>
  )
}

function Block({ label, children, tone }: { label: string; children: ReactNode; tone?: "live" }) {
  return (
    <section className={cn("space-y-1.5 rounded-lg border p-3", tone === "live" ? "border-sky-200 bg-sky-50/60" : "bg-card")}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return `${hours}:${String(rest).padStart(2, "0")}`
}

/** The side panel: what to do, why it matters, and what Agora is doing right now. */
export function DemoTourPanel() {
  const { t } = useI18n()
  const tour = useDemoTour()
  const job = useStepJob(tour?.step)
  if (!tour) return null
  const { step, index, language } = tour
  const total = tour.tour.steps.length
  const text = step.text[language]
  const block = tour.tour.blocks.find((item) => item.id === step.block)
  const startsAt = tourStartMinutes(tour.tour)[index] ?? 0
  const blockSteps = tour.tour.steps.map((item, position) => ({ item, position })).filter(({ item }) => item.block === step.block)
  const withResult = tour.tour.steps.filter((item) => item.doneWhen?.length)
  const doneCount = withResult.filter((item) => stepDone(item, tour.facts)).length
  const progress = job?.progress
  const jobLine =
    !step.waitForJob
      ? null
      : job?.status === "running"
        ? progress && progress.total > 1
          ? t("demoTour.jobProgress", "Working: {{done}} of {{total}} done.", { done: progress.done, total: progress.total })
          : t("demoTour.jobRunning", "Working")
        : job && (job.status === "done" || job.status === "failed")
          ? job.status === "failed"
            ? t("demoTour.jobFailed", "This run stopped with an error. Try once more, or move on.")
            : t("demoTour.jobDone", "Done. The result is on screen.")
          : t("demoTour.jobIdle", "Not started yet.")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-1 border-b px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">{t("demoTour.beta", "Tour · beta")}</p>
        <h2 className="flex items-center gap-1.5 text-base font-semibold leading-snug">
          {text.title}
          {stepDone(step, tour.facts) ? <Check className="h-4 w-4 text-emerald-700" aria-label={t("demoTour.done", "Done")} /> : null}
        </h2>
        <p className="text-xs text-muted-foreground">
          {block ? `${block.title[language]} · ` : ""}
          {t("demoTour.stepOf", "Step {{n}} of {{total}}", { n: index + 1, total })} ·{" "}
          {t("demoTour.minutes", "about {{n}} min", { n: step.estMinutes })} · {t("demoTour.startsAt", "at {{clock}}", { clock: formatClock(startsAt) })}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <AutopilotButtons />
          {tour.autopilot === "running" ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("demoTour.autoRunning", "Agora is presenting this step.")}
            </span>
          ) : null}
        </div>
        {tour.autoNote ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {tour.autoNote.detail ? `${tour.autoNote.detail} ` : ""}
            {t(tour.autoNote.key, tour.autoNote.fallback)}
          </p>
        ) : null}
        <Block label={t("demoTour.what", "What to do")}>
          <p>{text.action}</p>
          {step.target || step.click || step.place.section || step.place.view === "knowledge" ? (
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={tour.show}>
              {t("demoTour.showMe", "Show me where")}
            </Button>
          ) : null}
        </Block>
        <Block label={t("demoTour.why", "Why")}>
          <p>{text.why}</p>
        </Block>
        {text.happening || jobLine ? (
          <Block label={t("demoTour.happening", "What is happening")} tone={job?.status === "running" ? "live" : undefined}>
            {text.happening ? <p>{text.happening}</p> : null}
            {jobLine ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                {job?.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {jobLine}
              </p>
            ) : null}
          </Block>
        ) : null}
        <Block label={t("demoTour.expect", "What the room sees")}>
          <p>{text.expect}</p>
        </Block>
        {tour.narrationUrl ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <VoiceButton size="sm" />
              <Button type="button" variant="ghost" size="sm" onClick={() => tour.setVoiceOn(!tour.voiceOn)} aria-pressed={tour.voiceOn}>
                {tour.voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {tour.voiceOn ? t("demoTour.voiceOff", "Stop the voice presenting") : t("demoTour.voiceOn", "Let the voice present")}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground" role="group" aria-label={t("demoTour.voiceLabel", "Voice")}>
              <span>{t("demoTour.voiceLabel", "Voice")}</span>
              {TOUR_VOICES.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={tour.voice === option ? "secondary" : "ghost"}
                  aria-pressed={tour.voice === option}
                  className="h-7 px-2 text-xs"
                  onClick={() => tour.setVoice(option)}
                >
                  {t(`demoTour.voice.${option}`, option)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {blockSteps.length > 1 ? (
          <div className="space-y-1 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("demoTour.inThisBlock", "In this part")}</p>
            <ol className="space-y-0.5">
              {blockSteps.map(({ item, position }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => tour.goTo(position)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-muted",
                      position === index ? "bg-muted font-medium" : "text-muted-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      {position + 1}. {item.text[language].title}
                    </span>
                    {stepDone(item, tour.facts) ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" /> : null}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="space-y-0.5 border-t pt-3 text-xs text-muted-foreground">
          {withResult.length ? (
            <p>{t("demoTour.doneCount", "{{done}} of {{total}} steps with a result are done.", { done: doneCount, total: withResult.length })}</p>
          ) : null}
          {tour.cost ? (
            <p>
              {t("demoTour.cost", "AI cost of this demo so far: about US$ {{cost}}", { cost: tour.cost.totalUsd.toFixed(2) })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
        <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={tour.back}>
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("demoTour.back", "Back")}
        </Button>
        <Button type="button" size="sm" disabled={index >= total - 1} onClick={tour.next}>
          {t("demoTour.next", "Next")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
