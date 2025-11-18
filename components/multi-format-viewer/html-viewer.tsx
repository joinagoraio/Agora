"use client"

import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut } from "lucide-react"

interface HtmlViewerProps {
  className?: string
  hideControls?: boolean
  scale: number
  zoomIn: () => void
  zoomOut: () => void
  sanitizedHtmlContent: string
  documentTitle: string
}

export function HtmlViewer({
  className = "",
  hideControls = false,
  scale,
  zoomIn,
  zoomOut,
  sanitizedHtmlContent,
  documentTitle,
}: HtmlViewerProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {!hideControls && (
        <div className="flex items-center justify-between gap-4 border-b bg-card p-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">HTML Document</span>
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
      <div className="flex-1 overflow-auto bg-white">
        <iframe
          srcDoc={sanitizedHtmlContent}
          className="h-full w-full border-0"
          title={documentTitle}
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
    </div>
  )
}


