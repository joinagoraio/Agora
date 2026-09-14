"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { HelpCircle, Loader2, Send, X } from "lucide-react"
import { FormattedMarkdown } from "@/components/formatted-markdown"
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
  onNavigate?: (section: string, target?: string) => void
  onModeChange?: (mode: GuidanceMode) => void
  onOpenChange?: (open: boolean) => void
  reviewComplete?: boolean
  expertPromptDismissed?: boolean
  compact?: boolean
  variant?: "overlay" | "embedded"
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
  onNavigate,
  onModeChange,
  onOpenChange,
  reviewComplete = false,
  expertPromptDismissed = false,
  variant = "overlay",
}: Props) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(variant === "embedded" || guidanceMode === "guided")
  const [mode, setMode] = useState<GuidanceMode>(guidanceMode)
  const [ask, setAsk] = useState("")
  const [messages, setMessages] = useState<HelpChatMessage[]>([])
  const [askBusy, setAskBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [showExpertPrompt, setShowExpertPrompt] = useState(false)
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
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
    if (variant !== "embedded") setOpen(next === "guided")
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
      const reply =
        displayHelpText(data?.text || "") || data?.error || t("guidance.coach.askError")
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

  const switchId = "guidance-mode-switch"

  const clearHelpChat = () => {
    setMessages([])
    setConversationId(null)
    setAsk("")
    setIsClearConfirmOpen(false)
  }

  const intro = (
    <div className={cn("space-y-3 text-sm", variant === "embedded" && "text-center")}>
      <p className={variant === "embedded" ? "text-lg font-semibold" : undefined}>{where}</p>
      {section && surface === "programme" && (
        <p className="text-muted-foreground">
          {t("guidance.coach.whereTab", undefined, { tab: t(`workspace.programme.nav.${section}`, section) })}
        </p>
      )}
      <p className="text-muted-foreground">{purpose}</p>
      {surface === "programme" && pipeline?.firstIncomplete && pipeline.firstIncomplete !== "orient" ? (
        <div
          role="status"
          aria-label={t("guidance.coach.nextStepAria")}
          className={cn("space-y-2 rounded-md border bg-muted/50 p-3", variant === "embedded" && "text-left")}
        >
          <p className="font-medium">
            {t("guidance.coach.next", undefined, { action: t(`guidance.coach.stages.${pipeline.firstIncomplete}`) })}
          </p>
          <p className="text-muted-foreground">{nextAction}</p>
          {pipeline.firstIncomplete !== "draft" ? (
            <Button type="button" size="sm" onClick={goNext}>
              {t(`workspace.programme.nav.${pipeline.firstIncompleteSection}`, pipeline.firstIncompleteSection)}
            </Button>
          ) : null}
        </div>
      ) : null}

      {surface === "programme" && pipeline && (
        <ol className={cn("space-y-1", variant === "embedded" && "text-left")}>
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

      {showExpertPrompt && (
        <div className="rounded-md border p-3 text-left">
          <p className="font-medium">{t("guidance.mode.tryExpertTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("guidance.mode.tryExpertBody")}</p>
          <div className="mt-2 flex justify-center gap-2">
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
  )

  const chatPane = (
    <div className="flex h-full min-h-0 flex-col">
      {messages.length > 0 && (
        <div className="flex min-h-[40px] items-center justify-end gap-2 bg-card px-4 py-2">
          {!isClearConfirmOpen ? (
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={askBusy}
              onClick={() => setIsClearConfirmOpen(true)}
            >
              <X className="h-3.5 w-3.5" />
              {t("workspace.chat.interface.controls.clear")}
            </button>
          ) : (
            <div className="inline-flex h-6 items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("workspace.chat.interface.controls.confirmQuestion")}</span>
              <button
                type="button"
                className="h-6 px-2 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setIsClearConfirmOpen(false)}
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                className="h-6 px-2 text-destructive transition-colors hover:text-destructive/80"
                onClick={clearHelpChat}
              >
                {t("workspace.chat.interface.controls.confirm")}
              </button>
            </div>
          )}
        </div>
      )}
      <div
        className={cn(
          "flex-1 space-y-4 p-4",
          messages.length > 0 ? "overflow-y-auto chat-scrollable" : "overflow-hidden",
        )}
      >
        {messages.length === 0 && !askBusy && (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md">{intro}</div>
          </div>
        )}
        {messages.map((message) => {
          const isUser = message.role === "user"
          return (
            <div key={message.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] sm:max-w-[60ch] rounded-2xl px-3 py-2 text-sm break-words",
                  isUser && "bg-primary/5 text-foreground",
                )}
              >
                <FormattedMarkdown>{message.content}</FormattedMarkdown>
              </div>
            </div>
          )
        })}
        {askBusy && (
          <div className="flex justify-start">
            <div className="flex items-center px-2 animate-pulse">
              <span className="text-sm italic text-muted-foreground">{t("workspace.chat.interface.messages.thinking")}…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="space-y-2 border-t bg-card p-4">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault()
            void submitAsk()
          }}
        >
          <Textarea
            ref={askRef}
            id={variant === "embedded" ? "guidance-ask-embedded" : "guidance-ask"}
            value={ask}
            onChange={(event) => setAsk(event.target.value)}
            placeholder={t("guidance.coach.askPlaceholder")}
            className="min-h-[60px] flex-1 resize-none pr-10 shadow"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void submitAsk()
              }
            }}
            disabled={askBusy}
            aria-label={t("guidance.header.help")}
          />
          <IconTooltip label={t("workspace.chat.interface.input.send")} className="absolute bottom-2 right-3">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              disabled={askBusy || !ask.trim()}
              className="h-6 w-6 p-0"
              aria-label={t("workspace.chat.interface.input.send")}
            >
              {askBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </Button>
          </IconTooltip>
        </form>
        <p className="pl-3 text-xs text-muted-foreground">{t("workspace.chat.interface.input.hint")}</p>
      </div>
    </div>
  )

  const body = helpAiEnabled ? (
    chatPane
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{intro}</div>
  )

  if (variant === "embedded") {
    return (
      <div className="flex h-full min-h-0 flex-col" aria-label={t("guidance.coach.landmark")}>
        {body}
      </div>
    )
  }

  return (
    <>
      {!open && (
        <IconTooltip
          label={t("guidance.header.help")}
          className="fixed z-[60]"
          style={{ right: surface === "research" ? 84 : 24, bottom: 24 }}
        >
          <Button
            type="button"
            size="icon"
            onClick={reopen}
            className="guidance-help-fab h-10 w-10 rounded-full shadow-lg"
            aria-label={t("guidance.header.help")}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </IconTooltip>
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
            <label htmlFor={switchId} className="text-xs font-medium">
              {t("guidance.mode.guided")}
            </label>
            <IconTooltip label={t("guidance.mode.toggleSr")}>
              <Switch
                id={switchId}
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
        {body}
      </aside>
    </>
  )
}
