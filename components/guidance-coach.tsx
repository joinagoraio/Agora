"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { HelpCircle, Loader2, Send, X } from "lucide-react"
import { useI18n } from "@/lib/i18n/use-i18n"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { trackGuidanceEvent } from "@/lib/guidance/telemetry"
import { PIPELINE_STAGES, type GuidancePipelineSnapshot, type PipelineStageId } from "@/lib/guidance/pipeline"
import type { GuidanceJob, GuidanceMode } from "@/lib/guidance/jobs"
import { IconTooltip } from "@/components/icon-tooltip"

type HelpChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type Props = {
  surface: "organisation" | "programme" | "research"
  placeName: string
  spaceId?: string
  workspaceId?: string
  section?: string
  job: GuidanceJob
  guidanceMode: GuidanceMode
  pipeline?: GuidancePipelineSnapshot | null
  helpAiEnabled?: boolean
  documentTitles?: Array<{ title: string; role: string | null }>
  canReopenWizard?: boolean
  onReopenWizard?: () => void
  onNavigate?: (section: string, target?: string) => void
  onModeChange?: (mode: GuidanceMode) => void
  onOpenChange?: (open: boolean) => void
  reviewComplete?: boolean
  expertPromptDismissed?: boolean
  compact?: boolean
}

const NEXT_COPY: Record<Exclude<PipelineStageId, "orient">, string> = {
  bind: "guidance.coach.nextBind",
  analyse: "guidance.coach.nextAnalyse",
  structure: "guidance.coach.nextStructure",
  draft: "guidance.coach.nextDraft",
  check: "guidance.coach.nextCheck",
  review: "guidance.coach.nextReview",
  export: "guidance.coach.nextExport",
}

const STAGE_TARGET: Partial<Record<PipelineStageId, string>> = {
  bind: "bind-vision",
  analyse: "run-analysis",
}

function displayHelpText(text: string) {
  return text.replace(/\n?NAVIGATE:\s*\S+/gi, "").trim()
}

