"use client"

import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, ReactNode } from "react"

export interface Highlight {
  id: string
  documentId: string
  textSpan: { start: number; end: number }
  pageNumber: number
  quote: string // Original quoted text for reference
  source?: 'ai_response' | 'user_click' | 'url'
  confidence?: 'exact' | 'normalized' | 'fuzzy' | 'approximate'
  color?: string
  coordinates?: any // For PDF highlights
}

interface HighlightContextValue {
  highlights: Map<string, Highlight[]> // documentId -> highlights
  activeDocumentId: string | null
  autoHighlight: boolean
  setHighlights: (documentId: string, highlights: Highlight[], immediate?: boolean) => void
  addHighlight: (documentId: string, highlight: Highlight) => void
  clearHighlights: (documentId: string) => void
  clearAllHighlights: () => void
  setAutoHighlight: (enabled: boolean) => void
  setActiveDocument: (documentId: string | null) => void
  getHighlights: (documentId: string) => Highlight[]
  // Helper to get highlights for a document (reactive)
  getHighlightsForDocument: (documentId: string) => Highlight[]
}

const HighlightContext = createContext<HighlightContextValue | undefined>(undefined)

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [highlightsMap, setHighlightsMap] = useState<Map<string, Highlight[]>>(new Map())
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [autoHighlight, setAutoHighlightState] = useState(true)
  
  // Debounce timer ref for setHighlights
  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const setHighlights = useCallback((documentId: string, highlights: Highlight[], immediate = false) => {
    // Clear existing debounce timer for this document
    const existingTimer = debounceTimersRef.current.get(documentId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }
    
    const updateHighlights = () => {
      setHighlightsMap(prev => {
        const newMap = new Map(prev)
        newMap.set(documentId, highlights)
        return newMap
      })
      debounceTimersRef.current.delete(documentId)
    }
    
    if (immediate) {
      updateHighlights()
    } else {
      // Debounce updates by 50ms to batch rapid changes
      const timer = setTimeout(updateHighlights, 50)
      debounceTimersRef.current.set(documentId, timer)
    }
  }, [])

  const addHighlight = useCallback((documentId: string, highlight: Highlight) => {
    setHighlightsMap(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(documentId) || []
      // Check for duplicates before adding
      const isDuplicate = existing.some(h => 
        h.textSpan.start === highlight.textSpan.start &&
        h.textSpan.end === highlight.textSpan.end &&
        h.pageNumber === highlight.pageNumber
      )
      if (!isDuplicate) {
        newMap.set(documentId, [...existing, highlight])
      }
      return newMap
    })
  }, [])

  const clearHighlights = useCallback((documentId: string) => {
    setHighlightsMap(prev => {
      const newMap = new Map(prev)
      newMap.delete(documentId)
      return newMap
    })
  }, [])

  const clearAllHighlights = useCallback(() => {
    // Clear any pending timers
    debounceTimersRef.current.forEach(timer => clearTimeout(timer))
    debounceTimersRef.current.clear()

    setHighlightsMap(new Map())
    setActiveDocumentId(null)
  }, [])

  const setAutoHighlight = useCallback((enabled: boolean) => {
    setAutoHighlightState(enabled)
  }, [])

  const setActiveDocument = useCallback((documentId: string | null) => {
    setActiveDocumentId(documentId)
  }, [])

  const getHighlights = useCallback((documentId: string): Highlight[] => {
    return highlightsMap.get(documentId) || []
  }, [highlightsMap])
  
  // Reactive getter that will trigger re-renders when highlights change
  const getHighlightsForDocument = useCallback((documentId: string): Highlight[] => {
    return highlightsMap.get(documentId) || []
  }, [highlightsMap])

  const value = useMemo(() => ({
    highlights: highlightsMap,
    activeDocumentId,
    autoHighlight,
    setHighlights,
    addHighlight,
    clearHighlights,
    setAutoHighlight,
    setActiveDocument,
    getHighlights,
    getHighlightsForDocument,
    clearAllHighlights,
  }), [
    highlightsMap,
    activeDocumentId,
    autoHighlight,
    setHighlights,
    addHighlight,
    clearHighlights,
    clearAllHighlights,
    setAutoHighlight,
    setActiveDocument,
    getHighlights,
    getHighlightsForDocument,
  ])

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      debounceTimersRef.current.forEach(timer => clearTimeout(timer))
      debounceTimersRef.current.clear()
    }
  }, [])

  return (
    <HighlightContext.Provider value={value}>
      {children}
    </HighlightContext.Provider>
  )
}

export function useHighlightContext() {
  const context = useContext(HighlightContext)
  if (context === undefined) {
    throw new Error("useHighlightContext must be used within a HighlightProvider")
  }
  return context
}

export function useOptionalHighlightContext() {
  return useContext(HighlightContext)
}

