"use client"

import { useState, useEffect } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from "lucide-react"
import "react-pdf/dist/esm/Page/AnnotationLayer.css"
import "react-pdf/dist/esm/Page/TextLayer.css"

// Configure PDF.js worker
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
}

export interface Highlight {
  id: string
  pageNumber: number
  textSpan: { start: number; end: number }
  coordinates?: { x: number; y: number; width: number; height: number }
  color?: string
}

interface PDFViewerProps {
  url: string
  documentId: string
  highlights?: Highlight[]
  onPageChange?: (page: number) => void
  initialPage?: number
  className?: string
}

export function PDFViewer({
  url,
  documentId,
  highlights = [],
  onPageChange,
  initialPage = 1,
  className = "",
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(initialPage)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPageNumber(initialPage)
  }, [initialPage])

  useEffect(() => {
    if (onPageChange) {
      onPageChange(pageNumber)
    }
  }, [pageNumber, onPageChange])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
  }

  function onDocumentLoadError(error: Error) {
    console.error("PDF load error:", error)
    setError(`Failed to load PDF: ${error.message}`)
    setLoading(false)
  }

  function changePage(offset: number) {
    setPageNumber((prev) => {
      const newPage = prev + offset
      if (newPage < 1) return 1
      if (numPages && newPage > numPages) return numPages
      return newPage
    })
  }

  function goToPage(page: number) {
    if (page < 1) return
    if (numPages && page > numPages) return
    setPageNumber(page)
  }

  function zoomIn() {
    setScale((prev) => Math.min(prev + 0.25, 3.0))
  }

  function zoomOut() {
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  function rotate() {
    setRotation((prev) => (prev + 90) % 360)
  }

  // Get highlights for current page
  const pageHighlights = highlights.filter((h) => h.pageNumber === pageNumber)

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 border-b bg-card p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePage(-1)}
            disabled={pageNumber <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={numPages || 1}
              value={pageNumber}
              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
              className="w-16 text-center"
            />
            <span className="text-sm text-muted-foreground">of {numPages || "?"}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePage(1)}
            disabled={!numPages || pageNumber >= numPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3.0}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={rotate}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-destructive">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex h-[800px] items-center justify-center">
                  <div className="text-center">
                    <p className="text-muted-foreground">Loading PDF...</p>
                  </div>
                </div>
              }
            >
              <div className="relative">
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                />
                {/* Highlight Overlay */}
                {pageHighlights.length > 0 && (
                  <PDFHighlightOverlay
                    highlights={pageHighlights}
                    scale={scale}
                    rotation={rotation}
                  />
                )}
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  )
}

interface PDFHighlightOverlayProps {
  highlights: Highlight[]
  scale: number
  rotation: number
}

function PDFHighlightOverlay({ highlights, scale, rotation }: PDFHighlightOverlayProps) {
  return (
    <svg
      className="absolute left-0 top-0 pointer-events-none"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      {highlights.map((highlight) => {
        if (!highlight.coordinates) return null

        const { x, y, width, height } = highlight.coordinates
        const color = highlight.color || "rgba(255, 255, 0, 0.3)"

        return (
          <rect
            key={highlight.id}
            x={x * scale}
            y={y * scale}
            width={width * scale}
            height={height * scale}
            fill={color}
            stroke="rgba(255, 200, 0, 0.6)"
            strokeWidth={1}
          />
        )
      })}
    </svg>
  )
}

