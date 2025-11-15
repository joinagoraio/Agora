"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { MultiFormatViewer } from "@/components/multi-format-viewer"
import { ZOOM_PRESETS, type ViewerControls } from "@/components/pdf-viewer"
import { getHighlightCoordinates } from "@/lib/utils/pdf-extraction"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronsLeftRight,
  ChevronDown,
  Highlighter,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface DocumentViewerClientProps {
  workspaceId: string
  documentId: string
  documentTitle: string
  documentUrl: string | null
  pageCount: number | null
  highlights: any[]
  initialPage: number
  documentMetadata?: Record<string, any>
  pages?: any[] // Pass pages data for client-side highlight computation
}

const DOCUMENT_VIEWER_HEADER_HEIGHT = 64

export function DocumentViewerClient({
  workspaceId,
  documentId,
  documentTitle,
  documentUrl,
  pageCount,
  highlights: initialHighlights,
  initialPage,
  documentMetadata,
  pages,
}: DocumentViewerClientProps) {
  const [autoHighlight, setAutoHighlight] = useState(true)
  const [controls, setControls] = useState<ViewerControls | null>(null)
  const searchParams = useSearchParams()
  const [urlHighlights, setUrlHighlights] = useState<any[]>(initialHighlights)
  
  // Function to compute coordinates for highlights that need them (for PDFs)
  const computeHighlightCoordinates = useCallback((highlights: any[]): any[] => {
    if (!pages || pages.length === 0) {
      return highlights
    }
    
    const documentType = documentMetadata?.type || ""
    const isTextDocument = 
      documentType.includes("text") || 
      documentType.includes("markdown") ||
      documentTitle?.toLowerCase().endsWith(".md") ||
      documentTitle?.toLowerCase().endsWith(".txt")
    
    if (isTextDocument) {
      // Text documents don't need coordinates
      return highlights
    }
    
    // For PDFs, compute coordinates for highlights that don't have them
    return highlights.map((highlight) => {
      if (highlight.coordinates || !highlight.textSpan) {
        return highlight
      }
      
      const pageData = pages.find((p: any) => p.page_number === highlight.pageNumber)
      if (pageData) {
        const coordinates = getHighlightCoordinates(
          highlight.textSpan,
          pageData.text_items || [],
          pageData.character_offsets || {},
        )
        return {
          ...highlight,
          coordinates,
        }
      }
      
      return highlight
    })
  }, [pages, documentMetadata, documentTitle])
  
  // Check sessionStorage for highlights on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedHighlights = sessionStorage.getItem(`highlights-${documentId}`)
      if (storedHighlights) {
        try {
          const parsed = JSON.parse(storedHighlights)
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log("[DocumentViewerClient] Found highlights in sessionStorage:", parsed)
            // Compute coordinates for PDF highlights
            const processedHighlights = computeHighlightCoordinates(parsed)
            setUrlHighlights(processedHighlights)
            // Clear sessionStorage after reading
            sessionStorage.removeItem(`highlights-${documentId}`)
          }
        } catch (error) {
          console.error("[DocumentViewerClient] Error parsing stored highlights:", error)
        }
      }
    }
  }, [documentId, computeHighlightCoordinates])
  
  // Function to compute highlights from URL params
  const computeHighlightsFromUrl = useCallback((forceFromWindow = false) => {
    let highlightParam: string | null
    let textSpanParam: string | null
    let pageParam: string | null
    
    if (forceFromWindow && typeof window !== "undefined") {
      // Read directly from window.location when forceFromWindow is true
      // This is needed when URL changes via window.history.replaceState()
      const urlParams = new URLSearchParams(window.location.search)
      highlightParam = urlParams.get("highlight")
      textSpanParam = urlParams.get("textSpan")
      pageParam = urlParams.get("page")
    } else {
      // Use Next.js searchParams hook (updates on router navigation)
      highlightParam = searchParams.get("highlight")
      textSpanParam = searchParams.get("textSpan")
      pageParam = searchParams.get("page")
    }
    
    // If no highlight params in URL, use initial highlights from server
    if (!highlightParam || !textSpanParam) {
      return initialHighlights
    }
    
    try {
      const [start, end] = textSpanParam.split("-").map(Number)
      const textSpan = { start, end }
      const highlightPage = pageParam ? parseInt(pageParam) : 1
      
      // Check if document is text/markdown
      const documentType = documentMetadata?.type || ""
      const isTextDocument = 
        documentType.includes("text") || 
        documentType.includes("markdown") ||
        documentTitle?.toLowerCase().endsWith(".md") ||
        documentTitle?.toLowerCase().endsWith(".txt")
      
      if (isTextDocument) {
        // For text documents, simple highlight
        return [{
          id: highlightParam,
          pageNumber: highlightPage,
          textSpan,
          color: "rgba(255, 255, 0, 0.3)",
        }]
      } else if (pages && pages.length > 0) {
        // For PDFs, compute coordinates
        const pageData = pages.find((p: any) => p.page_number === highlightPage)
        if (pageData) {
          const coordinates = getHighlightCoordinates(
            textSpan,
            pageData.text_items || [],
            pageData.character_offsets || {},
          )
          return [{
            id: highlightParam,
            pageNumber: highlightPage,
            textSpan,
            coordinates,
            color: "rgba(255, 255, 0, 0.3)",
          }]
        }
      }
    } catch (error) {
      console.error("[DocumentViewerClient] Error parsing highlight from URL:", error)
    }
    
    return initialHighlights
  }, [searchParams, initialHighlights, pages, documentMetadata, documentTitle])
  
  // Watch for URL changes and compute highlights dynamically
  const highlights = useMemo(() => {
    return computeHighlightsFromUrl()
  }, [computeHighlightsFromUrl])
  
  // Listen for highlightUpdated custom event (from window.history.replaceState)
  useEffect(() => {
    const handleHighlightUpdate = (event: any) => {
      // Check if event has highlights array in detail (multiple highlights)
      if (event.detail?.highlights && Array.isArray(event.detail.highlights)) {
        console.log("[DocumentViewerClient] Received multiple highlights from event:", event.detail.highlights)
        // Compute coordinates for PDF highlights
        const processedHighlights = computeHighlightCoordinates(event.detail.highlights)
        setUrlHighlights(processedHighlights)
        
        // If scrollTo is requested, trigger scrolling after a short delay to allow coordinates to be computed
        if (event.detail?.scrollTo && processedHighlights.length > 0) {
          const firstHighlight = processedHighlights[0]
          const pageNumber = firstHighlight.pageNumber || 1
          
          console.log("[DocumentViewerClient] Triggering scroll for highlight:", { firstHighlight, pageNumber })
          
          // Navigate to the page first
          if (controls && controls.goToPage) {
            controls.goToPage(pageNumber)
          }
          
          // Then scroll to the highlight - use processed highlight with coordinates
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("scrollToHighlight", {
              detail: { highlight: firstHighlight, pageNumber },
            }))
          }, 300)
        }
      } else {
        // Fallback to URL-based highlighting (single highlight)
        const newHighlights = computeHighlightsFromUrl(true)
        setUrlHighlights(newHighlights)
      }
    }
    
    window.addEventListener("highlightUpdated", handleHighlightUpdate as EventListener)
    return () => window.removeEventListener("highlightUpdated", handleHighlightUpdate as EventListener)
  }, [computeHighlightsFromUrl, computeHighlightCoordinates, controls])
  
  // Also watch for popstate events (back/forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      // Read directly from window.location for popstate events too
      const newHighlights = computeHighlightsFromUrl(true)
      setUrlHighlights(newHighlights)
    }
    
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [computeHighlightsFromUrl])

  // Listen for scrollToHighlight event to scroll to a specific highlight
  useEffect(() => {
    const handleScrollToHighlight = (event: any) => {
      const { highlight, pageNumber } = event.detail || {}
      if (!highlight || !pageNumber) return

      console.log("[DocumentViewerClient] ScrollToHighlight event received:", { highlight, pageNumber })

      // If we have controls, navigate to the page first
      if (controls && controls.goToPage) {
        controls.goToPage(pageNumber)
      }

      // For text documents, the MultiFormatViewer will handle scrolling automatically
      // For PDFs, we need to wait a bit for the page to render, then scroll
      // The PDF viewer should handle scrolling when the page is set
      setTimeout(() => {
        // Dispatch a scroll event that the PDF viewer can listen to
        window.dispatchEvent(new CustomEvent("scrollToPage", {
          detail: { pageNumber, highlight },
        }))
      }, 300)
    }

    window.addEventListener("scrollToHighlight", handleScrollToHighlight as EventListener)
    return () => window.removeEventListener("scrollToHighlight", handleScrollToHighlight as EventListener)
  }, [controls])

  // Check sessionStorage for scroll instruction on mount (when navigating from another page)
  useEffect(() => {
    if (typeof window === "undefined" || !documentId) return

    const scrollData = sessionStorage.getItem(`scrollToHighlight-${documentId}`)
    if (scrollData) {
      try {
        const { highlight, pageNumber } = JSON.parse(scrollData)
        // Clear the stored instruction
        sessionStorage.removeItem(`scrollToHighlight-${documentId}`)
        
        // Wait for controls to be ready, then scroll
        if (controls && controls.goToPage) {
          controls.goToPage(pageNumber)
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("scrollToPage", {
              detail: { pageNumber, highlight },
            }))
          }, 300)
        } else {
          // If controls aren't ready yet, wait a bit and try again
          const timer = setTimeout(() => {
            if (controls && controls.goToPage) {
              controls.goToPage(pageNumber)
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("scrollToPage", {
                  detail: { pageNumber, highlight },
                }))
              }, 300)
            }
          }, 500)
          return () => clearTimeout(timer)
        }
      } catch (error) {
        console.error("[DocumentViewerClient] Error parsing scroll instruction:", error)
      }
    }
  }, [controls, documentId])
  
  // Use highlights computed from useMemo (reacts to searchParams changes)
  // urlHighlights is updated via events for window.history.replaceState() changes
  // Prefer urlHighlights if it's been set (not equal to initial), otherwise use highlights
  const hasUrlHighlights = urlHighlights.length > 0 && 
    JSON.stringify(urlHighlights) !== JSON.stringify(initialHighlights)
  // Only show highlights if auto-highlight is enabled
  const finalHighlights = autoHighlight ? (hasUrlHighlights ? urlHighlights : highlights) : []

  console.log("[DocumentViewerClient] Computed highlights:", {
    highlightsCount: finalHighlights.length,
    highlights: finalHighlights,
    urlParams: {
      highlight: searchParams.get("highlight"),
      textSpan: searchParams.get("textSpan"),
      page: searchParams.get("page"),
    },
  })

  return (
    <TooltipProvider>
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4 flex-1">
            <Link href={`/workspaces/${workspaceId}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-3 w-3" />
                <span className="text-xs">Back to Workspace</span>
              </Button>
            </Link>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <h1 className="text-sm font-normal">{documentTitle}</h1>
            {pageCount !== null && pageCount > 0 && (
              <p className="text-xs text-muted-foreground">{pageCount} pages</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            {controls && (
              <>
                <span className="text-sm text-muted-foreground">
                  {controls.pageNumber} of {controls.numPages || "?"}
                </span>
                <div className="h-6 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={controls.zoomOut}
                  disabled={controls.scale <= (controls.minScale ?? 0.5)}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 px-2">
                      <span>{Math.round(controls.scale * 100)}%</span>
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-fit min-w-0">
                    {ZOOM_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset}
                        onSelect={() => controls.setScale?.(preset)}
                        disabled={!controls.setScale}
                      >
                        {Math.round(preset * 100)}%
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={controls.zoomIn}
                  disabled={controls.scale >= (controls.maxScale ?? 3.0)}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                {controls.fitToWidth && (
                  <>
                    <div className="h-6 w-px bg-border" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={controls.fitMode === "width" ? "secondary" : "ghost"}
                          size="sm"
                          onClick={controls.fitToWidth}
                        >
                          <ChevronsLeftRight className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{controls.fitMode === "width" ? "Disable fit to width" : "Fit to width"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                <div className="h-6 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={autoHighlight ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setAutoHighlight(!autoHighlight)}
                    >
                      <Highlighter className={cn(
                        "h-4 w-4",
                        autoHighlight && "text-primary"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{autoHighlight ? "Hide highlights" : "Show highlights"}</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
            {documentUrl && (
              <>
                <div className="h-6 w-px bg-border" />
                <Tooltip>
                  <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild>
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download</p>
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Multi-Format Document Viewer */}
      <div className="flex-1 overflow-hidden">
        {documentUrl ? (
          <MultiFormatViewer
            url={`/api/documents/${documentId}/pdf`}
            documentId={documentId}
            documentTitle={documentTitle}
            highlights={finalHighlights}
            initialPage={initialPage}
            className="h-full"
            hideControls={true}
            documentMetadata={documentMetadata}
            viewportOffset={DOCUMENT_VIEWER_HEADER_HEIGHT}
            onControlsReady={setControls}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Document URL not available</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </TooltipProvider>
  )
}
