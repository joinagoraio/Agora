"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { PDFViewer, Highlight, type ViewerControls, type ViewerFitMode } from "@/components/pdf-viewer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, ExternalLink, Download, RefreshCw } from "lucide-react"

export type DocumentType = "pdf" | "word" | "html" | "text" | "unknown"

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
  const applyFitRef = useRef<(mode: ViewerFitMode) => void>()
  const isApplyingFitRef = useRef(false)

  // Detect document type and load content
  useEffect(() => {
    const loadDocument = async (retryCount = 0) => {
      setLoading(true)
      setError(null)

      try {
        // Fetch document to detect type
        // For API routes, ensure cookies are included for authentication
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            Accept: "*/*",
          },
          cache: "no-store", // Ensure fresh request
        })

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
              console.warn("Word conversion warnings:", result.messages)
            }
          } catch (err) {
            console.error("Error converting Word document:", err)
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
      } catch (err) {
        console.error("Error loading document:", err)
        setError(err instanceof Error ? err.message : "Failed to load document")
        setLoading(false)
      }
    }

    loadDocument()
  }, [url, documentMetadata])

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

  // Find the highlight for text documents (page 1 or no page specified)
  const textHighlight = documentType === "text" 
    ? highlights.find((h) => !h.pageNumber || h.pageNumber === 1)
    : null

  // Debug logging
  useEffect(() => {
    if (documentType === "text") {
      console.log("[MultiFormatViewer] Text document detected")
      console.log("[MultiFormatViewer] Highlights:", highlights)
      console.log("[MultiFormatViewer] Text highlight:", textHighlight)
      console.log("[MultiFormatViewer] Text content length:", textContent?.length || 0)
    }
  }, [documentType, highlights, textHighlight, textContent])

  // Scroll to highlight when text content loads
  useEffect(() => {
    if (documentType === "text" && textHighlight && highlightRef.current && textContent) {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [documentType, textHighlight, textContent])

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
                  transform: `scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: "top left",
                  // Scale width inversely so scaled content fits within container
                  width: `${100 / scale}%`,
                }}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: wordContent || "" }}
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

  if (documentType === "html") {
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
            srcDoc={htmlContent || ""}
            className="w-full h-full border-0"
            title={documentTitle}
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      </div>
    )
  }

  if (documentType === "text") {
    // Render text with highlighting
    const renderTextWithHighlight = () => {
      if (!textContent) {
        console.log("[MultiFormatViewer] No text content available")
        return null
      }
      
      if (textHighlight && textHighlight.textSpan) {
        const { start, end } = textHighlight.textSpan
        console.log("[MultiFormatViewer] Attempting to highlight textSpan:", { start, end, textContentLength: textContent.length })
        
        // Strategy 1: Try exact position match (works if content matches exactly)
        if (start >= 0 && end <= textContent.length && end > start) {
          const highlighted = textContent.substring(start, end)
          console.log("[MultiFormatViewer] Exact match - highlighted text length:", highlighted.length, "preview:", highlighted.substring(0, 50))
          // Only use if it's a reasonable length and contains actual text
          if (highlighted.length > 0 && highlighted.length < 2000 && highlighted.trim().length > 0) {
            const before = textContent.substring(0, start)
            const after = textContent.substring(end)
            
            console.log("[MultiFormatViewer] Using exact match highlighting")
            return (
              <>
                {before}
                <span
                  ref={highlightRef}
                  className="bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5"
                  style={{
                    scrollMarginTop: "100px",
                  }}
                >
                  {highlighted}
                </span>
                {after}
              </>
            )
          } else {
            console.log("[MultiFormatViewer] Exact match failed - highlighted text invalid:", { length: highlighted.length, trimmed: highlighted.trim().length })
          }
        } else {
          console.log("[MultiFormatViewer] Exact match failed - position out of bounds:", { start, end, textContentLength: textContent.length })
        }
        
        // Strategy 2: If exact position doesn't work, try to find text near the expected position
        // This handles cases where document.content and file content differ slightly
        if (start > 0 && start < textContent.length) {
          // Get a sample of text around the expected position to use as a search pattern
          const sampleStart = Math.max(0, Math.min(start, textContent.length - 100))
          const sampleEnd = Math.min(textContent.length, Math.max(end, sampleStart + 100))
          const sample = textContent.substring(sampleStart, sampleEnd)
          
          // Extract a unique phrase from the sample (3-5 words that are likely to be unique)
          const words = sample.split(/\s+/).filter(w => w.length > 2)
          if (words.length >= 3) {
            // Try different phrase lengths
            for (let phraseLength = Math.min(5, words.length); phraseLength >= 3; phraseLength--) {
              const phrase = words.slice(0, phraseLength).join(" ")
              const normalizedPhrase = phrase.toLowerCase().trim()
              
              if (normalizedPhrase.length > 10) {
                // Search for this phrase in the full content
                const foundIndex = textContent.toLowerCase().indexOf(normalizedPhrase)
                
                if (foundIndex !== -1) {
                  // Found it! Highlight a reasonable section around it
                  const highlightStart = Math.max(0, foundIndex - 30)
                  const highlightEnd = Math.min(textContent.length, foundIndex + phrase.length + 150)
                  const before = textContent.substring(0, highlightStart)
                  const highlighted = textContent.substring(highlightStart, highlightEnd)
                  const after = textContent.substring(highlightEnd)
                  
                  return (
                    <>
                      {before}
                      <span
                        ref={highlightRef}
                        className="bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5"
                        style={{
                          scrollMarginTop: "100px",
                        }}
                      >
                        {highlighted}
                      </span>
                      {after}
                    </>
                  )
                }
              }
            }
          }
          
          // Strategy 3: Last resort - highlight around the expected position even if we can't find exact match
          // This at least gets the user to the right area of the document
          const safeStart = Math.max(0, Math.min(start, textContent.length - 200))
          const safeEnd = Math.min(textContent.length, safeStart + 200)
          const before = textContent.substring(0, safeStart)
          const highlighted = textContent.substring(safeStart, safeEnd)
          const after = textContent.substring(safeEnd)
          
          return (
            <>
              {before}
              <span
                ref={highlightRef}
                className="bg-yellow-300/50 dark:bg-yellow-500/30 rounded px-0.5"
                style={{
                  scrollMarginTop: "100px",
                }}
              >
                {highlighted}
              </span>
              {after}
            </>
          )
        }
      }
      
      // No highlight found or invalid textSpan
      return textContent
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
                <div className="font-mono text-sm whitespace-pre-wrap">
                  {renderTextWithHighlight()}
                </div>
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
