"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Mic, Square, Volume2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { IconTooltip } from "@/components/icon-tooltip"
import { useDemoTour } from "@/components/demo-tour"
import { useI18n } from "@/lib/i18n/use-i18n"
import { notify } from "@/lib/notify"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { cn } from "@/lib/utils"
import { speakableParts, speakableText } from "@/lib/speech/speakable"

type Voice = "female" | "male"

/** Dictation stops on its own after this long, so a forgotten microphone does not stay on. */
const MAX_RECORDING_MS = 60000

/** The demo tour's voice when there is one; otherwise the female voice. */
function useSpeechVoice(): Voice {
  return useDemoTour()?.voice ?? "female"
}

/**
 * Answers after this message index are read aloud because their question was spoken. Kept outside
 * the chat, which starts afresh when the first question creates the conversation.
 */
export const spokenQuestion: { after: number | null } = { after: null }

let current: { id: string; audio: HTMLAudioElement; urls: string[]; cancelled: boolean } | null = null
const listeners = new Set<() => void>()

function stopCurrent() {
  if (!current) return
  current.cancelled = true
  current.audio.pause()
  current.urls.forEach((url) => URL.revokeObjectURL(url))
  current = null
  listeners.forEach((listener) => listener())
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const token = await fetchCsrfToken()
  return token ? { "x-csrf-token": token } : {}
}

/** A short first part starts the voice quickly; later parts are fetched while the previous one plays. */
const FIRST_PART_CHARS = 280
const LATER_PART_CHARS = 1200

function partsOf(text: string) {
  const [first, ...rest] = speakableParts(text, FIRST_PART_CHARS)
  if (!first) return []
  return [first, ...speakableParts(rest.join(" "), LATER_PART_CHARS)]
}

async function fetchPart(text: string, input: { voice: Voice; language: string; workspaceId?: string }) {
  const response = await fetch("/api/speech/speak", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await csrfHeaders()) },
    body: JSON.stringify({ ...input, text }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error || "Speech failed")
  }
  return URL.createObjectURL(await response.blob())
}

/** Speaks one text, part by part; only one text plays at a time. */
async function speak(id: string, input: { text: string; voice: Voice; language: string; workspaceId?: string }) {
  stopCurrent()
  const parts = partsOf(speakableText(input.text))
  if (parts.length === 0) return
  const playing = { id, audio: new Audio(), urls: [] as string[], cancelled: false }
  current = playing
  listeners.forEach((listener) => listener())
  let next: Promise<string> | null = fetchPart(parts[0], input)
  for (let index = 0; index < parts.length && next; index += 1) {
    const url = await next
    if (playing.cancelled) {
      URL.revokeObjectURL(url)
      return
    }
    playing.urls.push(url)
    next = index + 1 < parts.length ? fetchPart(parts[index + 1], input) : null
    playing.audio.src = url
    await playing.audio.play()
    await new Promise<void>((resolve) => {
      const done = () => {
        playing.audio.removeEventListener("ended", done)
        playing.audio.removeEventListener("pause", done)
        resolve()
      }
      playing.audio.addEventListener("ended", done)
      playing.audio.addEventListener("pause", done)
    })
    if (playing.cancelled) return
  }
  if (current === playing) stopCurrent()
}

