"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { MultiFormatViewer } from "@/components/multi-format-viewer"
import { useHighlightContext } from "@/lib/contexts/highlight-context"
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
  ChevronUp,
  ChevronDown as ChevronDownIcon,
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
  const highlightContext = useHighlightContext()
  const { 
    highlights: highlightsMap,
    getHighlightsForDocument, 
    autoHighlight, 
    setAutoHighlight, 
    setActiveDocument 
  } = highlightContext
  
  const [controls, setControls] = useState<ViewerControls | null>(null)
  const searchParams = useSearchParams()
  
  // Check if there's an active conversation - only show highlights if there is one
  const conversationId = searchParams.get("conversationId")
  
  // Set active document when component mounts
  useEffect(() => {
    setActiveDocument(documentId)
    
    // Initialize context with server-side highlights if provided and context is empty
    if (initialHighlights && initialHighlights.length > 0) {
      const currentHighlights = getHighlightsForDocument(documentId)
      if (currentHighlights.length === 0) {
        // Convert initial highlights to context format
        const contextHighlights = initialHighlights.map((h: any) => ({
          id: h.id || `highlight-${documentId}-${h.pageNumber || 1}-${Date.now()}`,
          documentId,
          textSpan: h.textSpan,
          pageNumber: h.pageNumber || 1,
          quote: "",
          source: 'url' as const,
          color: h.color || "rgba(255, 255, 0, 0.3)",
          coordinates: h.coordinates,
        }))
        highlightContext.setHighlights(documentId, contextHighlights)
      }
    }
    
    return () => {
      // Optionally clear highlights when leaving document
      // For now, we'll keep them so they persist when navigating back
    }
  }, [documentId, setActiveDocument, initialHighlights, getHighlightsForDocument, highlightContext])

  const viewerMetadata = useMemo(() => {
    const metadata = documentMetadata ? { ...documentMetadata } : {}
    const existingType = typeof metadata.type === "string" ? metadata.type.toLowerCase() : ""
    const origin = typeof metadata.origin === "string" ? metadata.origin.toLowerCase() : undefined

    if (!existingType) {
      if (!documentUrl) {
        metadata.type = "text/plain"
      } else if (origin === "workspace_generated") {
        metadata.type = "text/markdown"
      } else if (origin === "space_scope") {
        metadata.type = "text/plain"
      }
    }

    return metadata
  }, [documentMetadata, documentUrl])

  const isTextDocument = useMemo(() => {
    const metadataType = typeof viewerMetadata?.type === "string" ? viewerMetadata.type.toLowerCase() : ""
    return (
      metadataType.includes("text") ||
      metadataType.includes("markdown") ||
      documentTitle?.toLowerCase().endsWith(".md") ||
      documentTitle?.toLowerCase().endsWith(".txt") ||
      documentTitle?.toLowerCase().endsWith(".docx") ||
      documentTitle?.toLowerCase().endsWith(".doc")
    )
  }, [viewerMetadata, documentTitle])

  const viewerUrl = useMemo(() => {
    // Text/markdown documents are rendered via text endpoint regardless of source URL
    if (isTextDocument) {
      return `/api/documents/${documentId}/text-content`
    }

    // Always fall back to our proxy route if we don't have a source URL
    if (!documentUrl) {
      return `/api/documents/${documentId}/pdf`
    }

    // Already pointing to our API - no changes needed
    if (documentUrl.startsWith("/api/")) {
      return documentUrl
    }

    // During SSR we can't inspect window. Return original URL for now and
    // let the client-side render recompute immediately after hydration.
    if (typeof window === "undefined") {
      return documentUrl
    }

    try {
      const parsedUrl = new URL(documentUrl, window.location.origin)
      const sameOrigin = parsedUrl.origin === window.location.origin
      const allowedHostSuffixes = [
        ".supabase.co",
        ".supabase.in",
        ".vercel.live",
      ]
      const isAllowedHost = allowedHostSuffixes.some((suffix) =>
        parsedUrl.hostname.endsWith(suffix)
      )

      if (sameOrigin || isAllowedHost) {
        return documentUrl
      }
    } catch (error) {
      console.warn("[DocumentViewerClient] Failed to parse document URL, using proxy route instead", {
        documentId,
        documentUrl,
        error,
      })
    }

    return `/api/documents/${documentId}/pdf`
  }, [documentUrl, documentId, isTextDocument])

  const canRenderDocument = Boolean(viewerUrl)
  
  // Function to compute coordinates for highlights that need them (for PDFs)
  const computeHighlightCoordinates = useCallback((highlights: any[]): any[] => {
    if (!pages || pages.length === 0) {
      return highlights
    }
    
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
  }, [pages, isTextDocument])
  
  // Get highlights from context (reactive - will update when highlightsMap changes)
  const contextHighlights = useMemo(() => {
    return getHighlightsForDocument(documentId)
  }, [getHighlightsForDocument, documentId, highlightsMap])
  
  // Determine which highlights to show based on context and auto-highlight toggle
  const hasActiveConversation = !!conversationId
  
  // Filter highlights based on source and auto-highlight state
  const highlightsToUse = useMemo(() => {
    if (!hasActiveConversation && contextHighlights.length === 0) {
      return [] // No conversation and no highlights
    }
    
    if (autoHighlight) {
      // Auto-highlight ON: show all highlights from context
      return contextHighlights
    } else {
      // Auto-highlight OFF: only show highlights from user clicks (not AI responses)
      return contextHighlights.filter(h => h.source === 'user_click')
    }
  }, [contextHighlights, autoHighlight, hasActiveConversation])
  
  // Compute coordinates for PDF highlights
  const finalHighlights = useMemo(() => {
    return computeHighlightCoordinates(highlightsToUse)
  }, [highlightsToUse, computeHighlightCoordinates])
  
  // Track current highlight index for navigation
  const [currentHighlightIndex, setCurrentHighlightIndex] = useState<number | null>(null)
  
  // Initialize current highlight index when highlights change
  useEffect(() => {
    if (finalHighlights.length > 0 && currentHighlightIndex === null) {
      setCurrentHighlightIndex(0)
    } else if (finalHighlights.length === 0) {
      setCurrentHighlightIndex(null)
    }
  }, [finalHighlights.length, currentHighlightIndex])
          
  // Navigation functions
  const navigateToHighlight = useCallback((index: number) => {
    if (index < 0 || index >= finalHighlights.length) return
    setCurrentHighlightIndex(index)
    
    const highlight = finalHighlights[index]
    if (controls && controls.goToPage && highlight.pageNumber) {
      controls.goToPage(highlight.pageNumber)
      }

    // Dispatch scroll event for text documents
      setTimeout(() => {
      window.dispatchEvent(new CustomEvent("scrollToHighlight", {
        detail: { highlight, pageNumber: highlight.pageNumber },
        }))
      }, 300)
  }, [finalHighlights, controls])
  
  const navigateToNextHighlight = useCallback(() => {
    if (currentHighlightIndex === null || finalHighlights.length === 0) return
    const nextIndex = (currentHighlightIndex + 1) % finalHighlights.length
    navigateToHighlight(nextIndex)
  }, [currentHighlightIndex, finalHighlights.length, navigateToHighlight])
  
  const navigateToPreviousHighlight = useCallback(() => {
    if (currentHighlightIndex === null || finalHighlights.length === 0) return
    const prevIndex = currentHighlightIndex === 0 
      ? finalHighlights.length - 1 
      : currentHighlightIndex - 1
    navigateToHighlight(prevIndex)
  }, [currentHighlightIndex, finalHighlights.length, navigateToHighlight])
  
  // Keyboard shortcuts for highlight navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if we have highlights and user is not typing in an input
      if (finalHighlights.length === 0) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      // 'n' key for next highlight, 'p' key for previous highlight
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        navigateToNextHighlight()
      } else if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        navigateToPreviousHighlight()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [finalHighlights.length, navigateToNextHighlight, navigateToPreviousHighlight])

  console.log("[DocumentViewerClient] Computed highlights:", {
    highlightsCount: finalHighlights.length,
    highlights: finalHighlights,
    contextHighlightsCount: contextHighlights.length,
    autoHighlight,
    hasActiveConversation,
    currentHighlightIndex,
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
                {finalHighlights.length > 0 && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={navigateToPreviousHighlight}
                          disabled={finalHighlights.length === 0}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Previous highlight</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span 
                          className="text-xs text-muted-foreground min-w-[3rem] text-center cursor-default"
                          aria-label={`Highlight ${currentHighlightIndex !== null ? currentHighlightIndex + 1 : 0} of ${finalHighlights.length}`}
                        >
                          {currentHighlightIndex !== null && finalHighlights.length > 0
                            ? `${currentHighlightIndex + 1} / ${finalHighlights.length}`
                            : ""}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Use <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">n</kbd> for next, <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">p</kbd> for previous</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={navigateToNextHighlight}
                          disabled={finalHighlights.length === 0}
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Next highlight</p>
                      </TooltipContent>
                    </Tooltip>
                    <div className="h-6 w-px bg-border" />
                  </>
                )}
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
        {canRenderDocument ? (
          <MultiFormatViewer
            url={viewerUrl}
            documentId={documentId}
            documentTitle={documentTitle}
            highlights={finalHighlights}
            initialPage={initialPage}
            className="h-full"
            hideControls={true}
            documentMetadata={viewerMetadata}
            viewportOffset={DOCUMENT_VIEWER_HEADER_HEIGHT}
            onControlsReady={setControls}
            autoHighlight={autoHighlight}
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
