"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { MultiFormatViewer } from "@/components/multi-format-viewer"
import { useHighlightContext, type Highlight as HighlightRecord } from "@/lib/contexts/highlight-context"
import { ZOOM_PRESETS, type ViewerControls } from "@/components/pdf-viewer"
import { getHighlightCoordinates, findTextSpan } from "@/lib/utils/pdf-extraction"
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
import { useI18n } from "@/lib/i18n/use-i18n"
import { IconTooltip } from "@/components/icon-tooltip"

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
  workspaceName?: string
}

const DOCUMENT_VIEWER_HEADER_HEIGHT = 64
const PENDING_HIGHLIGHT_STORAGE_KEY = "agora:pendingHighlight"

type HighlightEventPayload = {
  documentId?: string
  highlightId?: string
  textSpan?: { start: number; end: number }
  pageNumber?: number
  quote?: string
  color?: string
  source?: HighlightRecord["source"]
  confidence?: HighlightRecord["confidence"]
  coordinates?: HighlightRecord["coordinates"]
}

type PendingHighlightFocus = {
  highlightId?: string
  textSpan?: { start: number; end: number }
  clearStorage?: boolean
}

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
  workspaceName,
}: DocumentViewerClientProps) {
  const { t } = useI18n()
  const backToWorkspaceLabel = workspaceName
    ? t("workspace.navigation.backToWorkspace", undefined, { name: workspaceName })
    : t("workspace.navigation.backToDashboard")
  const highlightContext = useHighlightContext()
  const { 
    highlights: highlightsMap,
    getHighlightsForDocument, 
    autoHighlight, 
    setAutoHighlight, 
    setActiveDocument,
    addHighlight,
  } = highlightContext
  
  const [controls, setControls] = useState<ViewerControls | null>(null)
  const [hoveredHighlightId, setHoveredHighlightId] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const pendingHighlightRequestRef = useRef<PendingHighlightFocus | null>(null)
  
  const clearPendingHighlightStorage = useCallback((expectedHighlightId?: string) => {
    if (typeof window === "undefined") {
      return
    }

    const raw = window.sessionStorage.getItem(PENDING_HIGHLIGHT_STORAGE_KEY)
    if (!raw) {
      return
    }

    try {
      const payload = JSON.parse(raw)
      if (!expectedHighlightId || !payload?.highlightId || payload.highlightId === expectedHighlightId) {
        window.sessionStorage.removeItem(PENDING_HIGHLIGHT_STORAGE_KEY)
      }
    } catch {
      window.sessionStorage.removeItem(PENDING_HIGHLIGHT_STORAGE_KEY)
    }
  }, [])

  const ensureHighlightForPayload = useCallback(
    (payload?: HighlightEventPayload | null) => {
      if (!payload || !payload.textSpan) {
        return false
      }

      const { textSpan } = payload
      const hasSpan =
        typeof textSpan.start === "number" &&
        typeof textSpan.end === "number" &&
        textSpan.start >= 0 &&
        textSpan.end > textSpan.start

      if (!hasSpan) {
        return false
      }

      const parsedPage = Number(payload.pageNumber ?? 1)
      const safePageNumber = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

      const existingHighlights = getHighlightsForDocument(documentId)
      const alreadyExists = existingHighlights.some((h) => {
        if (payload.highlightId && h.id === payload.highlightId) {
          return true
        }
        if (!h.textSpan || !h.pageNumber) {
          return false
        }
        return (
          h.pageNumber === safePageNumber &&
          h.textSpan.start === textSpan.start &&
          h.textSpan.end === textSpan.end
        )
      })

      if (alreadyExists) {
        return true
      }

      addHighlight(documentId, {
        id: payload.highlightId || `pending-highlight-${documentId}-${safePageNumber}-${Date.now()}`,
        documentId,
        textSpan: payload.textSpan,
        pageNumber: safePageNumber,
        quote: payload.quote || "",
        source: payload.source || "ai_response",
        confidence: payload.confidence || "exact",
        color: payload.color || "rgba(255, 221, 0, 0.45)",
        coordinates: payload.coordinates,
      })

      return false
    },
    [addHighlight, documentId, getHighlightsForDocument],
  )
  
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
    const origin = typeof viewerMetadata?.origin === "string" ? viewerMetadata.origin.toLowerCase() : ""
    
    // Check file extension first (most reliable for text files)
    const hasTextExtension = 
      documentTitle?.toLowerCase().endsWith(".md") ||
      documentTitle?.toLowerCase().endsWith(".txt") ||
      documentTitle?.toLowerCase().endsWith(".markdown")
    
    // Check if it's a workspace/space generated text document
    const isWorkspaceText = origin === "workspace_generated" || origin === "space_scope"
    
    // Check metadata type
    const hasTextType = metadataType.includes("text") || metadataType.includes("markdown")
    
    // Exclude Word documents explicitly
    const isWordDocument = 
      metadataType.includes("word") ||
      metadataType.includes("msword") ||
      documentTitle?.toLowerCase().endsWith(".doc") ||
      documentTitle?.toLowerCase().endsWith(".docx")
    
    // A document is a text document if:
    // 1. It has a text file extension, OR
    // 2. It has text/markdown in metadata type, OR
    // 3. It's a workspace/space generated document
    // BUT NOT if it's a Word document
    return (hasTextExtension || hasTextType || isWorkspaceText) && !isWordDocument
  }, [viewerMetadata, documentTitle])

  const viewerUrl = useMemo(() => {
    console.log("[DocumentViewerClient] Computing viewerUrl", {
      documentId,
      documentUrl,
      isTextDocument,
      documentTitle,
      viewerMetadata,
    })
    
    // Text/markdown documents are rendered via text endpoint regardless of source URL
    if (isTextDocument) {
      const textContentUrl = `/api/documents/${documentId}/text-content`
      console.log("[DocumentViewerClient] Using text-content URL", textContentUrl)
      return textContentUrl
    }

    // Always fall back to our proxy route if we don't have a source URL
    if (!documentUrl) {
      const pdfUrl = `/api/documents/${documentId}/pdf`
      console.log("[DocumentViewerClient] No source URL, using PDF proxy", pdfUrl)
      return pdfUrl
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
  
  console.log("[DocumentViewerClient] Render decision", {
    canRenderDocument,
    viewerUrl,
    documentId,
  })
  
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
    const adjustTextSpanToOffsets = (
      span: { start: number; end: number },
      pageText?: string,
      offsets?: Record<number, number>,
    ): { start: number; end: number } | null => {
      if (!span || typeof span.start !== "number" || typeof span.end !== "number" || span.end <= span.start) {
        return null
      }
      if (!offsets) {
        return null
      }

      let { start, end } = span
      while (start < end && offsets[start] === undefined) {
        start++
      }
      while (end > start && offsets[end - 1] === undefined) {
        end--
      }

      if (end <= start) {
        return null
      }

      if (pageText) {
        while (start < end && /\s/.test(pageText[start]) && offsets[start] === undefined) {
          start++
        }
        while (end > start && /\s/.test(pageText[end - 1]) && offsets[end - 1] === undefined) {
          end--
        }
      }

      if (end <= start) {
        return null
      }

      if (offsets[start] === undefined || offsets[end - 1] === undefined) {
        return null
      }

      return { start, end }
    }

    return highlights.map((highlight) => {
      const normalizedTargetPage = Number(highlight.pageNumber) || 1
      if (highlight.coordinates) {
        return {
          ...highlight,
          pageNumber: normalizedTargetPage,
        }
      }

      const pageData = pages.find((p: any) => Number(p.page_number) === normalizedTargetPage)
      if (pageData) {
        let textItems = pageData.text_items
        if (typeof textItems === "string") {
          try {
            textItems = JSON.parse(textItems)
          } catch {
            textItems = []
          }
        } else if (!Array.isArray(textItems)) {
          textItems = []
        }

        let characterOffsets = pageData.character_offsets
        if (typeof characterOffsets === "string") {
          try {
            characterOffsets = JSON.parse(characterOffsets)
          } catch {
            characterOffsets = {}
          }
        } else if (!characterOffsets || typeof characterOffsets !== "object") {
          characterOffsets = {}
        }

        const pageTextContent =
          typeof pageData.text_content === "string" ? pageData.text_content : ""

        let resolvedTextSpan = highlight.textSpan
        const spanIsValid =
          resolvedTextSpan &&
          typeof resolvedTextSpan.start === "number" &&
          typeof resolvedTextSpan.end === "number" &&
          resolvedTextSpan.end > resolvedTextSpan.start

        let resolvedSpanWithOffsets: { start: number; end: number } | null = null
        if (spanIsValid) {
          resolvedSpanWithOffsets = adjustTextSpanToOffsets(
            resolvedTextSpan as { start: number; end: number },
            pageTextContent,
            characterOffsets,
          )
        }

        if ((!spanIsValid || !resolvedSpanWithOffsets) && highlight.quote && pageTextContent) {
          const fallbackSpan = findTextSpan(pageTextContent, highlight.quote)
          if (fallbackSpan) {
            resolvedTextSpan = fallbackSpan
            resolvedSpanWithOffsets = adjustTextSpanToOffsets(fallbackSpan, pageTextContent, characterOffsets)
          }
        }

        if (!resolvedSpanWithOffsets) {
          return {
            ...highlight,
            pageNumber: normalizedTargetPage,
            textSpan: resolvedTextSpan ?? highlight.textSpan,
            confidence: highlight.confidence ?? "approximate",
          }
        }

        const coordinates = getHighlightCoordinates(
          resolvedSpanWithOffsets,
          textItems || [],
          characterOffsets || {},
        )

        if (!coordinates) {
          return {
            ...highlight,
            pageNumber: normalizedTargetPage,
            textSpan: resolvedSpanWithOffsets,
            confidence: highlight.confidence ?? "approximate",
          }
        }

        return {
          ...highlight,
          pageNumber: normalizedTargetPage,
          textSpan: resolvedSpanWithOffsets,
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
  const hasAIHighlights = contextHighlights.some((h) => h.source === "ai_response")
  
  // Filter highlights based on source and auto-highlight state
  const highlightsToUse = useMemo(() => {
    if (contextHighlights.length === 0) {
      return []
    }

    if (!autoHighlight) {
      return contextHighlights.filter((h) => h.source === "user_click")
    }

    return contextHighlights
  }, [contextHighlights, autoHighlight])
  
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
  const navigateToHighlight = useCallback(
    (index: number) => {
      if (index < 0 || index >= finalHighlights.length) return
      setCurrentHighlightIndex(index)
      
      const highlight = finalHighlights[index]
      if (controls && controls.goToPage && highlight.pageNumber) {
        controls.goToPage(highlight.pageNumber)
      }

      if (typeof window === "undefined") {
        return
      }

      if (isTextDocument) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("scrollToHighlight", {
              detail: {
                highlight,
                highlightId: highlight.id,
                highlightIndex: index,
                pageNumber: highlight.pageNumber,
              },
            }),
          )
        }, 300)
      } else if (highlight.pageNumber) {
        window.dispatchEvent(
          new CustomEvent("scrollToPage", {
            detail: {
              pageNumber: highlight.pageNumber,
              highlight,
            },
          }),
        )
      }
    },
    [finalHighlights, controls, isTextDocument],
  )
  
  const navigateToNextHighlight = useCallback(() => {
    if (currentHighlightIndex === null || finalHighlights.length === 0) return
    const nextIndex = (currentHighlightIndex + 1) % finalHighlights.length
    navigateToHighlight(nextIndex)
  }, [currentHighlightIndex, finalHighlights.length, navigateToHighlight])

  const focusHighlightByIdentifier = useCallback(
    (highlightId?: string, span?: { start: number; end: number }) => {
      if (!finalHighlights || finalHighlights.length === 0) {
        return false
      }

      let targetIndex = -1
      if (highlightId) {
        targetIndex = finalHighlights.findIndex((h) => h.id === highlightId)
      }
      if (targetIndex === -1 && span) {
        targetIndex = finalHighlights.findIndex(
          (h) => h.textSpan && h.textSpan.start === span.start && h.textSpan.end === span.end,
        )
      }

      if (targetIndex !== -1) {
        navigateToHighlight(targetIndex)
        return true
      }

      return false
    },
    [finalHighlights, navigateToHighlight],
  )
  
  const processHighlightPayload = useCallback(
    (payload?: HighlightEventPayload | null, options?: { fromStorage?: boolean }) => {
      if (!payload) {
        return
      }
      if (payload.documentId && payload.documentId !== documentId) {
        return
      }

      const highlightReady = ensureHighlightForPayload(payload)
      if (highlightReady) {
        const handledNow = focusHighlightByIdentifier(payload.highlightId, payload.textSpan)
        if (handledNow) {
          if (options?.fromStorage) {
            clearPendingHighlightStorage(payload.highlightId)
          }
          return
        }
      }

      pendingHighlightRequestRef.current = {
        highlightId: payload.highlightId,
        textSpan: payload.textSpan,
        clearStorage: options?.fromStorage ?? false,
      }
    },
    [clearPendingHighlightStorage, documentId, ensureHighlightForPayload, focusHighlightByIdentifier],
  )
  
  const navigateToPreviousHighlight = useCallback(() => {
    if (currentHighlightIndex === null || finalHighlights.length === 0) return
    const prevIndex = currentHighlightIndex === 0 
      ? finalHighlights.length - 1 
      : currentHighlightIndex - 1
    navigateToHighlight(prevIndex)
  }, [currentHighlightIndex, finalHighlights.length, navigateToHighlight])
  
  useEffect(() => {
    if (!pendingHighlightRequestRef.current) {
      return
    }

    const { highlightId, textSpan, clearStorage } = pendingHighlightRequestRef.current
    if (!highlightId && !textSpan) {
      pendingHighlightRequestRef.current = null
      return
    }

    const handled = focusHighlightByIdentifier(highlightId, textSpan)
    if (handled) {
      if (clearStorage) {
        clearPendingHighlightStorage(highlightId)
      }
      pendingHighlightRequestRef.current = null
    }
  }, [finalHighlights, focusHighlightByIdentifier, clearPendingHighlightStorage])
  
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const raw = window.sessionStorage.getItem(PENDING_HIGHLIGHT_STORAGE_KEY)
    if (!raw) {
      return
    }
    try {
      const payload = JSON.parse(raw)
      processHighlightPayload(payload, { fromStorage: true })
    } catch {
      window.sessionStorage.removeItem(PENDING_HIGHLIGHT_STORAGE_KEY)
    }
  }, [processHighlightPayload])

  useEffect(() => {
    const handleFocusRequest = (event: CustomEvent<HighlightEventPayload>) => {
      processHighlightPayload(event.detail, { fromStorage: false })
    }

    window.addEventListener("focusDocumentHighlight", handleFocusRequest as EventListener)
    return () => window.removeEventListener("focusDocumentHighlight", handleFocusRequest as EventListener)
  }, [processHighlightPayload])

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const raw = window.sessionStorage.getItem(PENDING_HIGHLIGHT_STORAGE_KEY)
    if (!raw) {
      return
    }
    try {
      const payload = JSON.parse(raw)
      if (payload.documentId && payload.documentId !== documentId) {
        return
      }
      const handled = focusHighlightByIdentifier(payload.highlightId, payload.textSpan)
      if (handled) {
        window.sessionStorage.removeItem(PENDING_HIGHLIGHT_STORAGE_KEY)
      }
    } catch {
      window.sessionStorage.removeItem(PENDING_HIGHLIGHT_STORAGE_KEY)
    }
  }, [documentId, focusHighlightByIdentifier])

  useEffect(() => {
    const handleHover = (event: any) => {
      const { documentId: targetDocId, highlightId, active } = event.detail || {}
      if (targetDocId && targetDocId !== documentId) {
        return
      }
      if (!active) {
        setHoveredHighlightId((current) => (current === highlightId ? null : current))
      } else {
        setHoveredHighlightId(highlightId || null)
      }
    }

    window.addEventListener("hoverDocumentHighlight", handleHover as EventListener)
    return () => window.removeEventListener("hoverDocumentHighlight", handleHover as EventListener)
  }, [documentId])

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
                <span className="text-xs">{backToWorkspaceLabel}</span>
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
                <IconTooltip label={t("workspace.documents.viewer.zoomOut")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={controls.zoomOut}
                    disabled={controls.scale <= (controls.minScale ?? 0.5)}
                    aria-label={t("workspace.documents.viewer.zoomOut")}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </IconTooltip>
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
                <IconTooltip label={t("workspace.documents.viewer.zoomIn")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={controls.zoomIn}
                    disabled={controls.scale >= (controls.maxScale ?? 3.0)}
                    aria-label={t("workspace.documents.viewer.zoomIn")}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                {controls.fitToWidth && (
                  <>
                    <div className="h-6 w-px bg-border" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={controls.fitMode === "width" ? "secondary" : "ghost"}
                          size="sm"
                          onClick={controls.fitToWidth}
                          aria-label={
                            controls.fitMode === "width"
                              ? t("workspace.documents.viewer.disableFitToWidth")
                              : t("workspace.documents.viewer.fitToWidth")
                          }
                        >
                          <ChevronsLeftRight className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {controls.fitMode === "width"
                            ? t("workspace.documents.viewer.disableFitToWidth")
                            : t("workspace.documents.viewer.fitToWidth")}
                        </p>
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
                          aria-label={t("workspace.documents.viewer.previousHighlight")}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("workspace.documents.viewer.previousHighlight")}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span 
                          className="text-xs text-muted-foreground min-w-[3rem] text-center cursor-default"
                          aria-label={t("workspace.documents.viewer.highlightOf", undefined, {
                            current: currentHighlightIndex !== null ? currentHighlightIndex + 1 : 0,
                            total: finalHighlights.length,
                          })}
                        >
                          {currentHighlightIndex !== null && finalHighlights.length > 0
                            ? `${currentHighlightIndex + 1} / ${finalHighlights.length}`
                            : ""}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("workspace.documents.viewer.highlightNavHint")}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={navigateToNextHighlight}
                          disabled={finalHighlights.length === 0}
                          aria-label={t("workspace.documents.viewer.nextHighlight")}
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("workspace.documents.viewer.nextHighlight")}</p>
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
                      aria-label={
                        autoHighlight
                          ? t("workspace.documents.viewer.hideHighlights")
                          : t("workspace.documents.viewer.showHighlights")
                      }
                    >
                      <Highlighter className={cn(
                        "h-4 w-4",
                        autoHighlight && "text-primary"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {autoHighlight
                        ? t("workspace.documents.viewer.hideHighlights")
                        : t("workspace.documents.viewer.showHighlights")}
                    </p>
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
                  <a href={documentUrl} target="_blank" rel="noopener noreferrer" aria-label={t("workspace.documents.viewer.download")}>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("workspace.documents.viewer.download")}</p>
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
            hoveredHighlightId={hoveredHighlightId}
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
