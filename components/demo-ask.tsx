"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Mic, Square, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/use-i18n"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"

type Status = "off" | "connecting" | "ready" | "listening" | "answering"

/** Push-to-talk questions from the room, answered by a live voice that knows this programme. */
export function DemoAskControl({ workspaceId, language, stepTitle }: { workspaceId: string; language: "nl" | "en"; stepTitle: string }) {
  const { t } = useI18n()
  const [status, setStatus] = useState<Status>("off")
  const peer = useRef<RTCPeerConnection | null>(null)
  const channel = useRef<RTCDataChannel | null>(null)
  const mic = useRef<MediaStream | null>(null)
  const speaker = useRef<HTMLAudioElement | null>(null)

  const send = (event: Record<string, unknown>) => {
    if (channel.current?.readyState === "open") channel.current.send(JSON.stringify(event))
  }

  const disconnect = useCallback(() => {
    peer.current?.close()
    mic.current?.getTracks().forEach((track) => track.stop())
    if (speaker.current) speaker.current.srcObject = null
    peer.current = null
    channel.current = null
    mic.current = null
    setStatus("off")
  }, [])

  useEffect(() => disconnect, [disconnect])

  const connect = async () => {
    setStatus("connecting")
    try {
      const token = await fetchCsrfToken()
      const response = await fetch("/api/voice/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { "x-csrf-token": token } : {}) },
        body: JSON.stringify({ workspaceId, language, step: stepTitle }),
      })
      const session = (await response.json().catch(() => null)) as { value?: string; error?: string } | null
      if (!response.ok || !session?.value) throw new Error(session?.error || t("demoTour.askFailed", "The live voice could not start."))

      const connection = new RTCPeerConnection()
      peer.current = connection
      speaker.current ??= new Audio()
      speaker.current.autoplay = true
      connection.ontrack = (event) => {
        if (speaker.current) speaker.current.srcObject = event.streams[0]
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mic.current = stream
      const track = stream.getAudioTracks()[0]
      track.enabled = false
      connection.addTrack(track, stream)

      const events = connection.createDataChannel("oai-events")
      channel.current = events
      events.onopen = () => {
        send({ type: "session.update", session: { type: "realtime", audio: { input: { turn_detection: null } } } })
        setStatus("ready")
      }
      events.onmessage = (message) => {
        const event = JSON.parse(String(message.data)) as { type?: string; error?: { message?: string } }
        if (event.type === "response.done" || event.type === "output_audio_buffer.stopped") setStatus((current) => (current === "answering" ? "ready" : current))
        if (event.type === "error" && event.error?.message) notify(event.error.message, "error")
      }

      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${session.value}`, "Content-Type": "application/sdp" },
      })
      if (!answer.ok) throw new Error(t("demoTour.askFailed", "The live voice could not start."))
      await connection.setRemoteDescription({ type: "answer", sdp: await answer.text() })
    } catch (error) {
      disconnect()
      notify(error instanceof Error ? error.message : t("demoTour.askFailed", "The live voice could not start."), "error")
    }
  }

  const startListening = () => {
    if (status !== "ready" && status !== "answering") return
    if (status === "answering") send({ type: "response.cancel" })
    send({ type: "output_audio_buffer.clear" })
    send({ type: "input_audio_buffer.clear" })
    mic.current?.getAudioTracks().forEach((track) => (track.enabled = true))
    setStatus("listening")
  }

  const stopListening = () => {
    if (status !== "listening") return
    mic.current?.getAudioTracks().forEach((track) => (track.enabled = false))
    send({ type: "input_audio_buffer.commit" })
    send({ type: "response.create" })
    setStatus("answering")
  }

  const stopAnswer = () => {
    send({ type: "response.cancel" })
    send({ type: "output_audio_buffer.clear" })
    setStatus("ready")
  }

  if (status === "off" || status === "connecting") {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={status === "connecting"} onClick={() => void connect()}>
        {status === "connecting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
        {status === "connecting" ? t("demoTour.askConnecting", "Connecting…") : t("demoTour.ask", "Questions")}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant={status === "listening" ? "destructive" : "outline"}
        className={cn("select-none touch-none", status === "listening" && "animate-pulse")}
        onPointerDown={startListening}
        onPointerUp={stopListening}
        onPointerLeave={stopListening}
        onKeyDown={(event) => {
          if (event.key === " " && !event.repeat) {
            event.preventDefault()
            startListening()
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " ") stopListening()
        }}
      >
        <Mic className="h-3.5 w-3.5" />
        {status === "listening"
          ? t("demoTour.askListening", "Listening… release to ask")
          : status === "answering"
            ? t("demoTour.askAnswering", "Answering… hold to ask again")
            : t("demoTour.askHold", "Hold to ask a question")}
      </Button>
      {status === "answering" ? (
        <Button type="button" variant="ghost" size="icon-sm" onClick={stopAnswer} aria-label={t("demoTour.askStop", "Stop the answer")}>
          <Square className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" onClick={disconnect} aria-label={t("demoTour.askOff", "Stop taking questions")}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
