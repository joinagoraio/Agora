"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import DOMPurify from "dompurify"
import { PDFViewer, Highlight, type ViewerControls, type ViewerFitMode } from "@/components/pdf-viewer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, ExternalLink, Download, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { findTextSpan } from "@/lib/utils/pdf-extraction"
import type { Highlight as ContextHighlight } from "@/lib/contexts/highlight-context"
import { WordViewer } from "@/components/multi-format-viewer/word-viewer"
import { HtmlViewer } from "@/components/multi-format-viewer/html-viewer"
import { clientLogger } from "@/lib/utils/client-logger"

export type DocumentType = "pdf" | "word" | "html" | "text" | "unknown"

const WORD_HTML_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ["p", "span", "div", "strong", "em", "u", "br", "h1", "h2", "h3"] as string[],
  ALLOWED_ATTR: ["class", "style"] as string[],
} as const

const GENERIC_HTML_SANITIZE_OPTIONS = {
  ALLOWED_ATTR: ["class", "style", "href", "target", "rel", "download"],
} as const

const WORD_HIGHLIGHT_CLASS = "word-highlight"
const TEXT_HIGHLIGHT_CLASS = "workspace-text-highlight"

interface MultiFormatViewerProps {
  url: string
  documentId: string
  documentTitle: string
  highlights?: Highlight[]
  onPageChange?: (page: number) => void
  initialPage?: number
  className?: string
  hideControls?: boolean
  documentMetadata?: Record<string, any>
  viewportOffset?: number
  onControlsReady?: (controls: ViewerControls) => void
  autoHighlight?: boolean
}

// Helper function to detect document type from URL, content type, or metadata
function detectDocumentType(
  url: string,
  contentType?: string | null,
  metadata?: { type?: string; filename?: string }
): DocumentType {
  // Check metadata first
  if (metadata?.type) {
    const type = metadata.type.toLowerCase()
    if (type.includes("pdf")) return "pdf"
    if (type.includes("word") || type.includes("msword") || type.includes("wordprocessingml")) return "word"
    if (type.includes("html")) return "html"
    if (type.includes("text") || type.includes("plain")) return "text"
  }

  // Check content type header
  if (contentType) {
    const ct = contentType.toLowerCase()
    if (ct.includes("application/pdf")) return "pdf"
    if (ct.includes("application/msword") || ct.includes("wordprocessingml")) return "word"
    if (ct.includes("text/html")) return "html"
    if (ct.includes("text/plain") || ct.includes("text/markdown")) return "text"
  }

  // Check file extension from URL or filename
  const filename = metadata?.filename || url.split("/").pop() || ""
  const ext = filename.split(".").pop()?.toLowerCase()
  
  switch (ext) {
    case "pdf":
      return "pdf"
    case "doc":
    case "docx":
      return "word"
    case "html":
    case "htm":
      return "html"
    case "txt":
    case "md":
      return "text"
    default:
      return "unknown"
  }
}

