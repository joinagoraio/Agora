"use client"

import { RefObject } from "react"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut } from "lucide-react"

interface WordViewerProps {
  className?: string
  hideControls?: boolean
  scale: number
  zoomIn: () => void
  zoomOut: () => void
  fitMode: boolean
  rotation: number
  containerRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  innerContentRef: RefObject<HTMLDivElement | null>
  safeWordContent: string
}

export function WordViewer({
  className = "",
  hideControls = false,
  scale,
  zoomIn,
  zoomOut,
  fitMode,
  rotation,
  containerRef,
  contentRef,
  innerContentRef,
  safeWordContent,
}: WordViewerProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {!hideControls && (
        <div className="flex items-center justify-between gap-4 border-b bg-card p-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Word Document</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3.0}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white" ref={containerRef}>
        <div className="flex min-h-full w-full items-start justify-center" style={{ padding: "2rem" }}>
          <div
            ref={contentRef}
            style={{
              width: "100%",
              maxWidth: fitMode ? "100%" : "56rem",
              overflow: "hidden",
            }}
          >
            <div
              ref={innerContentRef}
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: "top left",
                width: `${100 / scale}%`,
              }}
            >
              <div
                dangerouslySetInnerHTML={{ __html: safeWordContent }}
                className="word-document-content"
                style={{
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  lineHeight: "1.6",
                  color: "#1f2937",
                  width: "100%",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


