"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ErrorBoundary } from "@/components/error-boundary"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  ChevronsLeftRight,
  ChevronsUpDown,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ZOOM_PRESETS,
  type Highlight,
  type ViewerControls,
  type ViewerFitMode,
} from "@/components/pdf-viewer-types"

export type { Highlight, ViewerControls, ViewerFitMode }
export { ZOOM_PRESETS }

// Import react-pdf CSS for TextLayer and AnnotationLayer
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

// Configure PDF.js worker - must be set before any PDF.js operations
// Use the worker file from the public folder (served at /pdf.worker.min.mjs)
// Set it immediately and also in useEffect to ensure it's set on client
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`
}

const MIN_SCALE = 0.5
const MAX_SCALE = 5.0

interface PDFViewerProps {
  url: string
  documentId: string
  highlights?: Highlight[]
  onPageChange?: (page: number) => void
  initialPage?: number
  className?: string
  hideControls?: boolean
  viewportOffset?: number
  onControlsReady?: (controls: ViewerControls) => void
  hoveredHighlightId?: string | null
}

export function PDFViewer({
  url,
  documentId,
  highlights = [],
  onPageChange,
  initialPage = 1,
  className = "",
  hideControls = false,
  onControlsReady,
  viewportOffset = 0,
  hoveredHighlightId = null,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [documentReady, setDocumentReady] = useState(false)
  const [pageNumber, setPageNumber] = useState(initialPage)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [fitMode, setFitMode] = useState<ViewerFitMode | null>(null)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const pageNumberRef = useRef(pageNumber)
  const pageDimensionsRef = useRef<{ width: number; height: number } | null>(null)
  const fitModeRef = useRef<ViewerFitMode | null>(null)
  const scaleRef = useRef(scale)
  const scaleBeforeFitRef = useRef(1.0)

  fitModeRef.current = fitMode
  scaleRef.current = scale

  // Ensure PDF.js worker is configured on mount
  useEffect(() => {
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`
    }
  }, [])

  const clampScale = useCallback((value: number) => {
    return Math.min(Math.max(value, MIN_SCALE), MAX_SCALE)
  }, [])

  const setScaleValue = useCallback(
    (value: number) => {
      setFitMode(null)
      setScale(clampScale(value))
    },
    [clampScale]
  )

  // Fetch PDF with credentials if it's our API route
  useEffect(() => {
    if (url.includes("/api/documents/")) {
      setLoading(true)
      setError(null)
      setDocumentReady(false)
      setNumPages(null)
      
      fetch(url, {
        credentials: "include",
        headers: {
          "Accept": "application/pdf",
        },
      })
        .then(async (response) => {
          if (!response.ok) {
            const text = await response.text()
            try {
              const errorData = JSON.parse(text)
              throw new Error(errorData.error || `Failed to fetch PDF: ${response.status} ${response.statusText}`)
            } catch {
              throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
            }
          }
          
          // Check content type to ensure it's a PDF
          const contentType = response.headers.get("content-type")
          if (contentType && !contentType.includes("application/pdf")) {
            throw new Error(`Invalid content type: ${contentType}. Expected application/pdf.`)
          }
          
          return response.blob()
        })
        .then(async (blob) => {
          if (!(blob instanceof Blob)) {
            throw new Error("Invalid response format")
          }
          
          // Verify it's actually a PDF by checking the first bytes
          // Clone the blob first so we don't consume it
          const headerBlob = blob.slice(0, 4)
          const arrayBuffer = await headerBlob.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          const pdfHeader = String.fromCharCode(...bytes)
          
          // PDF files start with "%PDF"
          if (pdfHeader !== "%PDF") {
            // Try to read as text to see if it's an error message
            const textBlob = blob.slice(0, 100) // Only read first 100 bytes for error checking
            const text = await textBlob.text()
            try {
              const errorData = JSON.parse(text)
              throw new Error(errorData.error || "Invalid PDF file")
            } catch {
              throw new Error("Invalid PDF file: File does not appear to be a valid PDF")
            }
          }
          
          setPdfBlob(blob)
          setLoading(false)
        })
        .catch((err) => {
          console.error("Error fetching PDF:", err)
          setError(err instanceof Error ? err.message : "Failed to fetch PDF")
          setLoading(false)
        })
    } else {
      // For non-API URLs, set loading to false so PDF.js can handle it
      setLoading(false)
    }
  }, [url])

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
    // Add a small delay to ensure document is fully ready
    setTimeout(() => {
      setDocumentReady(true)
    }, 100)
  }

  function onDocumentLoadError(error: Error) {
    console.error("PDF load error:", error)
    
    // Provide more helpful error messages
    let errorMessage = "Failed to load PDF"
    if (error.message.includes("Invalid PDF")) {
      errorMessage = "The file is not a valid PDF or may be corrupted. The URL might point to an HTML page instead of a PDF file."
    } else if (error.message.includes("network") || error.message.includes("fetch")) {
      errorMessage = "Failed to fetch PDF. The file may not be accessible or requires authentication."
    } else {
      errorMessage = `Failed to load PDF: ${error.message}`
    }
    
    setError(errorMessage)
    setLoading(false)
    setDocumentReady(false)
  }

  function changePage(offset: number) {
    setPageNumber((prev) => {
      const newPage = prev + offset
      if (newPage < 1) return prev
      if (numPages && newPage > numPages) return prev
      
      // Scroll to the new page
      setTimeout(() => {
        const pageEl = pageRefs.current.get(newPage)
        if (pageEl && scrollContainerRef.current) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 0)
      
      return newPage
    })
  }

  function goToPage(page: number) {
    if (page < 1) return
    if (numPages && page > numPages) return
    setPageNumber(page)
    
    // Scroll to the page element
    setTimeout(() => {
      const pageEl = pageRefs.current.get(page)
      if (pageEl && scrollContainerRef.current) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 100)
  }

  // Listen for scrollToPage event to scroll to a specific highlight
  useEffect(() => {
    const handleScrollToPage = (event: any) => {
      const { pageNumber: targetPage, highlight } = event.detail || {}
      if (!targetPage) return

      console.log("[PDFViewer] ScrollToPage event received:", { targetPage, highlight })

      // Navigate to the page first
      if (targetPage >= 1 && (!numPages || targetPage <= numPages)) {
        setPageNumber(targetPage)
      }

      // Scroll to the page, and if there's a highlight with coordinates, scroll to it
      // Use a longer delay to ensure the page is fully rendered
      setTimeout(() => {
        const pageEl = pageRefs.current.get(targetPage)
        if (pageEl && scrollContainerRef.current) {
          // If we have a highlight with coordinates, try to scroll to that specific position
          if (highlight?.coordinates && highlight.coordinates.y !== undefined) {
            const { y } = highlight.coordinates
            const container = scrollContainerRef.current
            const pageTop = pageEl.offsetTop
            // Calculate the scroll position: page top + highlight y position (scaled) - some offset for visibility
            const scrollPosition = pageTop + (y * scale) - 100 // 100px offset from top for better visibility
            console.log("[PDFViewer] Scrolling to highlight with coordinates:", { scrollPosition, pageTop, y, scale })
            container.scrollTo({
              top: Math.max(0, scrollPosition),
              behavior: "smooth",
            })
          } else {
            // No specific coordinates, just scroll to the page
            console.log("[PDFViewer] Scrolling to page (no coordinates):", targetPage)
            pageEl.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        } else {
          console.warn("[PDFViewer] Page element not found or container not ready:", { targetPage, hasPageEl: !!pageEl, hasContainer: !!scrollContainerRef.current })
        }
      }, 500) // Wait longer for the page to render
    }

    window.addEventListener("scrollToPage", handleScrollToPage as EventListener)
    return () => window.removeEventListener("scrollToPage", handleScrollToPage as EventListener)
  }, [numPages, scale])

  const zoomIn = useCallback(() => {
    setFitMode(null)
    setScale((prev) => clampScale(prev + 0.25))
  }, [clampScale])

  const zoomOut = useCallback(() => {
    setFitMode(null)
    setScale((prev) => clampScale(prev - 0.25))
  }, [clampScale])

  const rotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360)
  }, [])

  useEffect(() => {
    pageNumberRef.current = pageNumber
  }, [pageNumber])

  // Track visible page on scroll
  useEffect(() => {
    if (!scrollContainerRef.current || !numPages) return

    const container = scrollContainerRef.current
    
    const handleScroll = () => {
      // Wait a bit for pages to be rendered
      if (pageRefs.current.size === 0) return
      
      // Find which page is at the top of the viewport
      // The current page is the one whose top is at or just above the viewport top,
      // adjusted by any external header offset
      const viewportTop = container.scrollTop + viewportOffset
      
      const currentPageNumber = pageNumberRef.current

      let visiblePage = currentPageNumber
      let bestPage = currentPageNumber
      let bestPageTop = -Infinity

      // Find the page whose top is closest to but not below the viewport top
      pageRefs.current.forEach((pageEl, pageNum) => {
        if (!pageEl) return
        
        const pageTop = pageEl.offsetTop
        const pageBottom = pageTop + pageEl.offsetHeight
        
        // If this page contains the viewport top, it's definitely the current page
        if (pageTop <= viewportTop && pageBottom > viewportTop) {
          visiblePage = pageNum
          bestPage = pageNum
          bestPageTop = pageTop
        } else if (pageTop <= viewportTop && pageTop > bestPageTop) {
          // Otherwise, find the page with the highest top that's still above the viewport top
          bestPage = pageNum
          bestPageTop = pageTop
        }
      })

      // Use the best page found
      if (bestPage > 0) {
        visiblePage = bestPage
      }

      if (visiblePage !== currentPageNumber && visiblePage > 0) {
        setPageNumber(visiblePage)
        if (onPageChange) {
          onPageChange(visiblePage)
        }
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true })
    
    // Also check on initial load and after a short delay to ensure pages are rendered
    setTimeout(() => {
      handleScroll()
    }, 100)

    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [numPages, viewportOffset])

  const updateContainerSize = useCallback(() => {
    if (!scrollContainerRef.current) return
    const node = scrollContainerRef.current
    const styles = window.getComputedStyle(node)
    const paddingX =
      (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
    const paddingY =
      (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
    setContainerSize({
      width: node.clientWidth - paddingX,
      height: node.clientHeight - paddingY,
    })
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    updateContainerSize()

    const resizeObserver = new ResizeObserver(() => {
      updateContainerSize()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [updateContainerSize])

  const applyFit = useCallback(
    (mode: ViewerFitMode) => {
      const dims = pageDimensionsRef.current
      if (!dims) return

      let { width, height } = dims
      if (rotation % 180 !== 0) {
        const swapped = width
        width = height
        height = swapped
      }

      if (mode === "width") {
        if (containerSize.width <= 0) return
        setScale(clampScale(containerSize.width / width))
      } else {
        if (containerSize.height <= 0) return
        setScale(clampScale(containerSize.height / height))
      }
    },
    [clampScale, containerSize.height, containerSize.width, rotation]
  )

  const fitToWidth = useCallback(() => {
    if (fitModeRef.current === "width") {
      setFitMode(null)
      setScale(clampScale(scaleBeforeFitRef.current))
      return
    }
    if (fitModeRef.current == null) {
      scaleBeforeFitRef.current = scaleRef.current
    }
    setFitMode("width")
    applyFit("width")
  }, [applyFit, clampScale])

  const fitToHeight = useCallback(() => {
    if (fitModeRef.current === "height") {
      setFitMode(null)
      setScale(clampScale(scaleBeforeFitRef.current))
      return
    }
    if (fitModeRef.current == null) {
      scaleBeforeFitRef.current = scaleRef.current
    }
    setFitMode("height")
    applyFit("height")
  }, [applyFit, clampScale])

  useEffect(() => {
    if (fitMode) {
      applyFit(fitMode)
    }
  }, [fitMode, applyFit])

  const handlePageLoadSuccess = useCallback(
    (page: pdfjs.PDFPageProxy) => {
      const width = (page as any).originalWidth ?? page.getViewport({ scale: 1 }).width
      const height = (page as any).originalHeight ?? page.getViewport({ scale: 1 }).height
      pageDimensionsRef.current = { width, height }
      if (fitMode) {
        applyFit(fitMode)
      }
    },
    [applyFit, fitMode]
  )

  const getMinScale = useCallback(() => MIN_SCALE, [])
  const getMaxScale = useCallback(() => MAX_SCALE, [])

  // Expose controls to parent if callback provided
  useEffect(() => {
    if (onControlsReady) {
      onControlsReady({
        pageNumber,
        numPages,
        scale,
        minScale: getMinScale(),
        maxScale: getMaxScale(),
        fitMode,
        changePage,
        goToPage,
        zoomIn,
        zoomOut,
        rotate,
        fitToWidth,
        fitToHeight,
        setScale: setScaleValue,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, numPages, scale, fitMode, fitToWidth, fitToHeight])

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Controls */}
      {!hideControls && (
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
          <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 px-2">
                {fitMode === "width" ? (
                  <span className="flex items-center gap-2">
                    Fit
                    <ChevronsLeftRight className="h-4 w-4" />
                  </span>
                ) : fitMode === "height" ? (
                  <span className="flex items-center gap-2">
                    Fit
                    <ChevronsUpDown className="h-4 w-4" />
                  </span>
                ) : (
                  <span>{Math.round(scale * 100)}%</span>
                )}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-0">
              {ZOOM_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset} onSelect={() => setScaleValue(preset)}>
                  {Math.round(preset * 100)}%
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={fitToWidth}>
                <span className="flex items-center gap-2">
                  Fit
                  <ChevronsLeftRight className="h-4 w-4" />
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={fitToHeight}>
                <span className="flex items-center gap-2">
                  Fit
                  <ChevronsUpDown className="h-4 w-4" />
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={rotate}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}

      {/* PDF Viewer */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-gray-100 p-4">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <p className="text-destructive font-medium">{error}</p>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  This might happen if:
                </p>
                <ul className="text-sm text-muted-foreground text-left list-disc list-inside space-y-1">
                  <li>The URL points to an HTML page instead of a PDF</li>
                  <li>The PDF file is corrupted or invalid</li>
                  <li>The file requires authentication to access</li>
                  <li>There are CORS restrictions preventing access</li>
                </ul>
                {url && (
                  <div className="pt-4 flex gap-2 justify-center">
                    <Button variant="outline" asChild>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in new tab
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            {url.includes("/api/documents/") && !pdfBlob ? (
              <div className="flex h-[800px] items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground">Loading PDF...</p>
                </div>
              </div>
            ) : (
              <Document
                file={url.includes("/api/documents/") && pdfBlob ? pdfBlob : url}
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
              {numPages && documentReady ? (
                <div className="flex flex-col items-center gap-4">
                  {Array.from(new Array(numPages), (el, index) => {
                    const pageNum = index + 1
                    return (
                      <div
                        key={`page_${pageNum}`}
                        ref={(el) => {
                          if (el) {
                            pageRefs.current.set(pageNum, el)
                          } else {
                            pageRefs.current.delete(pageNum)
                          }
                        }}
                        data-page-number={pageNum}
                        className="relative"
                      >
                        <Page
                          pageNumber={pageNum}
                          scale={scale}
                          rotate={rotation}
                          onLoadSuccess={handlePageLoadSuccess}
                          onLoadError={(error) => {
                            console.error(`Error loading page ${pageNum}:`, error)
                          }}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                          className="shadow-lg"
                        />
                        {/* Highlight Overlay */}
                        {highlights
                          .filter((h) => h.pageNumber === pageNum)
                          .map((highlight, highlightIndex) => (
                            <PDFHighlightOverlay
                              key={`${highlight.id || "highlight"}-${pageNum}-${highlightIndex}`}
                              highlights={[highlight]}
                              scale={scale}
                              rotation={rotation}
                              hoveredHighlightId={hoveredHighlightId}
                            />
                          ))}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </Document>
            )}
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
  hoveredHighlightId?: string | null
}

function PDFHighlightOverlay({ highlights, scale, rotation, hoveredHighlightId }: PDFHighlightOverlayProps) {
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
        const isHovered = hoveredHighlightId && highlight.id && highlight.id === hoveredHighlightId

        return (
          <rect
            key={highlight.id}
            x={x * scale}
            y={y * scale}
            width={width * scale}
            height={height * scale}
            fill={isHovered ? "rgba(251, 191, 36, 0.65)" : color}
            stroke={isHovered ? "rgba(251, 191, 36, 0.9)" : "rgba(255, 200, 0, 0.6)"}
            strokeWidth={isHovered ? 2 : 1}
          />
        )
      })}
    </svg>
  )
}