function usePlayingId() {
  const [id, setId] = useState<string | null>(current?.id ?? null)
  useEffect(() => {
    const update = () => setId(current?.id ?? null)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return id
}

/** A speaker button that reads an answer aloud, without its source codes. */
export function ReadAloudButton({
  id,
  text,
  workspaceId,
  autoPlay = false,
}: {
  id: string
  text: string
  workspaceId?: string
  /** Start reading as soon as the button appears, for answers to spoken questions. */
  autoPlay?: boolean
}) {
  const { t, language } = useI18n()
  const voice = useSpeechVoice()
  const playingId = usePlayingId()
  const [loading, setLoading] = useState(false)
  const playing = playingId === id
  const started = useRef(false)

  const play = useCallback(async () => {
    setLoading(true)
    try {
      await speak(id, { text, voice, language, workspaceId })
    } catch (error) {
      notify(error instanceof Error ? error.message : t("workspace.chat.voice.readFailed", "Could not read this answer aloud."), "error")
    } finally {
      setLoading(false)
    }
  }, [id, language, t, text, voice, workspaceId])

  useEffect(() => {
    if (!autoPlay || started.current || spokenQuestion.after === null || !text.trim()) return
    started.current = true
    spokenQuestion.after = null
    void play()
  }, [autoPlay, play, text])

  const label = playing ? t("workspace.chat.voice.stop", "Stop reading") : t("workspace.chat.voice.read", "Read aloud")
  return (
    <IconTooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        aria-label={label}
        data-guidance-target="read-aloud"
        disabled={loading}
        onClick={() => (playing ? stopCurrent() : void play())}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : playing ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
      </Button>
    </IconTooltip>
  )
}

function recorderType() {
  if (typeof MediaRecorder === "undefined") return null
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return { mime: "audio/webm;codecs=opus", ext: "webm" }
  if (MediaRecorder.isTypeSupported("audio/mp4")) return { mime: "audio/mp4", ext: "mp4" }
  return { mime: "", ext: "webm" }
}

/**
 * A microphone button: click to start, click again to stop. The microphone is on only while it records,
 * and is released straight after. The text goes to `onText`.
 */
export function DictationButton({
  workspaceId,
  disabled,
  onText,
  className,
}: {
  workspaceId?: string
  disabled?: boolean
  onText: (text: string) => void
  className?: string
}) {
  const { t, language } = useI18n()
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle")
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef(0)

  const release = () => {
    window.clearTimeout(timer.current)
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop()
      release()
    },
    [],
  )

  const start = async () => {
    const type = recorderType()
    if (!type || !navigator.mediaDevices?.getUserMedia) {
      notify(t("workspace.chat.voice.unsupported", "This browser cannot record speech."), "error")
      return
    }
    try {
      stopCurrent()
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      notify(t("workspace.chat.voice.noMic", "Agora may not use the microphone. Allow it in the browser and try again."), "error")
      return
    }
    const chunks: Blob[] = []
    const next = new MediaRecorder(stream.current, type.mime ? { mimeType: type.mime } : undefined)
    recorder.current = next
    next.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    next.onstop = async () => {
      release()
      setState("transcribing")
      try {
        const form = new FormData()
        form.append("audio", new File(chunks, `question.${type.ext}`, { type: type.mime || "audio/webm" }))
        form.append("language", language === "nl" ? "nl" : "en")
        if (workspaceId) form.append("workspaceId", workspaceId)
        const response = await fetch("/api/speech/transcribe", {
          method: "POST",
          credentials: "include",
          headers: await csrfHeaders(),
          body: form,
        })
        const data = (await response.json().catch(() => null)) as { text?: string; error?: string } | null
        if (!response.ok || !data?.text) throw new Error(data?.error || t("workspace.chat.voice.heardNothing", "No words were heard. Try again."))
        onText(data.text)
      } catch (error) {
        notify(error instanceof Error ? error.message : t("workspace.chat.voice.heardNothing", "No words were heard. Try again."), "error")
      } finally {
        setState("idle")
      }
    }
    next.start()
    setState("recording")
    timer.current = window.setTimeout(() => next.state === "recording" && next.stop(), MAX_RECORDING_MS)
  }

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop()
  }

  const label =
    state === "recording"
      ? t("workspace.chat.voice.dictateStop", "Microphone on · click to stop")
      : state === "transcribing"
        ? t("workspace.chat.voice.dictating", "Turning speech into text…")
        : t("workspace.chat.voice.dictate", "Ask by voice · microphone off")
  return (
    <IconTooltip label={label} className={className}>
      <Button
        type="button"
        variant={state === "recording" ? "destructive" : "ghost"}
        size="icon"
        className={cn("h-6 w-6 p-0", state === "recording" && "animate-pulse")}
        aria-label={label}
        aria-pressed={state === "recording"}
        data-guidance-target="dictate"
        disabled={disabled || state === "transcribing"}
        onClick={() => (state === "recording" ? stop() : void start())}
      >
        {state === "transcribing" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
      </Button>
    </IconTooltip>
  )
}
