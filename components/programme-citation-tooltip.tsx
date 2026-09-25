"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

type Tip = {
  x: number
  y: number
  title: string
  quote: string
}

function citationTarget(event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest("a.programme-citation, span.programme-citation")
}

export function ProgrammeCitationTooltip() {
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const show = (event: Event) => {
      const link = citationTarget(event)
      if (!link) return
      const rect = link.getBoundingClientRect()
      const title = link.getAttribute("data-citation-title") || ""
      const quote = link.getAttribute("data-citation-quote") || ""
      if (!title && !quote) return
      const width = 320
      const left = Math.min(rect.left, window.innerWidth - width - 12)
      setTip({ x: Math.max(12, left), y: rect.bottom + 8, title, quote })
    }
    const hide = (event: Event) => {
      if (event.type !== "scroll" && !citationTarget(event)) return
      setTip(null)
    }
    document.addEventListener("mouseover", show, true)
    document.addEventListener("mouseout", hide, true)
    document.addEventListener("scroll", hide, true)
    return () => {
      document.removeEventListener("mouseover", show, true)
      document.removeEventListener("mouseout", hide, true)
      document.removeEventListener("scroll", hide, true)
    }
  }, [])

  if (!tip || typeof document === "undefined") return null
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[110] w-80 max-w-[calc(100vw-1.5rem)] rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.title ? <p className="font-medium">{tip.title}</p> : null}
      {tip.quote ? <p className={tip.title ? "mt-1 text-muted-foreground" : ""}>{tip.quote}</p> : null}
    </div>,
    document.body,
  )
}
