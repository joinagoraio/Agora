"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

export function OverflowTitle({
  title,
  className,
  fit = false,
}: {
  title: string
  className?: string
  fit?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLHeadingElement>(null)
  const [overflowPx, setOverflowPx] = useState(0)

  const updateOverflow = useCallback(() => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) {
      setOverflowPx(0)
      return
    }
    setOverflowPx(Math.max(0, text.scrollWidth - container.clientWidth))
  }, [])

  useEffect(() => {
    updateOverflow()
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(container)
    const header = container.closest("header")
    if (header) observer.observe(header)
    window.addEventListener("resize", updateOverflow)
    const timeoutId = window.setTimeout(updateOverflow, 350)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateOverflow)
      window.clearTimeout(timeoutId)
    }
  }, [title, updateOverflow])

  const overflowing = overflowPx > 1
  const durationMs = Math.min(4000, Math.max(700, overflowPx * 16))

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/title min-w-0 max-w-full overflow-hidden",
        overflowing && "hover:[mask-image:none]",
        overflowing && "[mask-image:linear-gradient(to_right,black_88%,transparent)]",
      )}
      style={
        {
          "--title-overflow": `${overflowPx}px`,
          "--title-duration": `${durationMs}ms`,
        } as CSSProperties
      }
    >
      <h1
        ref={textRef}
        className={cn(
          "whitespace-nowrap transition-transform ease-linear",
          overflowing
            ? "w-max cursor-default text-left group-hover/title:-translate-x-[var(--title-overflow)]"
            : fit
              ? "w-max text-left"
              : "w-full text-center",
          className,
        )}
        style={{ transitionDuration: overflowing ? "var(--title-duration)" : "220ms" }}
        aria-label={title}
      >
        {title}
      </h1>
    </div>
  )
}