export function MultiFormatViewer({
  url,
  documentId,
  documentTitle,
  highlights = [],
  onPageChange,
  initialPage = 1,
  className = "",
  hideControls = false,
  documentMetadata,
  viewportOffset = 0,
  onControlsReady,
  autoHighlight = true,
}: MultiFormatViewerProps) {
  const [documentType, setDocumentType] = useState<DocumentType>("unknown")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wordContent, setWordContent] = useState<string | null>(null)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [fitMode, setFitMode] = useState<ViewerFitMode | null>(null)
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const highlightRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const innerContentRef = useRef<HTMLDivElement>(null)
  const applyFitRef = useRef<((mode: ViewerFitMode) => void) | undefined>(undefined)
  const isApplyingFitRef = useRef(false)

  // Detect document type and load content
  useEffect(() => {
    const loadDocument = async (retryCount = 0) => {
      setLoading(true)
      setError(null)

      try {
        // For text/markdown documents, use document_pages.text_content API for consistency
        // This ensures the content matches what RAG/search uses
        const isTextOrMarkdown = 
          documentMetadata?.type?.includes("text") ||
          documentMetadata?.type?.includes("markdown") ||
          documentTitle?.toLowerCase().endsWith(".md") ||
          documentTitle?.toLowerCase().endsWith(".txt")

        let shouldFallbackToOriginalSource = false
        const isInternalPdfEndpoint = (() => {
          if (url.startsWith("/api/documents/") && url.includes("/pdf")) {
            return true
          }
          if (typeof window === "undefined") {
            return false
          }
          try {
            const parsedUrl = new URL(url, window.location.origin)
            const sameOrigin = parsedUrl.origin === window.location.origin
            return (
              sameOrigin &&
              parsedUrl.pathname.startsWith("/api/documents/") &&
              parsedUrl.pathname.includes("/pdf")
            )
          } catch {
            return false
          }
        })()

        if (!isTextOrMarkdown && isInternalPdfEndpoint) {
          setDocumentType("pdf")
          setLoading(false)
          return
        }

        if (isTextOrMarkdown) {
          // Use the text-content API endpoint which fetches from document_pages
          const textContentResponse = await fetch(`/api/documents/${documentId}/text-content`, {
            credentials: "include",
            headers: {
              Accept: "text/plain",
            },
            cache: "no-store",
          })

          if (textContentResponse.ok) {
            const textContent = await textContentResponse.text()
            setDocumentType("text")
            setTextContent(textContent)
            setLoading(false)
            return
          }

          if (textContentResponse.status === 401) {
            if (retryCount === 0) {
              await new Promise(resolve => setTimeout(resolve, 500))
              return loadDocument(1)
            }
            throw new Error("Authentication required. Please refresh the page and try again.")
          }

          if (textContentResponse.status === 403) {
            throw new Error("You don't have permission to access this document.")
          }

          const fallbackStatuses = [400, 404, 422]
          if (fallbackStatuses.includes(textContentResponse.status)) {
            clientLogger.warn("[MultiFormatViewer] Text-content endpoint unavailable, falling back to original source", {
              status: textContentResponse.status,
              statusText: textContentResponse.statusText,
              documentId,
            })
            shouldFallbackToOriginalSource = true
          } else {
            let errorMessage = `Failed to fetch document content: ${textContentResponse.status} ${textContentResponse.statusText}`
            try {
              const errorData = await textContentResponse.json()
              if (errorData.error) {
                errorMessage = errorData.error
              }
            } catch {
              // If response isn't JSON, use default message
            }
            throw new Error(errorMessage)
          }
        }

        // If the text endpoint failed with a soft error, fall back to original source
        if (!isTextOrMarkdown || shouldFallbackToOriginalSource) {
          if (shouldFallbackToOriginalSource && isInternalPdfEndpoint) {
            clientLogger.warn("[MultiFormatViewer] Using internal PDF viewer fallback", {
              documentId,
              url,
            })
            setDocumentType("pdf")
            setLoading(false)
            return
          }

          const metadataContentType =
            typeof documentMetadata?.type === "string" ? documentMetadata.type : undefined
          const fallbackDetectedType = detectDocumentType(url, metadataContentType, documentMetadata)

          let response: Response
          try {
          // For other document types, fetch from the original URL
          // Fetch document to detect type
          // For API routes, ensure cookies are included for authentication
            response = await fetch(url, {
              credentials: "include",
              headers: {
                Accept: "*/*",
              },
              cache: "no-store", // Ensure fresh request
            })
          } catch (fetchError) {
            if (fallbackDetectedType === "pdf") {
              clientLogger.warn("[MultiFormatViewer] Fetch failed but metadata indicates PDF, falling back to PDF viewer", {
                documentId,
                url,
                error: fetchError instanceof Error ? fetchError.message : fetchError,
              })
              setDocumentType("pdf")
              setLoading(false)
              return
            }
            throw fetchError
          }

          if (!response.ok) {
            // Handle authentication errors specifically
            if (response.status === 401) {
              // If first attempt and 401, try refreshing the page once
              if (retryCount === 0) {
                // Wait a bit and retry (session might be refreshing)
                await new Promise(resolve => setTimeout(resolve, 500))
                return loadDocument(1)
              }
              throw new Error("Authentication required. Please refresh the page and try again.")
            }
            if (response.status === 403) {
              throw new Error("You don't have permission to access this document.")
            }
            if (response.status === 404) {
              throw new Error("Document not found.")
            }
            
            // Try to get error message from response
            let errorMessage = `Failed to fetch document: ${response.status} ${response.statusText}`
            try {
              const errorData = await response.json()
              if (errorData.error) {
                errorMessage = errorData.error
              }
            } catch {
              // If response isn't JSON, use default message
            }
            throw new Error(errorMessage)
          }

          const contentType = response.headers.get("content-type")
          const detectedType = detectDocumentType(url, contentType, documentMetadata)

          setDocumentType(detectedType)

          // Load content based on type
          if (detectedType === "word") {
            try {
              const mammoth = await import("mammoth")
              const arrayBuffer = await response.arrayBuffer()
              const result = await mammoth.convertToHtml({ arrayBuffer })
              setWordContent(result.value)
              if (result.messages.length > 0) {
                clientLogger.warn("Word conversion warnings:", result.messages)
              }
            } catch (err) {
              clientLogger.error("Error converting Word document:", err)
              throw new Error("Failed to convert Word document. The file may be corrupted or in an unsupported format.")
            }
          } else if (detectedType === "html") {
            const text = await response.text()
            setHtmlContent(text)
          } else if (detectedType === "text") {
            const text = await response.text()
            setTextContent(text)
          } else if (detectedType === "pdf") {
            // PDF will be handled by PDFViewer component
          } else {
            throw new Error(`Unsupported document type: ${detectedType}`)
          }

          setLoading(false)
          return
        }

        // Should not reach here, but guard against it
        throw new Error("Unsupported text document fallback path")
      } catch (err) {
        clientLogger.error("Error loading document:", err)
        setError(err instanceof Error ? err.message : "Failed to load document")
        setLoading(false)
      }
    }

    loadDocument()
  }, [url, documentMetadata, documentId, documentTitle])

  const clampScale = useCallback((value: number) => {
    return Math.min(Math.max(value, 0.5), 3.0)
  }, [])

  function zoomIn() {
    // Don't clear fit mode - zoom should work with fit mode
    setScale((prev) => Math.min(prev + 0.25, 3.0))
  }

  function zoomOut() {
    // Don't clear fit mode - zoom should work with fit mode
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  function rotate() {
    setRotation((prev) => (prev + 90) % 360)
  }

  // Track container size for fit calculations
  useEffect(() => {
    if (!containerRef.current) return

    const updateContainerSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        // Account for padding (2rem = 32px on each side = 64px total)
        setContainerSize({
          width: rect.width - 64,
          height: rect.height - 64,
        })
      }
    }

    updateContainerSize()

    const resizeObserver = new ResizeObserver(updateContainerSize)
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [documentType])

  // Apply fit mode calculations
  const applyFit = useCallback(
    (mode: ViewerFitMode) => {
      // Fit mode just sets the container width, it doesn't change scale
      // Scale is only controlled by zoom
      // This function is kept for compatibility but doesn't need to do anything
      // since the container width is controlled by the fitMode state in the render
    },
    []
  )

  // Keep ref updated with latest applyFit function
  useEffect(() => {
    applyFitRef.current = applyFit
  }, [applyFit])

  const fitToWidth = useCallback(() => {
    // Toggle fit mode - if already in fit mode, turn it off
    setFitMode((prev) => (prev === "width" ? null : "width"))
  }, [])


  const handleSetScale = useCallback((value: number) => {
    // Don't clear fit mode when setting scale from dropdown
    setScale(() => clampScale(value))
  }, [clampScale])

  // Stable empty functions for controls
  const noop = useCallback(() => {}, [])

  // Fit mode is handled by CSS (container width changes based on fitMode state)
  // No need to recalculate on container size changes

  // Expose controls for PDF viewer
  const handlePDFControlsReady = (controls: ViewerControls) => {
    if (onControlsReady) {
      onControlsReady(controls)
    }
  }

  // Memoize controls object to prevent unnecessary re-renders
  const controls = useMemo(() => {
    if (documentType === "pdf" || loading || error) return null
    
    return {
      pageNumber: 1,
      numPages: 1,
      scale,
      minScale: 0.5,
      maxScale: 3.0,
      fitMode,
      changePage: noop,
      goToPage: noop,
      zoomIn,
      zoomOut,
      rotate,
      fitToWidth,
      setScale: handleSetScale,
    }
  }, [documentType, loading, error, scale, fitMode, zoomIn, zoomOut, rotate, fitToWidth, handleSetScale, noop])

  // Expose controls only when they change
  const prevControlsRef = useRef<ViewerControls | null>(null)
  const onControlsReadyRef = useRef(onControlsReady)
  
  // Keep ref updated
  useEffect(() => {
    onControlsReadyRef.current = onControlsReady
  }, [onControlsReady])
  
  useEffect(() => {
    if (!controls) {
      if (prevControlsRef.current) {
        prevControlsRef.current = null
      }
      return
    }
    
    // Only call onControlsReady if controls actually changed meaningfully
    const controlsChanged = 
      !prevControlsRef.current ||
      prevControlsRef.current.scale !== controls.scale ||
      prevControlsRef.current.fitMode !== controls.fitMode
    
    if (controlsChanged && onControlsReadyRef.current) {
      prevControlsRef.current = controls
      onControlsReadyRef.current(controls)
    }
  }, [controls])

  // Find all highlights for text documents (page 1 or no page specified)
  // Sort by start position to render in order
  // Memoize to avoid recomputing on every render
  const textHighlights = useMemo(() => {
    if (documentType !== "text") return []
    
    return highlights
      .filter((h) => !h.pageNumber || h.pageNumber === 1)
      .filter((h) => h.textSpan && h.textSpan.start !== undefined && h.textSpan.end !== undefined)
      .sort((a, b) => {
        const aStart = a.textSpan?.start ?? 0
        const bStart = b.textSpan?.start ?? 0
        return aStart - bStart
      })
  }, [documentType, highlights])
  
  // For backward compatibility, keep textHighlight for single highlight logic
  const textHighlight = textHighlights.length > 0 ? textHighlights[0] : null
  
  // Memoize the deduplication and merging logic (must be at top level, not conditional)
  const processedHighlights = useMemo(() => {
    // Only process if document type is text and we have highlights
    if (documentType !== "text" || textHighlights.length === 0) return []
    
    // First, deduplicate and merge overlapping highlights
    // Sort highlights by start position
    const sortedHighlights = [...textHighlights].sort((a, b) => {
      const aStart = a.textSpan?.start ?? 0
      const bStart = b.textSpan?.start ?? 0
      if (aStart !== bStart) return aStart - bStart
      // If same start, prefer longer highlight
      const aEnd = a.textSpan?.end ?? 0
      const bEnd = b.textSpan?.end ?? 0
      return bEnd - aEnd
    })
    
    // Deduplicate: remove exact duplicates and merge overlapping highlights
    const deduplicatedHighlights: typeof sortedHighlights = []
    for (let i = 0; i < sortedHighlights.length; i++) {
      const current = sortedHighlights[i]
      const currentStart = current.textSpan?.start ?? 0
      const currentEnd = current.textSpan?.end ?? 0
      
      if (currentStart === undefined || currentEnd === undefined || currentStart >= currentEnd) {
        continue // Skip invalid highlights
      }
      
      // Check if this highlight is a duplicate of an existing one
      const isDuplicate = deduplicatedHighlights.some(existing => {
        const existingStart = existing.textSpan?.start ?? 0
        const existingEnd = existing.textSpan?.end ?? 0
        return existingStart === currentStart && existingEnd === currentEnd
      })
      
      if (isDuplicate) {
        continue // Skip duplicates
      }
      
      // Check if this highlight overlaps with an existing one
      const overlappingIndex = deduplicatedHighlights.findIndex(existing => {
        const existingStart = existing.textSpan?.start ?? 0
        const existingEnd = existing.textSpan?.end ?? 0
        // Check if they overlap (one starts before the other ends)
        return (currentStart < existingEnd && currentEnd > existingStart)
      })
      
      if (overlappingIndex >= 0) {
        // Merge overlapping highlights by taking the union (min start, max end)
        const existing = deduplicatedHighlights[overlappingIndex]
        const existingStart = existing.textSpan?.start ?? 0
        const existingEnd = existing.textSpan?.end ?? 0
        const mergedStart = Math.min(existingStart, currentStart)
        const mergedEnd = Math.max(existingEnd, currentEnd)
        
        deduplicatedHighlights[overlappingIndex] = {
          ...existing,
          textSpan: { start: mergedStart, end: mergedEnd }
        }
      } else {
        // No overlap, add as new highlight
        deduplicatedHighlights.push(current)
      }
    }
    
    // Re-sort after merging (in case merging changed positions)
    return [...deduplicatedHighlights].sort((a, b) => {
      const aStart = a.textSpan?.start ?? 0
      const bStart = b.textSpan?.start ?? 0
      return aStart - bStart
    })
  }, [documentType, textHighlights])
  
  // Helper function to find textSpan with fallback strategies (must be defined before useMemo)
  const findTextSpanWithFallback = useCallback((expectedTextSpan: { start: number; end: number }, searchText?: string): { start: number; end: number; confidence: 'exact' | 'normalized' | 'fuzzy' | 'approximate' } | null => {
    if (!textContent) return null
    
    const { start: expectedStart, end: expectedEnd } = expectedTextSpan
    
    // Strategy 1: Try exact position match
    if (expectedStart >= 0 && expectedEnd <= textContent.length && expectedEnd > expectedStart) {
      const exactText = textContent.substring(expectedStart, expectedEnd)
      if (exactText.length > 0 && exactText.length < 2000 && exactText.trim().length > 0) {
        return { start: expectedStart, end: expectedEnd, confidence: 'exact' }
      }
    }
    
    // Strategy 2: If we have search text, try normalized match
    if (searchText && searchText.length > 5) {
      const normalizedMatch = findTextSpan(textContent, searchText, { useNormalization: true, fuzzy: false })
      if (normalizedMatch) {
        return { ...normalizedMatch, confidence: 'normalized' }
      }
      
      // Strategy 3: Try fuzzy match
      const fuzzyMatch = findTextSpan(textContent, searchText, { useNormalization: true, fuzzy: true })
      if (fuzzyMatch) {
        return { ...fuzzyMatch, confidence: 'fuzzy' }
      }
    }
    
    // Strategy 4: Last resort - highlight around expected position (approximate)
    // This at least gets the user to the right area of the document
    if (expectedStart > 0 && expectedStart < textContent.length) {
      const safeStart = Math.max(0, Math.min(expectedStart, textContent.length - 200))
      const safeEnd = Math.min(textContent.length, safeStart + Math.max(50, expectedEnd - expectedStart))
      if (safeEnd > safeStart) {
        return { start: safeStart, end: safeEnd, confidence: 'approximate' }
      }
    }
    
    return null
  }, [textContent])
  
  // Memoize segment creation to avoid recomputing on every render (must be at top level)
  const segments = useMemo(() => {
    // Only process if document type is text
    if (documentType !== "text" || !textContent || processedHighlights.length === 0) {
      return []
    }
    
    const segmentArray: Array<{ type: 'text' | 'highlight', content: string, highlightIndex?: number, confidence?: string }> = []
    let lastIndex = 0
    
    for (let i = 0; i < processedHighlights.length; i++) {
      const highlight = processedHighlights[i]
      const { start: originalStart, end: originalEnd } = highlight.textSpan || {}
      
      // Try to find the textSpan with fallback strategies
      let finalTextSpan: { start: number; end: number; confidence: string } | null = null
      
      if (originalStart !== undefined && originalEnd !== undefined) {
        // Try exact match first
        if (originalStart >= 0 && originalEnd <= textContent.length && originalEnd > originalStart) {
          const exactText = textContent.substring(originalStart, originalEnd)
          if (exactText.length > 0 && exactText.length < 2000 && exactText.trim().length > 0) {
            finalTextSpan = { start: originalStart, end: originalEnd, confidence: 'exact' }
          }
        }
        
        // If exact match failed, try fallback strategies
        if (!finalTextSpan) {
          const fallbackResult = findTextSpanWithFallback(
            { start: originalStart, end: originalEnd },
            undefined
          )
          
          if (fallbackResult) {
            finalTextSpan = {
              start: fallbackResult.start,
              end: fallbackResult.end,
              confidence: fallbackResult.confidence
            }
            
            if (fallbackResult.confidence !== 'exact') {
        clientLogger.warn(`[MultiFormatViewer] Highlight ${i} used ${fallbackResult.confidence} match`, {
                original: { start: originalStart, end: originalEnd },
                found: { start: fallbackResult.start, end: fallbackResult.end },
              })
            }
          }
        }
      }
      
      // If we still don't have a valid textSpan, skip this highlight
      if (!finalTextSpan) {
        clientLogger.warn("[MultiFormatViewer] Could not find valid textSpan for highlight", i, {
          originalStart,
          originalEnd,
          textContentLength: textContent.length,
        })
        continue
      }
      
      const { start, end, confidence } = finalTextSpan
      
      // Add text before this highlight
      if (start > lastIndex) {
        segmentArray.push({
          type: 'text',
          content: textContent.substring(lastIndex, start),
        })
      }
      
      // Add the highlighted text
      const highlightedText = textContent.substring(start, end)
      if (highlightedText.length > 0 && highlightedText.length < 2000 && highlightedText.trim().length > 0) {
        segmentArray.push({
          type: 'highlight',
          content: highlightedText,
          highlightIndex: i,
          confidence,
        })
        lastIndex = end
      } else {
        clientLogger.warn("[MultiFormatViewer] Highlight text invalid after fallback for highlight", i, {
          length: highlightedText.length,
          trimmed: highlightedText.trim().length,
          confidence,
        })
        lastIndex = start // Skip this highlight but don't advance past it
      }
    }
    
    // Add remaining text after last highlight
    if (lastIndex < textContent.length) {
      segmentArray.push({
        type: 'text',
        content: textContent.substring(lastIndex),
      })
    }
    
    return segmentArray
  }, [documentType, textContent, processedHighlights, findTextSpanWithFallback])

  // Find the highlight for Word documents (page 1 or no page specified)
  const wordHighlight = documentType === "word"
    ? highlights.find((h) => !h.pageNumber || h.pageNumber === 1)
    : null

  // Extract plain text from HTML for Word documents (for highlighting)
  const wordPlainText = useMemo(() => {
    if (documentType !== "word" || !wordContent) return null
    if (typeof document === "undefined") {
      return null
    }
    // Create a temporary DOM element to extract text
    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = DOMPurify.sanitize(wordContent, WORD_HTML_SANITIZE_OPTIONS)
    return tempDiv.textContent || tempDiv.innerText || ""
  }, [documentType, wordContent])

  // Debug logging
  useEffect(() => {
    if (documentType === "text") {
      clientLogger.debug("[MultiFormatViewer] Text document detected", {
        highlights,
        textHighlight,
        textContentLength: textContent?.length || 0,
      })
    }
    if (documentType === "word") {
      clientLogger.debug("[MultiFormatViewer] Word document detected", {
        highlights,
        wordHighlight,
        wordPlainTextLength: wordPlainText?.length || 0,
      })
    }
  }, [documentType, highlights, textHighlight, textContent, wordHighlight, wordPlainText])

  // Helper function to scroll to highlight
  const scrollToTextHighlight = useCallback(() => {
    if (documentType !== "text" || !textHighlight || !textContent || !containerRef.current) {
      clientLogger.debug("[MultiFormatViewer] Scroll skipped", {
        documentType,
        hasTextHighlight: !!textHighlight,
        hasTextContent: !!textContent,
        hasContainer: !!containerRef.current,
      })
      return
    }
    
    clientLogger.debug("[MultiFormatViewer] Attempting to scroll to highlight", {
      textHighlight,
      textContentLength: textContent.length,
    })
    
    // Wait for the highlight to be rendered in the DOM
    const timer = setTimeout(() => {
      // Try to find the highlight element in the rendered content
      const highlightElement = containerRef.current?.querySelector(`.${TEXT_HIGHLIGHT_CLASS}`) as HTMLElement
      
      clientLogger.debug("[MultiFormatViewer] Looking for highlight element", {
        found: !!highlightElement,
        hasRef: !!highlightRef.current,
        containerExists: !!containerRef.current,
      })
      
      if (highlightElement) {
        highlightRef.current = highlightElement as HTMLSpanElement
        
        // Get the scrollable container
        const scrollContainer = containerRef.current
        if (scrollContainer) {
          // Calculate scroll position relative to container
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementRect = highlightElement.getBoundingClientRect()
          
          // Calculate the scroll position needed to position element at 10% from top
          const elementTopRelative = elementRect.top - containerRect.top + scrollContainer.scrollTop
          const containerHeight = scrollContainer.clientHeight
          const scrollPosition = elementTopRelative - (containerHeight * 0.10) // 10% from top instead of center
          
          clientLogger.debug("[MultiFormatViewer] Scrolling to position", {
            scrollPosition,
            elementTopRelative,
            containerHeight,
          })
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollPosition),
            behavior: "smooth",
          })
        }
      } else if (highlightRef.current) {
        // Fallback: use the ref if available, but calculate 10% position manually
        clientLogger.debug("[MultiFormatViewer] Using ref fallback for scrolling")
        const scrollContainer = containerRef.current
        if (scrollContainer && highlightRef.current) {
          const elementRect = highlightRef.current.getBoundingClientRect()
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementTopRelative = elementRect.top - containerRect.top + scrollContainer.scrollTop
          const containerHeight = scrollContainer.clientHeight
          const scrollPosition = elementTopRelative - (containerHeight * 0.10)
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollPosition),
            behavior: "smooth",
          })
        } else {
          highlightRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
      } else {
        clientLogger.warn("[MultiFormatViewer] Could not find highlight element to scroll to")
      }
    }, 300) // Increased delay to ensure DOM is updated
    
    return () => clearTimeout(timer)
  }, [documentType, textHighlight, textContent])

  // Track previous autoHighlight state to detect when it's turned on
  const prevAutoHighlightRef = useRef(autoHighlight)

  // Scroll to first highlight when text content loads or when autoHighlight is turned on
  useEffect(() => {
    if (autoHighlight && documentType === "text" && textHighlights.length > 0) {
      // Scroll to the first highlight (topmost)
      scrollToTextHighlight()
    }
  }, [scrollToTextHighlight, autoHighlight, documentType, textHighlights.length])

  // Auto-scroll when highlight toggle is turned on (changed from false to true)
  useEffect(() => {
    if (documentType === "text" && autoHighlight && !prevAutoHighlightRef.current && textHighlights.length > 0) {
      // autoHighlight just changed from false to true
      clientLogger.debug("[MultiFormatViewer] AutoHighlight turned on", { highlightCount: textHighlights.length })
      setTimeout(() => {
        scrollToTextHighlight()
      }, 200)
    }
    prevAutoHighlightRef.current = autoHighlight
  }, [autoHighlight, documentType, textHighlights.length, scrollToTextHighlight])

  // Listen for scrollToHighlight event for text documents
  useEffect(() => {
    if (documentType !== "text") return

    const handleScrollToHighlight = (event: any) => {
      const { highlight, pageNumber } = event.detail || {}
      if (!highlight || pageNumber !== 1) return // Text documents are always page 1

      clientLogger.debug("[MultiFormatViewer] ScrollToHighlight event received for text document", {
        highlight,
        pageNumber,
      })
      
      // If a specific highlight is provided, scroll to that one
      // Otherwise, scroll to the first highlight
      if (highlight.textSpan) {
        // Find the highlight in our list and scroll to it
        const highlightIndex = textHighlights.findIndex(h => 
          h.textSpan?.start === highlight.textSpan?.start && 
          h.textSpan?.end === highlight.textSpan?.end
        )
        
        if (highlightIndex >= 0) {
          // Update highlightRef to point to this specific highlight
          // We'll need to find it in the DOM after render
          setTimeout(() => {
            const highlightElements = containerRef.current?.querySelectorAll(`.${TEXT_HIGHLIGHT_CLASS}`)
            if (highlightElements && highlightElements[highlightIndex]) {
              highlightRef.current = highlightElements[highlightIndex] as HTMLSpanElement
              scrollToTextHighlight()
            } else {
              // Fallback: scroll to first highlight
              scrollToTextHighlight()
            }
          }, 100)
        } else {
          // Fallback: scroll to first highlight
          setTimeout(() => {
            scrollToTextHighlight()
          }, 100)
        }
      } else {
        // No specific highlight, scroll to first
        setTimeout(() => {
          scrollToTextHighlight()
        }, 100)
      }
    }

    window.addEventListener("scrollToHighlight", handleScrollToHighlight as EventListener)
    return () => window.removeEventListener("scrollToHighlight", handleScrollToHighlight as EventListener)
  }, [documentType, scrollToTextHighlight, textHighlights])

  // Function to render Word document with highlighting
  const highlightedWordContent = useMemo(() => {
    if (!wordContent) {
      return null
    }

    const sanitizedWordContent = DOMPurify.sanitize(wordContent, WORD_HTML_SANITIZE_OPTIONS)

    if (!wordHighlight || !wordHighlight.textSpan || !wordPlainText) {
      return sanitizedWordContent
    }

    const { start, end } = wordHighlight.textSpan

    // Get the text to highlight from plain text
    if (start < 0 || end > wordPlainText.length || end <= start) {
      return sanitizedWordContent
    }

    const textToHighlight = wordPlainText.substring(start, end).trim()
    
    if (textToHighlight.length === 0 || textToHighlight.length > 2000) {
      return sanitizedWordContent
    }

    // Strategy: Find the text in HTML by searching for it
    // We'll search for the text (normalized) in the HTML and wrap it
    const normalizedText = textToHighlight.replace(/\s+/g, ' ').trim()
    
    if (normalizedText.length < 10) {
      return sanitizedWordContent
    }

    // Create a temporary DOM to extract text and find positions
    if (typeof document === 'undefined') {
      return sanitizedWordContent
    }

    const tempDiv = document.createElement("div")
    tempDiv.innerHTML = sanitizedWordContent
    
    // Extract all text nodes and track character positions
    const textNodes: { node: Text; start: number; end: number }[] = []
    let charCount = 0
    
    const walker = document.createTreeWalker(
      tempDiv,
      NodeFilter.SHOW_TEXT,
      null
    )
    
    let node: Node | null
    while ((node = walker.nextNode())) {
      const textNode = node as Text
      const text = textNode.textContent || ""
      const nodeStart = charCount
      const nodeEnd = charCount + text.length
      
      textNodes.push({ node: textNode, start: nodeStart, end: nodeEnd })
      charCount = nodeEnd
    }
    
    // Find the nodes that contain our text span
    const startNodeInfo = textNodes.find(n => start >= n.start && start < n.end)
    const endNodeInfo = textNodes.find(n => end > n.start && end <= n.end)
    
    if (startNodeInfo && endNodeInfo) {
      // We found the nodes - highlight them
      if (startNodeInfo.node === endNodeInfo.node) {
        // Same node - split it
        const textNode = startNodeInfo.node
        const text = textNode.textContent || ""
        const nodeStart = startNodeInfo.start
        const startOffset = start - nodeStart
        const endOffset = end - nodeStart
        
        const before = text.substring(0, startOffset)
        const highlighted = text.substring(startOffset, endOffset)
        const after = text.substring(endOffset)
        
        // Create highlight span
        const highlightSpan = document.createElement("span")
        highlightSpan.className = `bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5 ${WORD_HIGHLIGHT_CLASS}`
        highlightSpan.style.scrollMarginTop = "100px"
        highlightSpan.textContent = highlighted
        
        // Replace the text node
        const parent = textNode.parentNode
        if (parent) {
          if (before) {
            parent.insertBefore(document.createTextNode(before), textNode)
          }
          parent.insertBefore(highlightSpan, textNode)
          if (after) {
            parent.insertBefore(document.createTextNode(after), textNode)
          }
          parent.removeChild(textNode)
        }
      } else {
        // Multiple nodes - highlight from start node to end node
        // We need to wrap all nodes between start and end
        const startNode = startNodeInfo.node
        const endNode = endNodeInfo.node
        const startOffset = start - startNodeInfo.start
        const endOffset = end - endNodeInfo.start
        
        // Find all nodes between start and end
        const nodesToWrap: Text[] = []
        let foundStart = false
        
        const walker2 = document.createTreeWalker(
          tempDiv,
          NodeFilter.SHOW_TEXT,
          null
        )
        
        let node2: Node | null
        while ((node2 = walker2.nextNode())) {
          const textNode = node2 as Text
          if (textNode === startNode) {
            foundStart = true
            nodesToWrap.push(textNode)
          } else if (foundStart) {
            nodesToWrap.push(textNode)
            if (textNode === endNode) {
              break
            }
          }
        }
        
        // Create a wrapper span for the entire highlight
        const highlightSpan = document.createElement("span")
        highlightSpan.className = `bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5 ${WORD_HIGHLIGHT_CLASS}`
        highlightSpan.style.scrollMarginTop = "100px"
        
        // Process each node
        for (let i = 0; i < nodesToWrap.length; i++) {
          const textNode = nodesToWrap[i]
          const text = textNode.textContent || ""
          const nodeStart = textNodes.find(n => n.node === textNode)?.start || 0
          
          if (i === 0) {
            // First node - split at start offset
            const before = text.substring(0, startOffset)
            const highlighted = text.substring(startOffset)
            
            if (before) {
              const parent = textNode.parentNode
              if (parent) {
                parent.insertBefore(document.createTextNode(before), textNode)
              }
            }
            
            // Move the rest into the highlight span
            if (highlighted) {
              const fragment = document.createDocumentFragment()
              fragment.appendChild(document.createTextNode(highlighted))
              highlightSpan.appendChild(fragment)
            }
            
            // Remove the original node
            const parent = textNode.parentNode
            if (parent) {
              parent.removeChild(textNode)
            }
          } else if (i === nodesToWrap.length - 1) {
            // Last node - split at end offset
            const nodeStartPos = textNodes.find(n => n.node === textNode)?.start || 0
            const endOffsetInNode = end - nodeStartPos
            const highlighted = text.substring(0, endOffsetInNode)
            const after = text.substring(endOffsetInNode)
            
            // Move highlighted portion into the highlight span
            if (highlighted) {
              const fragment = document.createDocumentFragment()
              fragment.appendChild(document.createTextNode(highlighted))
              highlightSpan.appendChild(fragment)
            }
            
            // Replace the node with after portion
            const parent = textNode.parentNode
            if (parent) {
              if (after) {
                parent.insertBefore(document.createTextNode(after), textNode)
              }
              parent.removeChild(textNode)
            }
          } else {
            // Middle nodes - move entire content into highlight span
            const fragment = document.createDocumentFragment()
            fragment.appendChild(document.createTextNode(text))
            highlightSpan.appendChild(fragment)
            
            const parent = textNode.parentNode
            if (parent) {
              parent.removeChild(textNode)
            }
          }
        }
        
        // Insert the highlight span where the first node was
        const firstNodeParent = startNode.parentNode
        if (firstNodeParent && highlightSpan.childNodes.length > 0) {
          // Find where to insert - after the before text if it exists, or where startNode was
          const beforeText = Array.from(firstNodeParent.childNodes).find(
            (n) => n.nodeType === Node.TEXT_NODE && n.textContent && n.textContent.trim()
          )
          if (beforeText && beforeText.nextSibling) {
            firstNodeParent.insertBefore(highlightSpan, beforeText.nextSibling)
          } else {
            firstNodeParent.insertBefore(highlightSpan, firstNodeParent.firstChild)
          }
        }
        
        return DOMPurify.sanitize(tempDiv.innerHTML, WORD_HTML_SANITIZE_OPTIONS)
      }
      
      // If multiple nodes or nodes not found, fall through to string-based search
    }
    
    // Fallback: Try simple string search (more reliable for multi-node cases)
    const htmlText = tempDiv.textContent || tempDiv.innerText || ""
    const searchIndex = htmlText.toLowerCase().indexOf(normalizedText.toLowerCase())
    
    if (searchIndex !== -1) {
      // Find the corresponding position in HTML
      let htmlCharCount = 0
      let htmlIndex = 0
      
      // Count characters in HTML (ignoring tags) to find start position
      while (htmlIndex < sanitizedWordContent.length && htmlCharCount < searchIndex) {
        if (sanitizedWordContent[htmlIndex] === '<') {
          while (htmlIndex < sanitizedWordContent.length && sanitizedWordContent[htmlIndex] !== '>') {
            htmlIndex++
          }
          htmlIndex++
        } else {
          htmlCharCount++
          htmlIndex++
        }
      }
      
      // Find end position
      let endHtmlIndex = htmlIndex
      let endHtmlCharCount = htmlCharCount
      while (endHtmlIndex < sanitizedWordContent.length && endHtmlCharCount < searchIndex + normalizedText.length) {
        if (sanitizedWordContent[endHtmlIndex] === '<') {
          while (endHtmlIndex < sanitizedWordContent.length && sanitizedWordContent[endHtmlIndex] !== '>') {
            endHtmlIndex++
          }
          endHtmlIndex++
        } else {
          endHtmlCharCount++
          endHtmlIndex++
        }
      }
      
      // Insert highlight span
      const before = sanitizedWordContent.substring(0, htmlIndex)
      const highlighted = sanitizedWordContent.substring(htmlIndex, endHtmlIndex)
      const after = sanitizedWordContent.substring(endHtmlIndex)
      
      return `${before}<span class="bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5 ${WORD_HIGHLIGHT_CLASS}" style="scroll-margin-top: 100px;">${highlighted}</span>${after}`
    }
    
    return sanitizedWordContent
  }, [wordContent, wordHighlight, wordPlainText])

  const safeWordContentForRender = useMemo(() => {
    if (!highlightedWordContent) {
      return ""
    }

    return DOMPurify.sanitize(highlightedWordContent, WORD_HTML_SANITIZE_OPTIONS)
  }, [highlightedWordContent])

  const sanitizedHtmlContent = useMemo(() => {
    if (!htmlContent) {
      return ""
    }
    return DOMPurify.sanitize(htmlContent, GENERIC_HTML_SANITIZE_OPTIONS)
  }, [htmlContent])

  // Scroll to highlight when Word content loads (after DOM update)
  useEffect(() => {
    if (documentType === "word" && wordHighlight && containerRef.current) {
      // Wait longer for the DOM to be fully rendered with highlighted content
      const timer = setTimeout(() => {
        // Search in the inner content area for the highlight element
        // The Word content is rendered inside innerContentRef, but we need to search in the rendered DOM
        const wordContentDiv = containerRef.current?.querySelector('.word-document-content')
        const highlightElement = wordContentDiv?.querySelector(`.${WORD_HIGHLIGHT_CLASS}`) as HTMLElement
        
        if (highlightElement && containerRef.current) {
          highlightRef.current = highlightElement as HTMLSpanElement
          
          // Get the scrollable container (the one with overflow-y-auto)
          const scrollContainer = containerRef.current
          
          // Calculate scroll position
          // Get the position relative to the scroll container
          const containerRect = scrollContainer.getBoundingClientRect()
          const elementRect = highlightElement.getBoundingClientRect()
          
          // Calculate the scroll position needed to center the element
          const elementTopRelative = elementRect.top - containerRect.top + scrollContainer.scrollTop
          const containerHeight = scrollContainer.clientHeight
          const elementHeight = highlightElement.offsetHeight
          const scrollPosition = elementTopRelative - (containerHeight / 2) + (elementHeight / 2)
          
          scrollContainer.scrollTo({
            top: Math.max(0, scrollPosition),
            behavior: "smooth",
          })
        }
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [documentType, wordHighlight, safeWordContentForRender])

  if (loading) {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Loading document...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    const isAuthError = error.includes("Authentication required") || error.includes("401")
    
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <p className="text-destructive font-medium">{error}</p>
              <div className="space-y-2">
                {isAuthError ? (
                  <p className="text-sm text-muted-foreground">
                    Your session may have expired. Please refresh the page to re-authenticate.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      This might happen if:
                    </p>
                    <ul className="text-sm text-muted-foreground text-left list-disc list-inside space-y-1">
                      <li>The file type is not supported</li>
                      <li>The document is corrupted or invalid</li>
                      <li>The file requires authentication to access</li>
                      <li>There are CORS restrictions preventing access</li>
                    </ul>
                  </>
                )}
                <div className="pt-4 flex gap-2 justify-center flex-wrap">
                  {isAuthError && (
                    <Button 
                      variant="default" 
                      onClick={() => window.location.reload()}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh Page
                    </Button>
                  )}
                  {url && (
                    <>
                      <Button variant="outline" asChild>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open in new tab
                        </a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a href={url} download>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render based on document type
  if (documentType === "pdf") {
    return (
      <PDFViewer
        url={url}
        documentId={documentId}
        highlights={highlights}
        onPageChange={onPageChange}
        initialPage={initialPage}
        className={className}
        hideControls={hideControls}
        viewportOffset={viewportOffset}
        onControlsReady={handlePDFControlsReady}
      />
    )
  }

  if (documentType === "word") {
    return (
      <WordViewer
        className={className}
        hideControls={hideControls}
        scale={scale}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        fitMode={fitMode}
        rotation={rotation}
        containerRef={containerRef}
        contentRef={contentRef}
        innerContentRef={innerContentRef}
        safeWordContent={safeWordContentForRender}
      />
    )
  }

  if (documentType === "html") {
    return (
      <HtmlViewer
        className={className}
        hideControls={hideControls}
        scale={scale}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        sanitizedHtmlContent={sanitizedHtmlContent}
        documentTitle={documentTitle}
      />
    )
  }

  if (documentType === "text") {
    // Render text with multiple highlights
    const renderTextWithHighlights = () => {
      if (!textContent) {
        clientLogger.debug("[MultiFormatViewer] No text content available")
        return null
      }
      
      // If no highlights, return plain text
      if (segments.length === 0) {
        return textContent
      }
      
      clientLogger.debug("[MultiFormatViewer] Rendering text with highlights", {
        highlightCount: processedHighlights.length,
      })
      
      // Render segments with highlights
      return (
        <>
          {segments.map((segment, index) => {
            if (segment.type === 'highlight') {
              // Use highlightRef only for the first highlight (for scrolling)
              const isFirstHighlight = segment.highlightIndex === 0
              // Use slightly different styling for approximate matches to indicate uncertainty
              const isApproximate = segment.confidence === 'approximate'
              // Get quote from highlight if available
              const highlight = processedHighlights[segment.highlightIndex ?? 0] as ContextHighlight | undefined
              const quote = highlight?.quote || segment.content
              
              return (
                <Tooltip key={`highlight-${index}`}>
                  <TooltipTrigger asChild>
                    <span
                      ref={isFirstHighlight ? highlightRef : undefined}
                      className={cn(
                        isApproximate 
                          ? "bg-yellow-200/40 dark:bg-yellow-400/20 rounded px-0.5 border border-yellow-400/50 border-dashed"
                          : "bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5",
                        "animate-in fade-in duration-300 transition-colors hover:bg-yellow-400/60 dark:hover:bg-yellow-500/40",
                        "cursor-pointer",
                        TEXT_HIGHLIGHT_CLASS,
                      )}
                      style={{
                        scrollMarginTop: "100px",
                      }}
                      role="mark"
                      aria-label={`Highlighted quote: ${quote.substring(0, 50)}${quote.length > 50 ? '...' : ''}`}
                    >
                      {segment.content}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-md">
                    <p className="text-sm font-medium mb-1">Quoted text:</p>
                    <p className="text-xs text-muted-foreground">"{quote}"</p>
                    {isApproximate && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                        ⚠️ Approximate match - text position may be slightly off
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            } else {
              return <span key={`text-${index}`}>{segment.content}</span>
            }
          })}
        </>
      )
    }
    
    return (
      <div className={`flex flex-col ${className}`}>
        {!hideControls && (
          <div className="flex items-center justify-between gap-4 border-b bg-card p-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Text Document</span>
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
          <div className="w-full min-h-full flex items-start justify-center" style={{ padding: '2rem' }}>
            <div
              ref={contentRef}
              style={{
                // Fixed width container - width changes only in fit mode
                maxWidth: fitMode ? "100%" : "896px",
                width: fitMode ? "100%" : "896px",
                overflow: "hidden", // Prevent horizontal overflow
              }}
            >
              <div
                ref={innerContentRef}
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  // Scale width inversely so scaled content fits within container
                  width: `${100 / scale}%`,
                }}
              >
                <TooltipProvider>
                  <div className="font-mono text-sm whitespace-pre-wrap">
                    {renderTextWithHighlights()}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Unknown type - show download option
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <p className="text-muted-foreground font-medium">
              This document type is not supported for preview.
            </p>
            <div className="pt-4 flex gap-2 justify-center">
              <Button variant="outline" asChild>
                <a href={url} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download Document
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in new tab
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