export function GuidanceCoach({
  surface,
  placeName,
  spaceId,
  workspaceId,
  section,
  job,
  guidanceMode,
  pipeline,
  helpAiEnabled = false,
  documentTitles = [],
  canReopenWizard = false,
  onReopenWizard,
  onNavigate,
  onModeChange,
  onOpenChange,
  reviewComplete = false,
  expertPromptDismissed = false,
}: Props) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(guidanceMode === "guided")
  const [mode, setMode] = useState<GuidanceMode>(guidanceMode)
  const [ask, setAsk] = useState("")
  const [messages, setMessages] = useState<HelpChatMessage[]>([])
  const [askBusy, setAskBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [focusedGlossaryTerm, setFocusedGlossaryTerm] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [showExpertPrompt, setShowExpertPrompt] = useState(false)
  const askRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const focusAskOnOpen = useRef(false)

  useEffect(() => {
    setMode(guidanceMode)
  }, [guidanceMode])

  useEffect(() => {
    if (reviewComplete && !expertPromptDismissed && mode === "guided") {
      setShowExpertPrompt(true)
    }
  }, [reviewComplete, expertPromptDismissed, mode])

  useEffect(() => {
    if (!highlight) return
    const clearHighlight = () => {
      setHighlight(null)
      document.querySelectorAll("[data-guidance-highlight]").forEach((el) => el.removeAttribute("data-guidance-highlight"))
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearHighlight()
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const highlighted = document.querySelector("[data-guidance-highlight]")
      const overlay = document.querySelector(".guidance-overlay")
      if (highlighted?.contains(target)) return
      if (overlay?.contains(target)) return
      clearHighlight()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [highlight])

  useEffect(() => {
    document.querySelectorAll("[data-guidance-highlight]").forEach((el) => el.removeAttribute("data-guidance-highlight"))
    if (!highlight) return
    const el = document.querySelector(`[data-guidance-target="${highlight}"]`)
    if (el instanceof HTMLElement) {
      el.setAttribute("data-guidance-highlight", "true")
      el.focus({ preventScroll: false })
    }
  }, [highlight, section, open])

  useEffect(() => {
    if (!open || !focusAskOnOpen.current || !helpAiEnabled) return
    focusAskOnOpen.current = false
    const timer = window.setTimeout(() => askRef.current?.focus(), 240)
    return () => window.clearTimeout(timer)
  }, [open, helpAiEnabled])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" })
  }, [messages, askBusy, open])

  useEffect(() => {
    const onOpenGlossary = (event: Event) => {
      const term = (event as CustomEvent<{ term?: string }>).detail?.term
      setOpen(true)
      setGlossaryOpen(true)
      setFocusedGlossaryTerm(term || null)
    }
    window.addEventListener("agora-open-glossary", onOpenGlossary)
    return () => window.removeEventListener("agora-open-glossary", onOpenGlossary)
  }, [])

  useEffect(() => {
    if (!glossaryOpen || !focusedGlossaryTerm) return
    const el = document.getElementById(`guidance-glossary-${focusedGlossaryTerm}`)
    el?.scrollIntoView({ block: "nearest" })
  }, [glossaryOpen, focusedGlossaryTerm, open])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    document.body.style.marginRight = ""
    document.body.style.transition = ""
    document.documentElement.style.overflowX = ""
    document.documentElement.classList.remove("guidance-overlay-open")
  }, [])

  const persistMode = async (next: GuidanceMode, extras?: { dismissExpertPrompt?: boolean }) => {
    setMode(next)
    setOpen(next === "guided")
    onModeChange?.(next)
    void trackGuidanceEvent({ event: "guidance_mode_toggle", job, mode: next, section })
    try {
      const token = await fetchCsrfToken()
      await fetch("/api/profile/guidance", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({ guidanceMode: next, ...extras }),
      })
    } catch {
      // Preference write is best-effort; chrome already updated.
    }
  }

  const reopen = () => {
    focusAskOnOpen.current = true
    setOpen(true)
    void trackGuidanceEvent({ event: "coach_reopen", job, mode, section })
  }

  const nextAction = useMemo(() => {
    if (surface !== "programme" || !pipeline?.firstIncomplete) return t("guidance.coach.nothingRequired")
    if (pipeline.firstIncomplete === "orient") return t("guidance.coach.organisationHint")
    return t(NEXT_COPY[pipeline.firstIncomplete])
  }, [pipeline, surface, t])

  const goNext = () => {
    if (surface !== "programme" || !pipeline) return
    const target = pipeline.firstIncomplete ? STAGE_TARGET[pipeline.firstIncomplete] : undefined
    setHighlight(target ?? null)
    onNavigate?.(pipeline.firstIncompleteSection, target)
  }

  const submitAsk = async () => {
    const message = ask.trim()
    if (!message || askBusy) return
    const userMessage: HelpChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    }
    setMessages((current) => [...current, userMessage])
    setAsk("")
    if (!helpAiEnabled) {
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", content: t("guidance.coach.askUnavailable") },
      ])
      return
    }
    setAskBusy(true)
    try {
      const token = await fetchCsrfToken()
      const response = await fetch("/api/help", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-csrf-token": token } : {}),
        },
        body: JSON.stringify({
          message,
          conversationId: conversationId || undefined,
          spaceId: spaceId || undefined,
          workspaceId: workspaceId || undefined,
          section: section || undefined,
          job,
          pipeline: pipeline
            ? PIPELINE_STAGES.map((stage) => `${stage}:${pipeline.stages[stage] ? "done" : "open"}`).join(",")
            : undefined,
          documentTitles,
          language: language === "nl" ? "nl" : "en",
        }),
      })
      const data = (await response.json().catch(() => null)) as
        | { text?: string; refused?: boolean; conversationId?: string; navigate?: string | null; error?: string }
        | null
      if (data?.conversationId) setConversationId(data.conversationId)
      if (data?.refused) void trackGuidanceEvent({ event: "help_refusal", job, mode, section })
      else void trackGuidanceEvent({ event: "help_ask", job, mode, section })
      const reply = displayHelpText(data?.text || data?.error || t("guidance.coach.askError"))
      setMessages((current) => [
        ...current,
        { id: data?.conversationId ? `assistant-${data.conversationId}-${current.length}` : `assistant-${Date.now()}`, role: "assistant", content: reply },
      ])
      if (data?.navigate && workspaceId) {
        const match = data.navigate.match(/section=([a-z]+)/)
        if (match?.[1]) onNavigate?.(match[1])
      }
    } catch {
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", content: t("guidance.coach.askError") },
      ])
    } finally {
      setAskBusy(false)
    }
  }

  const where =
    surface === "organisation"
      ? t("guidance.coach.whereOrganisation", undefined, { name: placeName })
      : surface === "research"
        ? t("guidance.coach.whereResearch")
        : t("guidance.coach.whereProgramme", undefined, { name: placeName })

  const purpose =
    surface === "programme" && section
      ? t(`workspace.programme.purpose.${section}`, t("guidance.coach.organisationHint"))
      : surface === "programme"
        ? t("guidance.coach.workspaceHomeHint")
        : surface === "organisation"
          ? t("guidance.coach.organisationHint")
          : t("guidance.coach.researchHint")

  return (
    <>
      {!open && (
        <Button
          type="button"
          size="lg"
          onClick={reopen}
          style={{ right: surface === "research" ? 84 : 24, bottom: 24 }}
          className="guidance-help-fab fixed z-[60] h-10 gap-2 rounded-full px-4 shadow-lg"
        >
          <HelpCircle className="h-4 w-4" />
          {t("guidance.header.help")}
        </Button>
      )}

      <aside
        aria-label={t("guidance.coach.landmark")}
        aria-hidden={!open}
        inert={!open || undefined}
        className={cn(
          "guidance-overlay fixed z-40 flex flex-col border-l bg-background shadow-2xl",
          open ? "guidance-overlay-open" : "pointer-events-none guidance-overlay-closed",
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-none">{t("guidance.coach.landmark")}</p>
            {mode === "expert" && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("guidance.mode.expertHint")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="guidance-mode-switch" className="text-xs font-medium">
              {t("guidance.mode.guided")}
            </label>
            <IconTooltip label={t("guidance.mode.toggleSr")}>
              <Switch
                id="guidance-mode-switch"
                checked={mode === "guided"}
                onCheckedChange={(checked) => void persistMode(checked ? "guided" : "expert")}
                aria-label={t("guidance.mode.toggleSr")}
              />
            </IconTooltip>
            <IconTooltip label={t("guidance.coach.closePanel")}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
                aria-label={t("guidance.coach.closePanel")}
              >
                <X className="h-4 w-4" />
              </Button>
            </IconTooltip>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
            <p>{where}</p>
            {section && surface === "programme" && (
              <p className="mt-1 text-muted-foreground">
                {t("guidance.coach.whereTab", undefined, { tab: t(`workspace.programme.nav.${section}`, section) })}
              </p>
            )}
            <p className="mt-2 text-muted-foreground">{purpose}</p>
            <p className="mt-3 font-medium">{t("guidance.coach.next", undefined, { action: nextAction })}</p>
            {surface === "programme" && pipeline?.firstIncomplete && (
              <Button type="button" className="mt-2" size="sm" onClick={goNext}>
                {t(`workspace.programme.nav.${pipeline.firstIncompleteSection}`, pipeline.firstIncompleteSection)}
              </Button>
            )}

            {surface === "programme" && pipeline && (
              <ol className="mt-4 space-y-1">
                <li className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("guidance.coach.pipelineTitle")}
                </li>
                {PIPELINE_STAGES.map((stage) => {
                  const done = pipeline.stages[stage]
                  const current = pipeline.firstIncomplete === stage
                  return (
                    <li
                      key={stage}
                      className={cn(
                        "text-xs",
                        done && "text-muted-foreground line-through",
                        current && "font-medium text-foreground",
                        !done && !current && "text-muted-foreground",
                      )}
                    >
                      {t(`guidance.coach.stages.${stage}`)}
                    </li>
                  )
                })}
              </ol>
            )}

            <div className="mt-4">
              <button type="button" className="text-xs underline" onClick={() => setGlossaryOpen((value) => !value)}>
                {t("guidance.coach.glossaryTitle")}
              </button>
              {glossaryOpen && (
                <dl className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {(["authority", "programme", "documents", "bindings", "specialist", "research"] as const).map(
                    (term) => (
                      <div
                        key={term}
                        id={`guidance-glossary-${term}`}
                        className={cn(focusedGlossaryTerm === term && "rounded-md ring-2 ring-ring ring-offset-2")}
                      >
                        <dt className="font-medium text-foreground">{t(`guidance.coach.glossaryTerms.${term}`)}</dt>
                        <dd>{t(`guidance.coach.glossary.${term}`)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              )}
            </div>

            {canReopenWizard && onReopenWizard && (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onReopenWizard}>
                {t("guidance.coach.reopenWizard")}
              </Button>
            )}

            {showExpertPrompt && (
              <div className="mt-4 rounded-md border p-3">
                <p className="font-medium">{t("guidance.mode.tryExpertTitle")}</p>
                <p className="mt-1 text-muted-foreground">{t("guidance.mode.tryExpertBody")}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowExpertPrompt(false)
                      void persistMode("expert", { dismissExpertPrompt: true })
                    }}
                  >
                    {t("guidance.mode.tryExpertConfirm")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowExpertPrompt(false)
                      void persistMode("guided", { dismissExpertPrompt: true })
                      void trackGuidanceEvent({ event: "expert_prompt_dismiss", job, mode, section })
                    }}
                  >
                    {t("guidance.mode.tryExpertDismiss")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {helpAiEnabled && (
            <div className="flex min-h-0 flex-1 flex-col border-t bg-muted/20">
              <div className="flex shrink-0 items-center border-b px-3 py-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {t("guidance.coach.chatTitle")}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {messages.length === 0 && !askBusy && (
                  <p className="px-2 text-xs text-muted-foreground">{t("guidance.coach.chatEmpty")}</p>
                )}
                <div className="space-y-3">
                  {messages.map((message) => {
                    const isUser = message.role === "user"
                    return (
                      <div key={message.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                            isUser ? "bg-primary/5 text-foreground" : "bg-muted/50 text-foreground",
                          )}
                        >
                          {message.content}
                        </div>
                      </div>
                    )
                  })}
                  {askBusy && (
                    <div className="flex justify-start">
                      <p className="px-2 text-xs italic text-muted-foreground animate-pulse">
                        {t("guidance.coach.thinking")}
                      </p>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </div>

              <form
                className="shrink-0 border-t p-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitAsk()
                }}
              >
                <div className="relative">
                  <Textarea
                    ref={askRef}
                    id="guidance-ask"
                    rows={2}
                    className="min-h-[2.75rem] resize-none pr-10"
                    placeholder={t("guidance.coach.askPlaceholder")}
                    value={ask}
                    onChange={(event) => setAsk(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        void submitAsk()
                      }
                    }}
                    disabled={askBusy}
                    aria-label={t("guidance.header.help")}
                  />
                  <IconTooltip label={t("guidance.coach.send")}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      disabled={askBusy || !ask.trim()}
                      className="absolute bottom-1.5 right-1.5 h-7 w-7"
                      aria-label={t("guidance.coach.send")}
                    >
                      {askBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                  </IconTooltip>
                </div>
                <p className="sr-only">{t("guidance.chat.programmeAssistantHint")}</p>
              </form>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
