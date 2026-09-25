"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Compass, Loader2, Pause, Play, Volume2, VolumeX, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useProgrammeJobs } from "@/components/programme-jobs-provider"
import { DemoAskControl } from "@/components/demo-ask"
import { useI18n } from "@/lib/i18n/use-i18n"
import { cn } from "@/lib/utils"
import {
  tourLanguage,
  tourStartMinutes,
  tourStepQuery,
  type DemoTour,
  type TourLanguage,
  type TourNarration,
  type TourStep,
} from "@/lib/programme/demo-tour"

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
}

const TourContext = createContext<ContextValue | null>(null)

const HIGHLIGHT = "data-tour-highlight"
const FIND_MS = 8000

function storageKey(workspaceId: string) {
  return `agora.demoTour.${workspaceId}`
}

function readSaved(workspaceId: string) {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId))
    const parsed = raw ? (JSON.parse(raw) as { index?: number; open?: boolean; voiceOn?: boolean }) : {}
    return parsed
  } catch {
    return {}
  }
}

function findTarget(target: string) {
  const matches = [...document.querySelectorAll<HTMLElement>(`[data-guidance-target="${target}"]`)]
  return matches.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) ?? null
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

export function DemoTourProvider({
  tour,
  workspaceId,
  narration,
  children,
}: {
  tour: DemoTour
  workspaceId: string
  narration?: TourNarration | null
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { language: uiLanguage } = useI18n()
  const language = tourLanguage(uiLanguage)
  const [index, setIndex] = useState(0)
  const [open, setOpenState] = useState(true)
  const [voiceOn, setVoiceOnState] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [visit, setVisit] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const saved = readSaved(workspaceId)
    if (typeof saved.index === "number") setIndex(Math.min(Math.max(saved.index, 0), tour.steps.length - 1))
    if (typeof saved.open === "boolean") setOpenState(saved.open)
    if (typeof saved.voiceOn === "boolean") setVoiceOnState(saved.voiceOn)
    setRestored(true)
  }, [tour.steps.length, workspaceId])

  useEffect(() => {
    if (!restored) return
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify({ index, open, voiceOn }))
  }, [index, open, restored, voiceOn, workspaceId])

  const step = tour.steps[index] ?? tour.steps[0]
  const narrationUrl = narration?.[language]?.[step.id] ?? null

  const stopAudio = useCallback(() => {
    audio.current?.pause()
    setPlaying(false)
  }, [])

  const playAudio = useCallback((url: string | null) => {
    if (!url) return
    if (!audio.current) {
      audio.current = new Audio()
      audio.current.addEventListener("ended", () => setPlaying(false))
      audio.current.addEventListener("pause", () => setPlaying(false))
      audio.current.addEventListener("play", () => setPlaying(true))
    }
    if (audio.current.src !== url) audio.current.src = url
    audio.current.currentTime = 0
    void audio.current.play().catch(() => setPlaying(false))
  }, [])

  useEffect(() => () => audio.current?.pause(), [])

  const navigateTo = useCallback(
    (target: TourStep) => {
      const query = tourStepQuery(target)
      const base = `/workspaces/${workspaceId}/programme`
      if (pathname !== base || window.location.search.replace(/^\?/, "") !== query) {
        router.replace(`${base}?${query}`, { scroll: false })
      }
      setVisit((count) => count + 1)
    },
    [pathname, router, workspaceId],
  )

  const goTo = useCallback(
    (next: number) => {
      const bounded = Math.min(Math.max(next, 0), tour.steps.length - 1)
      stopAudio()
      setIndex(bounded)
      setOpenState(true)
      const target = tour.steps[bounded]
      navigateTo(target)
      if (voiceOn) playAudio(narration?.[language]?.[target.id] ?? null)
    },
    [language, narration, navigateTo, playAudio, stopAudio, tour.steps, voiceOn],
  )

  useEffect(() => {
    if (visit === 0 || !open) return
    const cleanups: Array<() => void> = []
    if (step.click) cleanups.push(whenTarget(step.click, (el) => el.click()))
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

  const value = useMemo<ContextValue>(
    () => ({
      workspaceId,
      tour,
      language,
      index,
      step,
      open,
      setOpen: (next) => {
        if (!next) stopAudio()
        setOpenState(next)
      },
      goTo,
      next: () => goTo(index + 1),
      back: () => goTo(index - 1),
      show: () => navigateTo(step),
      narrationUrl,
      playing,
      togglePlay: () => (playing ? stopAudio() : playAudio(narrationUrl)),
      voiceOn,
      setVoiceOn: (on) => {
        setVoiceOnState(on)
        if (!on) stopAudio()
      },
    }),
    [goTo, index, language, narrationUrl, navigateTo, open, playAudio, playing, step, stopAudio, tour, voiceOn, workspaceId],
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

/** The slim bar under the toolbar: where we are in the demo, with Back and Next. */
export function DemoTourStrip() {
  const { t } = useI18n()
  const tour = useDemoTour()
  const job = useStepJobSafe(tour?.step)
  if (!tour || !tour.open) return null
  const { step, index, language } = tour
  const total = tour.tour.steps.length
  const block = tour.tour.blocks.find((item) => item.id === step.block)
  const text = step.text[language]
  return (
    <div className="relative flex shrink-0 items-center gap-3 border-b bg-sky-50 px-4 py-1.5 text-sm text-sky-950" data-demo-tour-strip="">
      <span className="shrink-0 rounded border border-sky-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
        {t("demoTour.beta", "Tour · beta")}
      </span>
      <div className="min-w-0 flex-1 truncate">
        {block ? <span className="text-sky-800/80">{block.title[language]} · </span> : null}
        <span className="font-medium">{text.title}</span>
        <span className="text-sky-800/70"> · {t("demoTour.stepOf", "Step {{n}} of {{total}}", { n: index + 1, total })}</span>
        {job?.status === "running" ? (
          <span className="ml-2 inline-flex items-center gap-1 text-sky-800/80">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("demoTour.jobRunning", "Working")}
          </span>
        ) : null}
      </div>
      <DemoAskControl workspaceId={tour.workspaceId} language={language} stepTitle={text.title} />
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

function useStepJobSafe(step: TourStep | undefined) {
  const { jobs } = useProgrammeJobs()
  return step?.waitForJob ? (jobs[step.waitForJob] ?? null) : null
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
  const job = useStepJobSafe(tour?.step)
  if (!tour) return null
  const { step, index, language } = tour
  const total = tour.tour.steps.length
  const text = step.text[language]
  const block = tour.tour.blocks.find((item) => item.id === step.block)
  const startsAt = tourStartMinutes(tour.tour)[index] ?? 0
  const blockSteps = tour.tour.steps.map((item, position) => ({ item, position })).filter(({ item }) => item.block === step.block)
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
        <h2 className="text-base font-semibold leading-snug">{text.title}</h2>
        <p className="text-xs text-muted-foreground">
          {block ? `${block.title[language]} · ` : ""}
          {t("demoTour.stepOf", "Step {{n}} of {{total}}", { n: index + 1, total })} ·{" "}
          {t("demoTour.minutes", "about {{n}} min", { n: step.estMinutes })} · {t("demoTour.startsAt", "at {{clock}}", { clock: formatClock(startsAt) })}
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
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
          <div className="flex items-center gap-2">
            <VoiceButton size="sm" />
            <Button type="button" variant="ghost" size="sm" onClick={() => tour.setVoiceOn(!tour.voiceOn)} aria-pressed={tour.voiceOn}>
              {tour.voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {tour.voiceOn ? t("demoTour.voiceOff", "Stop the voice presenting") : t("demoTour.voiceOn", "Let the voice present")}
            </Button>
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
                      "w-full rounded px-2 py-1 text-left text-xs hover:bg-muted",
                      position === index ? "bg-muted font-medium" : "text-muted-foreground",
                    )}
                  >
                    {position + 1}. {item.text[language].title}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
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
