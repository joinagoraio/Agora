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
      <div className="flex min-h-0 flex-1 flex-col bg-gray-100 p-4">
        <iframe
          srcDoc={sanitizedHtmlContent}
          className="min-h-0 w-full flex-1 border-0 bg-white shadow-lg"
          title={documentTitle}
          sandbox="allow-same-origin allow-scripts"
        />
      </div>
    </div>
  )
}


