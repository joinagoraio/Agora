"use client"

import { TextStreamChatTransport } from "ai"
import { useChat as useAiChat } from "@ai-sdk/react"
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Send, Loader2, ExternalLink, FileText, X, Plus, CircleStop, Highlighter } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import Link from "next/link"
import { buildDocumentUrlFromSource } from "@/lib/utils/document-linking"
import { useHighlightContext, type Highlight } from "@/lib/contexts/highlight-context"
import { parseAllCitations, type ParsedCitation } from "@/lib/utils/citation-parser"
import { getWorkspaceDocuments } from "@/lib/actions/document"
import { getWorkspaceNotesForContext } from "@/lib/actions/workspace-notes"
import type { WorkspaceNoteForContext } from "@/lib/actions/workspace-notes"
import { getWorkspaceItems } from "@/lib/actions/workspace-item"
import { getWorkspaceContextDetails } from "@/lib/actions/workspace"
import { cn } from "@/lib/utils"
import { EvidenceList } from "@/components/chat/evidence-list"
import { clientLogger } from "@/lib/utils/client-logger"
import { fetchCsrfToken } from "@/lib/utils/csrf"

type UseAiChatOptions = Parameters<typeof useAiChat>[0]

function useChatWithInput(options: UseAiChatOptions) {
  const chat = useAiChat(options) as ReturnType<typeof useAiChat>
  const [input, setInput] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value)
  }, [])

  const handleSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
      const trimmed = input.trim()
      if (!trimmed) {
        return
      }

      setIsSubmitting(true)
      try {
        await chat.sendMessage({ text: trimmed })
        setInput("")
      } finally {
        setIsSubmitting(false)
      }
    },
    [chat, input],
  )

  const isLoading = chat.status === "submitted" || chat.status === "streaming" || isSubmitting

  return {
    ...chat,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
  }
}

interface ChatInterfaceProps {
  workspaceId: string
  conversationId: string
  initialMessages?: any[]
  documentId?: string // Optional: when provided, only show this document
}

export function ChatInterface({ workspaceId, conversationId, initialMessages = [], documentId }: ChatInterfaceProps) {
  const highlightContext = useHighlightContext()
  const { setHighlights, setActiveDocument, autoHighlight } = highlightContext
  
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [contextNotes, setContextNotes] = useState<WorkspaceNoteForContext[]>([])
  const [evidenceItems, setEvidenceItems] = useState<any[]>([])
  const [workspaceContextText, setWorkspaceContextText] = useState<string | null>(null)
  const [workspaceLocation, setWorkspaceLocation] = useState<string | null>(null)
  const [hasLoadedWorkspaceMetadata, setHasLoadedWorkspaceMetadata] = useState(false)
  const [excludedDocumentIds, setExcludedDocumentIds] = useState<Set<string>>(new Set())
  const [excludedNoteIds, setExcludedNoteIds] = useState<Set<string>>(new Set())
  const [excludedEvidenceIds, setExcludedEvidenceIds] = useState<Set<string>>(new Set())
  const readMessageContent = useCallback((message: unknown): string => {
    if (!message || typeof message !== "object") {
      return ""
    }

    const extractFromArray = (parts: unknown): string => {
      if (!Array.isArray(parts)) {
        return ""
      }

      return parts
        .map((part) => {
          if (typeof part === "string") {
            return part
          }

          if (part && typeof part === "object") {
            const typedPart = part as { text?: unknown; content?: unknown }
            if (typeof typedPart.text === "string") {
              return typedPart.text
            }
            if (typeof typedPart.content === "string") {
              return typedPart.content
            }
          }

          return ""
        })
        .join("")
    }

    const { content, parts } = message as { content?: unknown; parts?: unknown }

    if (typeof content === "string") {
      return content
    }

    const contentText = extractFromArray(content)
    if (contentText) {
      return contentText
    }

    return extractFromArray(parts)
  }, [])

  const normalizeMessage = useCallback(
    (message: any) => {
      if (!message || typeof message !== "object") {
        return message
      }

      if (Array.isArray(message.parts) && message.parts.length > 0) {
        return message
      }

      const content = readMessageContent(message)
      const ensureId =
        typeof message.id === "string" && message.id.trim().length > 0
          ? message.id
          : `msg-${Math.random().toString(36).slice(2)}`

      const textParts =
        typeof content === "string" && content.length > 0
          ? [
              {
                type: "text",
                text: content,
                state: "done" as const,
              },
            ]
          : []

      return {
        ...message,
        id: ensureId,
        content,
        parts: textParts,
      }
    },
    [readMessageContent],
  )

  const normalizedInitialMessages = useMemo(
    () => initialMessages.map((message) => normalizeMessage(message)),
    [initialMessages, normalizeMessage],
  )
  const requestBodyRef = useRef({
    workspaceId,
    conversationId,
    excludedDocumentIds: Array.from(excludedDocumentIds),
    excludedNoteIds: Array.from(excludedNoteIds),
    excludedEvidenceIds: Array.from(excludedEvidenceIds),
  })

  useEffect(() => {
    requestBodyRef.current = {
      workspaceId,
      conversationId,
      excludedDocumentIds: Array.from(excludedDocumentIds),
      excludedNoteIds: Array.from(excludedNoteIds),
      excludedEvidenceIds: Array.from(excludedEvidenceIds),
    }
  }, [workspaceId, conversationId, excludedDocumentIds, excludedNoteIds, excludedEvidenceIds])

  const chatTransport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        body: () => requestBodyRef.current,
        headers: async () => {
          const csrfToken = await fetchCsrfToken()
          if (!csrfToken) {
            clientLogger.error("[ChatInterface] Missing CSRF token for chat request")
            return {}
          }
          return { "x-csrf-token": csrfToken }
        },
      }),
    [],
  )
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [isLoadingNotes, setIsLoadingNotes] = useState(true)
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const thinkingStartRef = useRef<number | null>(null)
  const [thinkingDurations, setThinkingDurations] = useState<Map<number, number>>(new Map())
  const [lastThinkingDuration, setLastThinkingDuration] = useState<number | null>(null)
  const [ellipsis, setEllipsis] = useState("...")
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [isSwitchingConversation, setIsSwitchingConversation] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pendingEvidence, setPendingEvidence] = useState<{
    messageKey: string
    question: string
    answer: string
    sources: any[]
  } | null>(null)
  const [evidenceConfidence, setEvidenceConfidence] = useState<"low" | "medium" | "high">("medium")
  const [isSavingEvidence, setIsSavingEvidence] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [evidenceStatusByMessage, setEvidenceStatusByMessage] = useState<
    Record<string, { status: "idle" | "saving" | "success" | "error"; error?: string }>
  >({})

  // Fetch workspace documents or single document
  const loadContextItems = useCallback(async () => {
    setIsLoadingDocuments(true)
    setIsLoadingNotes(true)
    setHasLoadedWorkspaceMetadata(false)
    setIsLoadingEvidence((prev) => (prev ? prev : true))

    try {
      const documentsPromise = (async () => {
        const result = await getWorkspaceDocuments(workspaceId)

        if (result.error) {
          clientLogger.error("[ChatInterface] Failed to fetch documents:", result.error)
        }

        if (documentId) {
          if (result.data) {
            const currentDoc = result.data.find((doc: any) => doc.id === documentId)
            return currentDoc ? [currentDoc] : []
          }
          return []
        }

        return result.data ?? []
      })()

      const notesPromise = getWorkspaceNotesForContext(workspaceId)
      const evidencePromise = (async () => {
        const result = await getWorkspaceItems(workspaceId, { inheritance: "local" })
        if (result.error) {
          clientLogger.error("[ChatInterface] Failed to fetch evidence items:", result.error)
          return []
        }
        // Filter for evidence items with include_in_ai_context=true
        return (result.data ?? []).filter(
          (item: any) => item.payload?.type === "evidence" && item.include_in_ai_context === true,
        )
      })()

      const workspaceContextPromise = (async () => {
        const result = await getWorkspaceContextDetails(workspaceId)
        if (result.error) {
          clientLogger.error("[ChatInterface] Failed to fetch workspace context:", result.error)
          return { context: null, location: null }
        }
        return result.data ?? { context: null, location: null }
      })()

      const [documentsData, notesResult, evidenceData, workspaceContextData] = await Promise.all([
        documentsPromise,
        notesPromise,
        evidencePromise,
        workspaceContextPromise,
      ])

      setDocuments(documentsData)

      if (notesResult.error) {
        clientLogger.error("[ChatInterface] Failed to fetch workspace notes:", notesResult.error)
        setContextNotes([])
      } else {
        setContextNotes(notesResult.data)
      }

      setEvidenceItems(evidenceData)
      setWorkspaceContextText(
        typeof workspaceContextData.context === "string" ? workspaceContextData.context : null,
      )
      setWorkspaceLocation(typeof workspaceContextData.location === "string" ? workspaceContextData.location : null)
      setHasLoadedWorkspaceMetadata(true)
    } catch (error) {
      clientLogger.error("[ChatInterface] Failed to load AI context items:", error)
      setDocuments([])
      setContextNotes([])
      setWorkspaceContextText(null)
      setWorkspaceLocation(null)
      setEvidenceItems([])
    } finally {
      setIsLoadingDocuments(false)
      setIsLoadingNotes(false)
      setIsLoadingEvidence(false)
    }
  }, [workspaceId, documentId])

  useEffect(() => {
    loadContextItems()
  }, [loadContextItems])

  // Refresh documents when window gains focus (handles case where user uploads in another tab)
  useEffect(() => {
    const handleFocus = () => {
      loadContextItems()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [loadContextItems])

  // Listen for document upload events
  useEffect(() => {
    const refreshIfMatchingWorkspace = (event: CustomEvent<{ workspaceId?: string }>) => {
      const eventWorkspaceId = event.detail?.workspaceId
      if (!eventWorkspaceId || eventWorkspaceId === workspaceId) {
        clientLogger.debug(
          `[ChatInterface] Context event received (${event.type}), refreshing AI context items`,
        )
        loadContextItems()
      }
    }

    window.addEventListener("documentUploaded" as any, refreshIfMatchingWorkspace as EventListener)
    window.addEventListener("workspaceContextUpdated" as any, refreshIfMatchingWorkspace as EventListener)

    return () => {
      window.removeEventListener("documentUploaded" as any, refreshIfMatchingWorkspace as EventListener)
      window.removeEventListener("workspaceContextUpdated" as any, refreshIfMatchingWorkspace as EventListener)
    }
  }, [workspaceId, loadContextItems])

  useEffect(() => {
    setExcludedDocumentIds(new Set())
    setExcludedNoteIds(new Set())
    setExcludedEvidenceIds(new Set())
  }, [conversationId])

  useEffect(() => {
    setExcludedNoteIds((prev) => {
      const validIds = new Set(contextNotes.map((note) => note.id))
      let hasChanges = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id)
        } else {
          hasChanges = true
        }
      })
      return hasChanges ? next : prev
    })
  }, [contextNotes])

  useEffect(() => {
    setExcludedEvidenceIds((prev) => {
      const validIds = new Set(evidenceItems.map((item) => item.id))
      let hasChanges = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id)
        } else {
          hasChanges = true
        }
      })
      return hasChanges ? next : prev
    })
  }, [evidenceItems])

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, stop, setInput } = useChatWithInput({
    transport: chatTransport,
    messages: hasLoadedInitial ? undefined : (normalizedInitialMessages as any),
  })

  // useChat may briefly return undefined before hydration; always work with a string
  const safeInput = typeof input === "string" ? input : input != null ? String(input) : ""

  // Define handleHighlight before useEffects that use it
  const handleHighlight = useCallback(async (message: any) => {
    if (!documentId) {
      clientLogger.warn("[handleHighlight] No documentId provided")
      return
    }

    const sources = Array.isArray(message?.sources) ? message.sources : []
    clientLogger.debug("[handleHighlight] Looking for relevant sources:", {
      documentId,
      sourcesCount: sources.length,
      sources: sources.map((s: any) => ({
        id: s.id,
        pageNumber: s.pageNumber,
        textSpan: s.textSpan,
        matches: s.id === documentId,
      })),
    })

    // Find ALL sources that match the current document and have highlight info
    let relevantSources = sources.filter(
      (source: any) =>
        source.id === documentId &&
        (source.pageNumber !== undefined || source.textSpan !== undefined)
    )

    // Always try to extract quoted phrases from the AI response to find additional highlights
    // This ensures we highlight all phrases the AI mentions, not just what's in the sources
    const messageContent = readMessageContent(message)
    if (messageContent) {
      clientLogger.debug("[handleHighlight] Extracting citations from AI response to find highlights")
      
      // Parse structured citations and fallback quotes
      const { structured, quotes, listItems } = parseAllCitations(messageContent)
      
      clientLogger.debug("[handleHighlight] Parsed citations:", {
        structured: structured.length,
        quotes: quotes.length,
        listItems: listItems.length,
      })
      
      // Process structured citations first (most accurate)
      const structuredHighlights: Highlight[] = []
      for (const citation of structured) {
        if (citation.structured) {
          const { quote, documentId: citationDocId, textSpan, pageNumber } = citation.structured
          
          // Only process if it matches the current document
          const targetDocId: string | undefined = citationDocId || documentId
          if (targetDocId === documentId && textSpan) {
            structuredHighlights.push({
              id: `highlight-${documentId}-${pageNumber || 1}-${Date.now()}-${structuredHighlights.length}`,
              documentId: documentId!,
              textSpan,
              pageNumber: pageNumber || 1,
              quote,
              source: 'ai_response' as const,
              color: "rgba(255, 255, 0, 0.3)",
            })
          }
        }
      }
      
      // If we have structured citations, use them directly (most accurate)
      if (structuredHighlights.length > 0) {
        clientLogger.debug("[handleHighlight] Using structured citations:", structuredHighlights.length)
        
        // Combine with source-based highlights
        const sourceHighlights = relevantSources.map((source: any, index: number) => {
          const pageForHighlight = source.pageNumber ?? 1
          return {
            id: `highlight-${source.id}-${pageForHighlight}-${index}`,
            documentId: documentId!,
            pageNumber: pageForHighlight,
            textSpan: source.textSpan!,
            quote: "",
            source: 'ai_response' as const,
            color: "rgba(255, 255, 0, 0.3)",
          }
        })
        
        // Combine and deduplicate
        const combinedHighlights = [...sourceHighlights, ...structuredHighlights]
        const uniqueHighlights = combinedHighlights.filter((h, index, self) => 
          index === self.findIndex((h2) => 
            h2.pageNumber === h.pageNumber &&
            h2.textSpan?.start === h.textSpan?.start &&
            h2.textSpan?.end === h.textSpan?.end
          )
        )
        
        // Use immediate update for structured citations (they're already accurate)
        setHighlights(documentId!, uniqueHighlights, true)
        setActiveDocument(documentId!)
        
        // Navigate to document if not already there
        const currentPath = window.location.pathname
        const targetPath = `/workspaces/${workspaceId}/documents/${documentId}`
        if (currentPath !== targetPath) {
          const url = new URL(targetPath, window.location.origin)
          const currentConversationId = searchParams.get("conversationId")
          if (currentConversationId) {
            url.searchParams.set("conversationId", currentConversationId)
          }
          router.push(url.pathname + url.search)
        }
        return
      }
      
      // Fallback: Use regex-based extraction if no structured citations
      clientLogger.debug("[handleHighlight] No structured citations found, using fallback extraction")
      
      // Combine all phrases and clean them up
      // Prioritize quoted phrases as they're most likely to be exact matches
      const allPhrases = [...new Set([
        ...quotes, // Quoted phrases first (most reliable)
        ...listItems, // List items second (common in structured responses)
      ])]
      
        .map((p: string) => p.replace(/^["']|["']$/g, "").trim()) // Remove quotes
        .filter((p: string) => {
          // Filter out generic phrases that match section headers but not content
          const lower = p.toLowerCase()
          // Skip if it's just a section header pattern (e.g., "Positive Findings", "Summary", etc.)
          if (lower.length < 30 && /^(positive|negative|findings?|summary|conclusion|introduction|overview|details?|results?)$/i.test(lower)) {
            return false
          }
          return p.length >= 5 && p.length < 300
        })
        .slice(0, 15) // Limit to 15 phrases
      
      clientLogger.debug("[handleHighlight] All extracted phrases (fallback):", allPhrases)
      
      if (allPhrases.length > 0) {
        // Show loading state (optional - could add a toast notification here)
        clientLogger.debug("[handleHighlight] Searching for phrases in document...")
        try {
          // Search for phrases in the document
          const response = await fetch(`/api/documents/${documentId}/search-phrases`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phrases: allPhrases }),
          })
          
          if (response.ok) {
            const result = await response.json()
            const foundHighlights = result.highlights || []
            clientLogger.debug("[handleHighlight] Found highlights from phrase search:", foundHighlights)
            
            if (foundHighlights && foundHighlights.length > 0) {
              // Combine highlights from sources and phrase search
              // Sources with textSpan take priority, but add phrase-based highlights too
              const sourceHighlights = relevantSources.map((source: any, index: number) => {
                const pageForHighlight = source.pageNumber ?? 1
                const highlightId = source.textSpan 
                  ? `highlight-${source.id}-${pageForHighlight}-${index}` 
                  : undefined
                
                return {
                  id: highlightId || `highlight-${index}`,
                  pageNumber: pageForHighlight,
                  textSpan: source.textSpan,
                  color: "rgba(255, 255, 0, 0.3)",
                }
              })
              
              // Combine and deduplicate highlights (prefer source-based if same textSpan)
              const combinedHighlights = [...sourceHighlights, ...foundHighlights]
              const uniqueHighlights = combinedHighlights.filter((h, index, self) => 
                index === self.findIndex((h2) => 
                  h2.pageNumber === h.pageNumber &&
                  h2.textSpan?.start === h.textSpan?.start &&
                  h2.textSpan?.end === h.textSpan?.end
                )
              )
              
              // Convert to Highlight format and set via context
              const contextHighlights: Highlight[] = uniqueHighlights.map((h, index) => ({
                id: h.id || `highlight-${documentId}-${index}`,
                documentId: documentId!,
                textSpan: h.textSpan!,
                pageNumber: h.pageNumber,
                quote: "", // Will be filled from message content if available
                source: 'ai_response' as const,
                color: h.color || "rgba(255, 255, 0, 0.3)",
                coordinates: h.coordinates,
              }))
              
              // Set highlights in context (debounced for phrase search results)
              setHighlights(documentId!, contextHighlights, false)
              setActiveDocument(documentId!)
              
              // Navigate to document if not already there
              const currentPath = window.location.pathname
              const targetPath = `/workspaces/${workspaceId}/documents/${documentId}`
              if (currentPath !== targetPath) {
                const url = new URL(targetPath, window.location.origin)
                const currentConversationId = searchParams.get("conversationId")
                if (currentConversationId) {
                  url.searchParams.set("conversationId", currentConversationId)
                }
                router.push(url.pathname + url.search)
              }
              return
            }
          }
        } catch (error) {
          clientLogger.error("[handleHighlight] Error searching for phrases:", error)
        }
      }
    }

    // Fallback: if we have sources with textSpan but no phrase matches, use those
    if (relevantSources.length > 0) {
      clientLogger.debug("[handleHighlight] Found relevant sources:", relevantSources.length, relevantSources)
      
      // Convert sources to Highlight format
      const contextHighlights: Highlight[] = relevantSources.map((source: any, index: number) => {
        const pageForHighlight = source.pageNumber ?? 1
        const highlightId = source.textSpan 
          ? `highlight-${source.id}-${pageForHighlight}-${index}` 
          : `highlight-${index}`
        
        return {
          id: highlightId,
          documentId: documentId!,
          textSpan: source.textSpan!,
          pageNumber: pageForHighlight,
          quote: "", // Source-based highlights don't have quotes
          source: 'ai_response' as const,
          color: "rgba(255, 255, 0, 0.3)",
        }
      })
      
      clientLogger.debug("[handleHighlight] Built highlights array:", contextHighlights)
      
      // Set highlights in context (use immediate for source-based highlights)
      setHighlights(documentId!, contextHighlights, true)
      setActiveDocument(documentId!)
      
      // Navigate to document if not already there
      const currentPath = window.location.pathname
      const targetPath = `/workspaces/${workspaceId}/documents/${documentId}`
      if (currentPath !== targetPath) {
        const url = new URL(targetPath, window.location.origin)
        const currentConversationId = searchParams.get("conversationId")
        if (currentConversationId) {
          url.searchParams.set("conversationId", currentConversationId)
        }
        router.push(url.pathname + url.search)
      }
    } else {
      clientLogger.warn("[handleHighlight] No relevant source found with highlight info")
    }
  }, [documentId, workspaceId, searchParams, router, setHighlights, setActiveDocument])

  // Fetch sources and thinking_duration for the last assistant message after streaming completes
  // Also auto-highlight quotes if we're in document view mode
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      const lastMessage = messages[messages.length - 1] as any
      // If the last message is an assistant message without sources or thinking_duration, fetch them
      if (lastMessage.role === "assistant" && (!lastMessage.sources || lastMessage.thinking_duration === undefined)) {
        // Small delay to ensure the message is saved to DB
        const timer = setTimeout(async () => {
          try {
            const { getConversationMessages } = await import("@/lib/actions/conversation")
            const result = await getConversationMessages(conversationId)
            if (result.data && result.data.length > 0) {
              const dbLastMessage = result.data[result.data.length - 1]
              if (dbLastMessage.role === "assistant") {
                // Update the message with sources and thinking_duration from database
                setMessages((prev) => {
                  const updated = [...prev]
                  const lastIndex = updated.length - 1
                  if (lastIndex >= 0) {
                    const lastMsg = updated[lastIndex] as any
                    if (lastMsg.role === "assistant") {
                      updated[lastIndex] = {
                        ...lastMsg,
                        sources: dbLastMessage.sources || lastMsg.sources,
                        thinking_duration:
                          dbLastMessage.thinking_duration !== null && dbLastMessage.thinking_duration !== undefined
                            ? dbLastMessage.thinking_duration
                            : lastMsg.thinking_duration,
                      } as any
                    }
                  }
                  return updated
                })
                
                // Auto-highlight quotes if we're in document view mode
                // Check if we're on a document page by checking if documentId is set
                // Note: We'll trigger this via a custom event to avoid dependency issues
                if (documentId && dbLastMessage.content) {
                  // Small delay to ensure message is updated in state
                  setTimeout(() => {
                    // Directly call handleHighlight with the message
                    handleHighlight({
                      ...dbLastMessage,
                      sources: dbLastMessage.sources || [],
                    })
                  }, 300)
                }
              }
            }
          } catch (error) {
            clientLogger.error("Failed to fetch message sources:", error)
          }
        }, 500) // Wait 500ms for DB write to complete

        return () => clearTimeout(timer)
      } else if (lastMessage.role === "assistant" && documentId && lastMessage.content) {
        // If message already has sources, auto-highlight immediately
        // This handles the case where sources are already available
        const timer = setTimeout(() => {
          handleHighlight(lastMessage)
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [isLoading, messages, conversationId, setMessages, documentId, handleHighlight])

  // Track previous conversationId to detect changes
  const prevConversationIdRef = useRef<string | undefined>(conversationId)

  // Reset hasLoadedInitial when conversationId changes so useChat accepts new initialMessages
  useEffect(() => {
    if (prevConversationIdRef.current !== conversationId) {
      prevConversationIdRef.current = conversationId
      setHasLoadedInitial(false)
      // Clear input when conversation changes
      setInput("")
    }
  }, [conversationId, setInput])

  // Track previous conversationId to detect changes
  const prevConversationIdForMessagesRef = useRef<string | undefined>(conversationId)
  const prevInitialMessagesLengthRef = useRef<number>(normalizedInitialMessages.length)

  useEffect(() => {
    clientLogger.debug("[ChatInterface] Messages effect:", {
      hasLoadedInitial,
      initialMessagesCount: initialMessages.length,
      conversationId,
      prevConversationId: prevConversationIdForMessagesRef.current,
      isLoading,
    })

    const conversationChanged = prevConversationIdForMessagesRef.current !== conversationId
    const initialMessagesChanged = prevInitialMessagesLengthRef.current !== normalizedInitialMessages.length

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (!hasLoadedInitial) {
      // Initial load - load messages from initialMessages
      clientLogger.debug("[ChatInterface] Loading initial messages:", normalizedInitialMessages.length)
      if (normalizedInitialMessages.length > 0) {
        setMessages(normalizedInitialMessages)
      } else {
        setMessages([])
      }
      setHasLoadedInitial(true)
      prevConversationIdForMessagesRef.current = conversationId
      prevInitialMessagesLengthRef.current = normalizedInitialMessages.length
    } else if (conversationChanged && conversationId) {
      // Conversation changed - sync with initialMessages
      // This happens when switching between conversations
      clientLogger.debug("[ChatInterface] Conversation changed, syncing messages")
      setIsSwitchingConversation(true)
      if (normalizedInitialMessages.length > 0) {
        setMessages(normalizedInitialMessages)
        setIsSwitchingConversation(false)
      } else {
        // If no messages yet, keep old messages visible briefly to avoid placeholder flash
        // They'll be cleared when new messages arrive
        setMessages([])
        // Set a timeout to clear the switching state if messages don't arrive
        timeoutId = setTimeout(() => {
          setIsSwitchingConversation(false)
        }, 500)
      }
      prevConversationIdForMessagesRef.current = conversationId
      prevInitialMessagesLengthRef.current = normalizedInitialMessages.length
    } else if (initialMessagesChanged && !isLoading && conversationId && !conversationChanged) {
      // initialMessages updated for current conversation (e.g., after loadMessages completes)
      // Only sync if we're not currently loading to avoid overwriting streaming messages
      // and conversation hasn't changed (to avoid double-syncing)
      clientLogger.debug("[ChatInterface] initialMessages updated, syncing messages")
      if (normalizedInitialMessages.length > 0) {
        setMessages(normalizedInitialMessages)
        setIsSwitchingConversation(false)
      } else {
        setMessages([])
      }
      prevInitialMessagesLengthRef.current = normalizedInitialMessages.length
    }

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
    // Don't sync messages on every render - let useChat hook manage messages during streaming
    // Only sync when conversation changes, on initial load, or when initialMessages updates
  }, [normalizedInitialMessages, hasLoadedInitial, setMessages, conversationId, isLoading])

  // Focus input field when a new conversation is started
  useEffect(() => {
    // Focus when conversation is empty and has loaded initial state
    if (messages.length === 0 && hasLoadedInitial && conversationId) {
      // Small delay to ensure the textarea is rendered and visible
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [messages.length, hasLoadedInitial, conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    if (isLoading) {
      thinkingStartRef.current = Date.now()
      setLastThinkingDuration(null)
      setEllipsis(".")

      interval = setInterval(() => {
        setEllipsis((prev) => {
          if (prev.length >= 3) {
            return "."
          }
          return prev + "."
        })
      }, 350)
    } else {
      if (thinkingStartRef.current) {
        const duration = (Date.now() - thinkingStartRef.current) / 1000
        setLastThinkingDuration(duration)
        // Store duration for the last assistant message (should be the last message in the array)
        // Note: The message might not exist yet when isLoading becomes false, so we also have
        // a separate useEffect that watches for message changes to store the duration
        if (messages.length > 0) {
          const lastMessageIndex = messages.length - 1
          const lastMessage = messages[lastMessageIndex]
          if (lastMessage?.role === "assistant") {
            setThinkingDurations((prev) => {
              const newMap = new Map(prev)
              // Always set the duration for this index to ensure it's stored
              newMap.set(lastMessageIndex, duration)
              return newMap
            })
          }
        }
        thinkingStartRef.current = null
      }
      setEllipsis("...")
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isLoading, messages])

  // Store duration for new assistant messages when they appear
  // This ensures duration is preserved even if messages array is updated
  // This is important because the message might be added after isLoading becomes false
  useEffect(() => {
    if (lastThinkingDuration !== null && messages.length > 0) {
      const lastMessageIndex = messages.length - 1
      const lastMessage = messages[lastMessageIndex]
      if (lastMessage?.role === "assistant") {
        // Store the duration for this message index
        // This ensures duration persists even when messages are updated (e.g., sources added)
        setThinkingDurations((prev) => {
          const newMap = new Map(prev)
          const existingDuration = newMap.get(lastMessageIndex)
          // Update if we don't have a duration for this index, or if existing is 0 or invalid
          if (existingDuration === undefined || existingDuration === 0 || existingDuration === null) {
            newMap.set(lastMessageIndex, lastThinkingDuration)
          }
          return newMap
        })
      }
    }
  }, [messages, lastThinkingDuration])

  const formatDuration = (duration: number) => {
    if (duration < 1) {
      return duration.toFixed(2)
    }

    if (duration < 10) {
      return duration.toFixed(1)
    }

    return Math.round(duration).toString()
  }

  const handleRemoveDocument = (documentId: string) => {
    setExcludedDocumentIds((prev) => {
      const newSet = new Set(prev)
      newSet.add(documentId)
      return newSet
    })
  }

  const handleRestoreDocument = (documentId: string) => {
    setExcludedDocumentIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(documentId)
      return newSet
    })
  }

  const handleRemoveNote = (noteId: string) => {
    setExcludedNoteIds((prev) => {
      const newSet = new Set(prev)
      newSet.add(noteId)
      return newSet
    })
  }

  const handleRestoreNote = (noteId: string) => {
    setExcludedNoteIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(noteId)
      return newSet
    })
  }

  const handleRemoveEvidence = (evidenceId: string) => {
    setExcludedEvidenceIds((prev) => {
      const newSet = new Set(prev)
      newSet.add(evidenceId)
      return newSet
    })
  }

  const handleRestoreEvidence = (evidenceId: string) => {
    setExcludedEvidenceIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(evidenceId)
      return newSet
    })
  }

  const handleClearMessages = () => {
    setMessages([])
    setLastThinkingDuration(null)
    setThinkingDurations(new Map())
  }

  const handleStop = () => {
    stop()
    // Find the last user message and restore it to input
    const lastUserMessage = [...messages].reverse().find((msg: any) => msg.role === "user")
    if (lastUserMessage) {
      setInput(readMessageContent(lastUserMessage))
    }
    // Remove any incomplete assistant message
    setMessages((prev: any[]) => {
      const filtered = prev.filter((msg: any, index: number) => {
        // Remove the last message if it's an incomplete assistant message
        if (index === prev.length - 1 && msg.role === "assistant") {
          return false
        }
        return true
      })
      return filtered
    })
  }

  const getMessageKey = (message: any, index: number) => {
    if (message?.id && typeof message.id === "string") {
      return message.id
    }
    return `index-${index}`
  }

  const findPreviousUserQuestion = (messageIndex: number) => {
    for (let i = messageIndex - 1; i >= 0; i--) {
      const candidate = messages[i] as any
      const candidateContent = readMessageContent(candidate)
      if (candidate?.role === "user" && candidateContent.trim().length > 0) {
        return candidateContent
      }
    }
    return ""
  }

  const updateEvidenceStatus = (messageKey: string, status: "idle" | "saving" | "success" | "error", error?: string) => {
    setEvidenceStatusByMessage((prev) => ({
      ...prev,
      [messageKey]: { status, error },
    }))
  }

  const handleOpenEvidenceDialog = (message: any, index: number) => {
    const messageKey = getMessageKey(message, index)
    const question = findPreviousUserQuestion(index)
    if (!question) {
      updateEvidenceStatus(messageKey, "error", "Could not locate the related question for this answer.")
      setTimeout(() => {
        setEvidenceStatusByMessage((prev) => {
          const next = { ...prev }
          if (next[messageKey]?.status === "error") {
            next[messageKey] = { status: "idle" }
          }
          return next
        })
      }, 3000)
      return
    }

    setEvidenceConfidence("medium")
    setEvidenceError(null)
    setPendingEvidence({
      messageKey,
      question,
      answer: readMessageContent(message),
      sources: Array.isArray((message as any)?.sources) ? (message as any).sources : [],
    })
  }

  const handleCloseEvidenceDialog = () => {
    if (isSavingEvidence) {
      return
    }
    setPendingEvidence(null)
    setEvidenceError(null)
  }

  const handleSaveEvidence = async () => {
    if (!pendingEvidence) {
      return
    }

    const { messageKey, question, answer, sources } = pendingEvidence

    if (!question.trim() || !answer.trim()) {
      setEvidenceError("The question or answer is empty. Try again after the response finishes.")
      return
    }

    const citations = (sources ?? []).map((source: any) => ({
      title: typeof source?.title === "string" && source.title.trim().length > 0 ? source.title : "Workspace document",
      url: typeof source?.url === "string" ? source.url : undefined,
      docId: typeof source?.id === "string" ? source.id : undefined,
      page: typeof source?.pageNumber === "number" ? source.pageNumber : undefined,
      layer:
        source?.layer === "national" ||
        source?.layer === "regional" ||
        source?.layer === "municipal" ||
        source?.layer === "local"
          ? source.layer
          : "local",
    }))

    setEvidenceError(null)
    setIsSavingEvidence(true)
    updateEvidenceStatus(messageKey, "saving")

    try {
      const csrfToken = await fetchCsrfToken()
      if (!csrfToken) {
        throw new Error("Unable to fetch CSRF token")
      }

      const response = await fetch("/api/evidence/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          workspaceId,
          question,
          answer,
          citations,
          confidence: evidenceConfidence,
          conversationId: documentId ? conversationId : undefined, // Only include if in document viewer context
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const errorMessage = typeof payload?.error === "string" ? payload.error : "Failed to save evidence."
        setEvidenceError(errorMessage)
        updateEvidenceStatus(messageKey, "error", errorMessage)
      } else {
        updateEvidenceStatus(messageKey, "success")
        setPendingEvidence(null)
        router.refresh()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save evidence."
      setEvidenceError(message)
      updateEvidenceStatus(messageKey, "error", message)
    } finally {
      setIsSavingEvidence(false)
    }
  }

  const getDocumentOrigin = (doc: any): string | null => {
    const metadata = doc?.metadata
    if (!metadata || typeof metadata !== "object") {
      return null
    }
    const originValue = (metadata as Record<string, any>).origin
    return typeof originValue === "string" ? originValue : null
  }

  const sourceDocuments = documents.filter((doc) => {
    const origin = getDocumentOrigin(doc)
    return origin !== "space_scope"
  })
  const inheritedDocuments = documents.filter((doc) => {
    const origin = getDocumentOrigin(doc)
    return origin === "space_scope"
  })

  const availableSourceDocuments = sourceDocuments.filter((doc) => !excludedDocumentIds.has(doc.id))
  const excludedSourceDocuments = sourceDocuments.filter((doc) => excludedDocumentIds.has(doc.id))
  const availableInheritedDocuments = inheritedDocuments.filter((doc) => !excludedDocumentIds.has(doc.id))
  const excludedInheritedDocuments = inheritedDocuments.filter((doc) => excludedDocumentIds.has(doc.id))
  
  const availableNotes = contextNotes.filter((note) => !excludedNoteIds.has(note.id))
  const excludedNotes = contextNotes.filter((note) => excludedNoteIds.has(note.id))
  const availableEvidence = evidenceItems.filter((item) => !excludedEvidenceIds.has(item.id))
  const excludedEvidence = evidenceItems.filter((item) => excludedEvidenceIds.has(item.id))
  const isContextLoading = isLoadingDocuments || isLoadingNotes || isLoadingEvidence
  const hasContextItems =
    hasLoadedWorkspaceMetadata || documents.length > 0 || contextNotes.length > 0 || evidenceItems.length > 0

  const emptyStateDescription = documentId
    ? "Ask questions about your document and get instant answers"
    : "Ask questions about your documents and get instant answers"

  const inputPlaceholder = documentId
    ? "Ask a question about your document..."
    : "Ask a question about your documents..."

  // Pre-compute badge information for all messages to prevent flash
  const allBadgeInfo = useMemo(() => {
    const messageBadgeMaps = new Map<number, Map<string, { type: 'doc' | 'scope', source?: any, hasDocCitation: boolean }>>()
    
    messages.forEach((message: any, index: number) => {
      const sources = Array.isArray(message?.sources) ? message.sources : []
      const content = readMessageContent(message)
      
      // Debug logging for last message
      if (index === messages.length - 1 && message.role === 'assistant') {
        clientLogger.debug("[ChatInterface] Pre-computing badges for message:", {
          index,
          contentLength: content.length,
          contentPreview: content.substring(0, 300),
          sourcesCount: sources.length,
          hasQuotes: content.includes('"'),
          hasDocCitations: content.includes('[doc]')
        })
      }
      
      const quoteRegex = /"([^"]+)"(\s*\[doc\])?/g
      const badgeMap = new Map<string, { type: 'doc' | 'scope', source?: any, hasDocCitation: boolean }>()
      let match
      
      while ((match = quoteRegex.exec(content)) !== null) {
        const quotedText = match[1]
        const hasDocCitation = !!match[2]
        
        // Determine badge type - if [doc] is present, it's always 'doc'
        let badgeType: 'doc' | 'scope' = 'scope'
        let source: any = undefined
        
        if (hasDocCitation) {
          badgeType = 'doc'
          // Try to find the source
          source = sources.find((s: any) => {
            if (documentId && s.id === documentId) {
              if (s.preview && s.preview.toLowerCase().includes(quotedText.toLowerCase().substring(0, 20))) {
                return true
              }
              if (s.textSpan || s.pageNumber !== undefined) {
                return true
              }
            }
            if (s.textSpan || s.pageNumber !== undefined) {
              if (s.preview && s.preview.toLowerCase().includes(quotedText.toLowerCase().substring(0, 20))) {
                return true
              }
              return true
            }
            return false
          })
        } else if (documentId) {
          // Try to find a document source
          source = sources.find((s: any) => {
            if (s.id === documentId) {
              if (s.preview && s.preview.toLowerCase().includes(quotedText.toLowerCase().substring(0, 20))) {
                return true
              }
              if (s.textSpan || s.pageNumber !== undefined) {
                return true
              }
            }
            if (s.textSpan || s.pageNumber !== undefined) {
              if (s.preview && s.preview.toLowerCase().includes(quotedText.toLowerCase().substring(0, 20))) {
                return true
              }
              return true
            }
            return false
          })
          
          if (source) {
            badgeType = 'doc'
          }
        }
        
        badgeMap.set(quotedText, { type: badgeType, source, hasDocCitation })
      }
      
      // Also extract list items that should have highlight icons
      // Look for list items after phrases like "These include:", "are:", etc.
      const lines = content.split(/\n/)
      let inListContext = false
      const listItems: string[] = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        
        // Detect list context (after "include:", "are:", "listed:", etc.)
        if (/^(these|they|it|the document|the text|the context)\s+(include|includes|are|is|lists?|mentions?|refers? to|contains?)/i.test(line)) {
          inListContext = true
          continue
        }
        
        // If we're in list context, extract list items
        if (inListContext) {
          // Match lines that look like list items (standalone capitalized phrases, or lines starting with -/*)
          const listItemMatch = line.match(/^[-•*]\s*(.+)$/) || 
                               (line.length > 3 && line.length < 100 && /^[A-Z][^.!?]*$/.test(line) ? line : null)
          
          if (listItemMatch) {
            const rawItem =
              typeof listItemMatch === "string"
                ? listItemMatch
                : typeof listItemMatch[1] === "string"
                  ? listItemMatch[1]
                  : listItemMatch[0]
            const item = rawItem.trim()
            // Filter out common non-content words and very short items
            if (item.length >= 5 && item.length < 200 && 
                !/^(and|or|each|these|they|it)$/i.test(item)) {
              listItems.push(item)
              // Add to badge map as document citation
              if (!badgeMap.has(item)) {
                badgeMap.set(item, { type: 'doc', hasDocCitation: true })
              }
            }
          }
          
          // Stop list context after empty line or new sentence
          if (line === "" || /^[A-Z][^.!?]*[.!?]$/.test(line)) {
            inListContext = false
          }
        }
      }
      
      messageBadgeMaps.set(index, badgeMap)
    })
    
    return messageBadgeMaps
  }, [messages, documentId])

  return (
    <div className="flex h-full flex-col">
      {messages.length > 0 && (
        <div className="flex items-center justify-end px-4 py-2 bg-card gap-2 min-h-[40px]">
          {!isClearConfirmOpen ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 h-6"
              disabled={isLoading}
              onClick={() => setIsClearConfirmOpen(true)}
            >
              <X className="h-3.5 w-3.5" />
              Clear chat
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 text-xs h-6">
              <span className="text-muted-foreground">Clear this conversation?</span>
              <button
                type="button"
                className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors h-6"
                onClick={() => setIsClearConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-2 py-1 text-destructive hover:text-destructive/80 transition-colors h-6"
                onClick={() => {
                  handleClearMessages()
                  setIsClearConfirmOpen(false)
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
      <div
        className={cn(
          "flex-1 space-y-4 p-4",
          messages.length > 0 ? "overflow-y-auto chat-scrollable" : "overflow-hidden",
        )}
      >
        {messages.length === 0 && !isLoading && !isSwitchingConversation && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <h3 className="mb-2 text-lg font-semibold">Start a conversation</h3>
              <p className="text-sm text-muted-foreground">{emptyStateDescription}</p>
            </div>
          </div>
        )}

        {messages.map((message: any, index: number) => {
          const isUser = message.role === "user"
          const isAssistant = message.role === "assistant"
          const isLastAssistant = isAssistant && index === messages.length - 1
          const shouldShowThinkingTooltip = isAssistant && (!isLastAssistant || !isLoading)
          const messageKey = getMessageKey(message, index)
          const evidenceStatusEntry = evidenceStatusByMessage[messageKey]
          const evidenceStatus = evidenceStatusEntry?.status ?? "idle"
          
          // Process message content to add source badges after quoted text
          const sources = Array.isArray(message?.sources) ? message.sources : []
          
          // Get pre-computed badge info for this message
          const badgeInfoMap = allBadgeInfo.get(index) || new Map()
          
          // Function to find the source for a quoted phrase (uses pre-computed map)
          const findSourceForQuote = (quotedText: string, hasDocCitation: boolean = false): { type: 'doc' | 'scope', source?: any } => {
            // Use pre-computed badge info if available - this prevents flash
            const cached = badgeInfoMap.get(quotedText)
            if (cached) {
              return { type: cached.type, source: cached.source }
            }
            
            // Fallback: if [doc] citation is present, return doc type immediately
            if (hasDocCitation) {
              return { type: 'doc' }
            }
            
            // Otherwise, return scope (shouldn't happen if badgeInfoMap is working correctly)
            return { type: 'scope' }
          }
          
          // Function to handle badge click - highlight specific reference
          const handleBadgeClick = async (quotedText: string, sourceInfo: { type: 'doc' | 'scope', source?: any }) => {
            if (sourceInfo.type === 'doc') {
              // Get documentId from source if not provided in props
              const targetDocumentId = documentId || sourceInfo.source?.id
              if (!targetDocumentId) {
                clientLogger.warn("[handleBadgeClick] No documentId available")
                return
              }
              // If we have a source with pageNumber and textSpan, use them directly
              if (sourceInfo.source && sourceInfo.source.pageNumber !== undefined && sourceInfo.source.textSpan) {
                const source = sourceInfo.source
                const contextHighlight: Highlight = {
                  id: `highlight-${targetDocumentId}-${source.pageNumber}-${Date.now()}`,
                  documentId: targetDocumentId,
                  pageNumber: source.pageNumber,
                  textSpan: source.textSpan,
                  quote: quotedText,
                  source: 'user_click' as const,
                  color: "rgba(255, 255, 0, 0.3)",
                  coordinates: source.coordinates,
                }
                
                // Set single highlight in context (for icon click, only show this one)
                // Use immediate update for user clicks (better UX)
                setHighlights(targetDocumentId, [contextHighlight], true)
                setActiveDocument(targetDocumentId)
                
                // Navigate to document if not already there
                const currentPath = window.location.pathname
                const targetPath = `/workspaces/${workspaceId}/documents/${targetDocumentId}`
                if (currentPath !== targetPath) {
                  const url = new URL(targetPath, window.location.origin)
                const currentConversationId = searchParams.get("conversationId")
                if (currentConversationId) {
                    url.searchParams.set("conversationId", currentConversationId)
                  }
                  router.push(url.pathname + url.search)
                    }
                return
              }
              
              // Otherwise, search for this specific phrase in the document
              try {
                const response = await fetch(`/api/documents/${targetDocumentId}/search-phrases`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phrases: [quotedText] }),
                })
                
                if (response.ok) {
                  const result = await response.json()
                  const highlights = result.highlights || []
                  
                  if (highlights.length > 0) {
                    // Use the first highlight found
                    const highlight = highlights[0]
                    const source = sourceInfo.source
                    
                    const contextHighlight: Highlight = {
                      id: highlight.id || `highlight-${targetDocumentId}-${highlight.pageNumber || source?.pageNumber || 1}-${Date.now()}`,
                      documentId: targetDocumentId,
                      pageNumber: highlight.pageNumber || source?.pageNumber || 1,
                      textSpan: highlight.textSpan || source?.textSpan!,
                      quote: quotedText,
                      source: 'user_click' as const,
                      color: highlight.color || "rgba(255, 255, 0, 0.3)",
                      coordinates: highlight.coordinates,
                    }
                    
                    clientLogger.debug("[handleBadgeClick] Setting highlight in context:", contextHighlight)
                    
                    // Set single highlight in context (for icon click, only show this one)
                    // Use immediate update for user clicks (better UX)
                    setHighlights(targetDocumentId, [contextHighlight], true)
                    setActiveDocument(targetDocumentId)
                    
                    // Navigate to document if not already there
                    const currentPath = window.location.pathname
                    const targetPath = `/workspaces/${workspaceId}/documents/${targetDocumentId}`
                    if (currentPath !== targetPath) {
                      const url = new URL(targetPath, window.location.origin)
                      const currentConversationId = searchParams.get("conversationId")
                      if (currentConversationId) {
                        url.searchParams.set("conversationId", currentConversationId)
                      }
                      router.push(url.pathname + url.search)
                    }
                  } else {
                    clientLogger.warn("[handleBadgeClick] No highlights found for phrase:", quotedText)
                    // If no highlights found, still navigate to the document if we have a source
                    const source = sourceInfo.source
                    if (source && source.pageNumber) {
                      const url = new URL(`/workspaces/${workspaceId}/documents/${targetDocumentId}`, window.location.origin)
                      const currentConversationId = searchParams.get("conversationId")
                      if (currentConversationId) {
                        url.searchParams.set("conversationId", currentConversationId)
                      }
                      router.push(url.pathname + url.search)
                    }
                  }
                } else {
                  clientLogger.error("[handleBadgeClick] Search request failed:", response.status)
                }
              } catch (error) {
                clientLogger.error("[handleBadgeClick] Error highlighting phrase:", error)
              }
            } else {
              clientLogger.warn("[handleBadgeClick] Cannot handle badge click:", {
                type: sourceInfo.type,
                hasSource: !!sourceInfo.source,
                hasDocumentId: !!documentId,
                sourceId: sourceInfo.source?.id,
              })
            }
          }

          return (
            <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className="space-y-2 group">
                {shouldShowThinkingTooltip && (
                  <span className="text-xs italic text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {(() => {
                      // First check if message has thinking_duration from database (past messages)
                      if (message.thinking_duration !== null && message.thinking_duration !== undefined) {
                        const duration =
                          typeof message.thinking_duration === "number"
                            ? message.thinking_duration
                            : Number.parseFloat(String(message.thinking_duration))
                        if (!isNaN(duration)) {
                          return `Thought for ${formatDuration(duration)} sec`
                        }
                      }
                      // Then check if we have a stored duration for this index (current session)
                      if (thinkingDurations.has(index)) {
                        const duration = thinkingDurations.get(index)!
                        return `Thought for ${formatDuration(duration)} sec`
                      }
                      // Fallback: if this is the last assistant message and we have a lastThinkingDuration
                      if (isLastAssistant && lastThinkingDuration !== null) {
                        return `Thought for ${formatDuration(lastThinkingDuration)} sec`
                      }
                      // If no duration available, just show "Thought"
                      return "Thought"
                    })()}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[80%] sm:max-w-[60ch] rounded-2xl px-3 py-2 text-sm break-words",
                    isUser && "bg-primary/5 text-foreground",
                    isAssistant && "space-y-2",
                  )}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-0 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-pre:text-sm">
                    <ReactMarkdown
                      components={{
                        li: ({ children, ...props }: any) => {
                          // Check if this list item contains text that should have a highlight icon
                          // Extract text from children (handling ReactMarkdown's structure)
                          const extractText = (node: any): string => {
                            if (typeof node === 'string') return node
                            if (Array.isArray(node)) return node.map(extractText).join('')
                            if (React.isValidElement(node) && node.props?.children) {
                              return extractText(node.props.children)
                            }
                            return ''
                          }
                          
                          const itemText = extractText(children).trim()
                          
                          // Check if this item is in our badge info map (was extracted as a phrase to highlight)
                          const cachedBadgeInfo = badgeInfoMap.get(itemText)
                          const hasDocCitation = cachedBadgeInfo?.hasDocCitation || false
                          const badgeType = cachedBadgeInfo?.type || (hasDocCitation ? 'doc' : null)
                          const sourceInfo = cachedBadgeInfo 
                            ? { type: cachedBadgeInfo.type, source: cachedBadgeInfo.source }
                            : (hasDocCitation ? findSourceForQuote(itemText, true) : null)
                          
                          // If this is a document citation, add highlight icon
                          if (badgeType === 'doc' && sourceInfo) {
                            return (
                              <li {...props} className="flex items-start gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    clientLogger.debug("[ChatInterface] List item highlight icon clicked:", {
                                      itemText: itemText.substring(0, 50),
                                      sourceInfo,
                                    })
                                    handleBadgeClick(itemText, sourceInfo)
                                  }}
                                  className="inline-flex items-center justify-center w-4 h-4 mt-0.5 rounded hover:bg-secondary/80 transition-colors cursor-pointer flex-shrink-0"
                                  title="Scroll to this section in the document"
                                >
                                  <Highlighter className="h-3 w-3 text-primary" />
                                </button>
                                <span className="flex-1">{children}</span>
                              </li>
                            )
                          }
                          
                          return <li {...props}>{children}</li>
                        },
                        p: ({ children, ...props }: any) => {
                          // Debug: log the raw children to see what we're working with
                          if (index === messages.length - 1 && isAssistant) {
                            const rawContent = readMessageContent(message)
                            clientLogger.debug("[ChatInterface] Processing message content:", {
                              messageIndex: index,
                              rawContentLength: rawContent.length,
                              rawContentPreview: rawContent.substring(0, 500),
                              rawContentHasQuotes: rawContent.includes('"'),
                              rawContentHasDoc: rawContent.includes('[doc]'),
                              rawContentHasQuoteDocPattern: /"[^"]+"\s*\[doc\]/.test(rawContent),
                              childrenType: typeof children,
                              childrenIsArray: Array.isArray(children),
                              childrenLength: Array.isArray(children) ? children.length : 'N/A',
                              childrenPreview: Array.isArray(children) 
                                ? children.map(c => {
                                    if (typeof c === 'string') return c.substring(0, 100)
                                    if (React.isValidElement(c)) return `[${c.type}]`
                                    return String(c)
                                  }).join(' | ')
                                : (typeof children === 'string' ? children.substring(0, 200) : String(children)),
                              hasSources: sources.length > 0,
                              sourcesCount: sources.length,
                              badgeInfoMapSize: badgeInfoMap.size,
                              badgeInfoMapKeys: Array.from(badgeInfoMap.keys()).slice(0, 5)
                            })
                          }
                          // Process text nodes to add badges after quoted text and [doc] citations
                          const processTextNode = (text: string): any[] => {
                            if (!text || typeof text !== 'string') return [text]
                            
                            const parts: any[] = []
                            // Match quoted text, optionally followed by [doc] citation
                            // Pattern: "quoted text" [doc] or just "quoted text"
                            // Also handle cases where [doc] might be on the same line but separated
                            const quoteRegex = /"([^"]+)"(\s*\[doc\])?/g
                            let lastIndex = 0
                            let match
                            let matchCount = 0
                            
                            while ((match = quoteRegex.exec(text)) !== null) {
                              matchCount++
                              // Add text before the quote
                              if (match.index > lastIndex) {
                                parts.push(text.substring(lastIndex, match.index))
                              }
                              
                              // Add quoted text with badge
                              const quotedText = match[1]
                              const hasDocCitation = !!match[2] // Check if [doc] was found
                              
                              // Use pre-computed badge info to prevent flash
                              const cachedBadgeInfo = badgeInfoMap.get(quotedText)
                              const badgeType = cachedBadgeInfo?.type || (hasDocCitation ? 'doc' : 'scope')
                              const sourceInfo = cachedBadgeInfo 
                                ? { type: cachedBadgeInfo.type, source: cachedBadgeInfo.source }
                                : findSourceForQuote(quotedText, hasDocCitation)
                              
                              clientLogger.debug("[ChatInterface] Found quote match:", {
                                quotedText: quotedText.substring(0, 50), 
                                hasDocCitation, 
                                badgeType,
                                hasSource: !!sourceInfo.source,
                                badgeInfoMapSize: badgeInfoMap.size,
                                matchIndex: match.index,
                                fullMatch: match[0]
                              })
                              
                              parts.push(
                                <span key={`quote-${match.index}-${index}`} className="inline-flex items-center gap-1">
                                  <span className="font-medium">"{quotedText}"</span>
                                  {badgeType === 'doc' && (
                                    <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                        clientLogger.debug("[ChatInterface] Highlight icon clicked:", {
                                          quotedText: quotedText.substring(0, 50),
                                          sourceInfo,
                                        })
                                        handleBadgeClick(quotedText, sourceInfo)
                                    }}
                                      className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-secondary/80 transition-colors cursor-pointer"
                                      title="Scroll to this quote in the document"
                                  >
                                      <Highlighter className="h-3 w-3 text-primary" />
                                    </button>
                                  )}
                                </span>
                              )
                              
                              // Move past the entire match (quote + optional [doc])
                              // Skip the [doc] text since we're using icons now
                              lastIndex = match.index + match[0].length
                            }
                            
                            // Also check for standalone [doc] that might have been separated from quotes
                            // This handles cases where ReactMarkdown splits the text
                            if (lastIndex < text.length) {
                              const remainingText = text.substring(lastIndex)
                              // Check if there's a [doc] that we might have missed
                              const docMatch = remainingText.match(/^\s*\[doc\]/)
                              if (docMatch && parts.length > 0) {
                                // If we just added a quote part, this [doc] likely belongs to it
                                const lastPart = parts[parts.length - 1]
                                if (React.isValidElement(lastPart) && lastPart.type === 'span') {
                                  // The icon should already be there, just skip the [doc] text
                                  lastIndex += docMatch[0].length
                                }
                              } else {
                                // Check for standalone [doc] without quotes - try to associate with previous quote
                                const standaloneDocMatch = remainingText.match(/\s*\[doc\]/)
                                if (standaloneDocMatch && parts.length > 0) {
                                  // Look backwards for a quote in the parts
                                  for (let pIdx = parts.length - 1; pIdx >= 0; pIdx--) {
                                    const part = parts[pIdx]
                                    if (React.isValidElement(part) && part.type === 'span') {
                                      // Found a span, check if it's a quote span
                                      const spanChildren = part.props?.children
                                      if (Array.isArray(spanChildren)) {
                                        const quoteSpan = spanChildren.find((c: any) => 
                                          React.isValidElement(c) && c.type === 'span' && 
                                          typeof c.props?.children === 'string' && 
                                          c.props.children.startsWith('"')
                                        )
                                        if (quoteSpan) {
                                        const quoteText = quoteSpan.props.children.replace(/^"|"$/g, '')
                                          // Check if icon already exists
                                          const hasIcon = spanChildren.some((c: any) => 
                                            React.isValidElement(c) && c.type === 'button'
                                          )
                                          if (!hasIcon) {
                                        // Use pre-computed badge info
                                        const cachedBadgeInfo = badgeInfoMap.get(quoteText)
                                        const badgeType = cachedBadgeInfo?.type || 'doc'
                                        const sourceInfo = cachedBadgeInfo 
                                          ? { type: cachedBadgeInfo.type, source: cachedBadgeInfo.source }
                                          : findSourceForQuote(quoteText, true)
                                        
                                            // Replace the span with one that has an icon
                                        parts[pIdx] = (
                                          <span key={`quote-standalone-${pIdx}-${index}`} className="inline-flex items-center gap-1">
                                                {spanChildren}
                                                {badgeType === 'doc' && (
                                                  <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                  handleBadgeClick(quoteText, sourceInfo)
                                              }}
                                                    className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-secondary/80 transition-colors cursor-pointer"
                                                    title="Scroll to this quote in the document"
                                            >
                                                    <Highlighter className="h-3 w-3 text-primary" />
                                                  </button>
                                                )}
                                          </span>
                                        )
                                          }
                                        // Skip the [doc] text
                                        lastIndex += standaloneDocMatch[0].length
                                        break
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            
                            // Add remaining text (but skip standalone [doc] if we already processed it)
                            if (lastIndex < text.length) {
                              const remaining = text.substring(lastIndex)
                              // Don't add standalone [doc] text - we use icons now
                              if (!/^\s*\[doc\]\s*$/.test(remaining)) {
                                parts.push(remaining)
                              } else {
                                // Skip [doc] text entirely
                                lastIndex += remaining.length
                              }
                            }
                            
                            // Debug: log processing results
                            if (index === messages.length - 1 && isAssistant) {
                              clientLogger.debug("[ChatInterface] processTextNode result:", {
                                matchCount,
                                partsCount: parts.length,
                                hasBadges: parts.some(p => React.isValidElement(p) && p.type === 'span'),
                                textLength: text.length,
                                textHasQuotes: text.includes('"'),
                                textHasDoc: text.includes('[doc]'),
                                textPreview: text.substring(0, 150)
                              })
                            }
                            
                            return parts.length > 0 ? parts : [text]
                          }
                          
                          // Convert children to string for processing if needed
                          // First, try to process the entire children as a string if possible
                          const processChildren = (children: any): any => {
                            // If children is a single string, process it directly
                            if (typeof children === 'string') {
                              const processed = processTextNode(children)
                              return processed.length > 1 || (processed.length === 1 && processed[0] !== children) 
                                ? processed 
                                : children
                            }
                            
                            // If children is an array, we need to handle it more carefully
                            // ReactMarkdown might split text nodes, so we need to look for [doc] across nodes
                            if (Array.isArray(children)) {
                              // Strategy: Process all consecutive string children together
                              // This handles cases where ReactMarkdown splits "text" and [doc] into separate text nodes
                              const result: any[] = []
                              let i = 0
                              
                              while (i < children.length) {
                                const child = children[i]
                                
                                if (typeof child === 'string') {
                                  // Check if this is a standalone [doc] text - skip it entirely (we use icons now)
                                  if (/^\s*\[doc\]\s*$/.test(child.trim())) {
                                    // This is standalone [doc] - try to associate with previous quote
                                    let associated = false
                                    for (let rIdx = result.length - 1; rIdx >= 0; rIdx--) {
                                      const lastItem = result[rIdx]
                                      if (React.isValidElement(lastItem) && lastItem.type === 'span') {
                                        const spanChildren = lastItem.props?.children
                                        if (Array.isArray(spanChildren)) {
                                          // Check if this span contains a quote
                                          const quoteSpan = spanChildren.find((c: any) => 
                                            React.isValidElement(c) && c.type === 'span' && 
                                            typeof c.props?.children === 'string' && 
                                            c.props.children.startsWith('"')
                                          )
                                          if (quoteSpan) {
                                            const quoteText = quoteSpan.props.children.replace(/^"|"$/g, '')
                                            // Check if icon already exists
                                            const hasIcon = spanChildren.some((c: any) => 
                                              React.isValidElement(c) && c.type === 'button'
                                            )
                                            if (!hasIcon) {
                                              const cachedBadgeInfo = badgeInfoMap.get(quoteText)
                                              const badgeType = cachedBadgeInfo?.type || 'doc'
                                              const sourceInfo = cachedBadgeInfo 
                                                ? { type: cachedBadgeInfo.type, source: cachedBadgeInfo.source }
                                                : findSourceForQuote(quoteText, true)
                                              
                                              result[rIdx] = (
                                                <span key={`quote-doc-text-${rIdx}-${index}`} className="inline-flex items-center gap-1">
                                                  {spanChildren}
                                                  {badgeType === 'doc' && (
                                                    <button
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      e.preventDefault()
                                                        handleBadgeClick(quoteText, sourceInfo)
                                                    }}
                                                      className="inline-flex items-center justify-center w-4 h-4 rounded hover:bg-secondary/80 transition-colors cursor-pointer"
                                                      title="Scroll to this quote in the document"
                                                  >
                                                      <Highlighter className="h-3 w-3 text-primary" />
                                                    </button>
                                                  )}
                                                </span>
                                              )
                                            }
                                              associated = true
                                              i++ // Skip the [doc] text
                                              break
                                          }
                                        }
                                      }
                                    }
                                    if (!associated) {
                                      // No quote found, skip the [doc] text entirely
                                      i++
                                      continue
                                    }
                                  } else {
                                    // Collect all consecutive strings
                                    const stringGroup: string[] = [child]
                                    let j = i + 1
                                    while (j < children.length && typeof children[j] === 'string') {
                                      stringGroup.push(children[j] as string)
                                      j++
                                    }
                                    
                                    // Process the group as one text
                                    const combinedText = stringGroup.join('')
                                    const processed = processTextNode(combinedText)
                                    
                                    // If we found matches, use processed version
                                    if (processed.length > 1 || (processed.length === 1 && processed[0] !== combinedText)) {
                                      processed.forEach((p, pIdx) => {
                                        result.push(React.isValidElement(p) ? p : <React.Fragment key={`${i}-${pIdx}`}>{p}</React.Fragment>)
                                      })
                                    } else {
                                      // No matches, add original strings
                                      stringGroup.forEach((str, sIdx) => {
                                        result.push(str)
                                      })
                                    }
                                    
                                    i = j // Skip all the strings we just processed
                                  }
                                } else {
                                  // Non-string child - check if it's a [doc] link
                                  if (React.isValidElement(child) && child.type === 'a') {
                                    const linkText = typeof child.props?.children === 'string' 
                                      ? child.props.children 
                                      : (Array.isArray(child.props?.children) 
                                          ? child.props.children.join('') 
                                          : String(child.props?.children || ''))
                                    
                                    if (linkText === '[doc]' || child.props?.href === '[doc]') {
                                      // Look backwards for a quote span in the result
                                      for (let rIdx = result.length - 1; rIdx >= 0; rIdx--) {
                                        const lastItem = result[rIdx]
                                        if (React.isValidElement(lastItem) && lastItem.type === 'span') {
                                          // Check if it's a quote span without a badge
                                          const spanChildren = lastItem.props?.children
                                          if (Array.isArray(spanChildren) && spanChildren.length === 1) {
                                            const quoteSpan = spanChildren[0]
                                            if (React.isValidElement(quoteSpan) && quoteSpan.type === 'span') {
                                              const quoteText = quoteSpan.props?.children
                                              if (quoteText && typeof quoteText === 'string' && quoteText.startsWith('"')) {
                                                // Found a quote without badge - add badge and skip the [doc] link
                                                const cleanQuoteText = quoteText.replace(/^"|"$/g, '')
                                                const cachedBadgeInfo = badgeInfoMap.get(cleanQuoteText)
                                                const badgeType = cachedBadgeInfo?.type || 'doc'
                                                const sourceInfo = cachedBadgeInfo 
                                                  ? { type: cachedBadgeInfo.type, source: cachedBadgeInfo.source }
                                                  : findSourceForQuote(cleanQuoteText, true)
                                                
                                                result[rIdx] = (
                                                  <span key={`quote-link-${rIdx}-${index}`} className="inline-flex items-center gap-1">
                                                    {quoteSpan}
                                                    <Badge 
                                                      variant={badgeType === 'doc' ? 'secondary' : 'outline'} 
                                                      className={cn(
                                                        "text-[10px] px-1.5 py-0 h-4",
                                                        badgeType === 'doc' && "cursor-pointer hover:bg-secondary/80 transition-colors"
                                                      )}
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        if (badgeType === 'doc') {
                                                          handleBadgeClick(cleanQuoteText, sourceInfo)
                                                        }
                                                      }}
                                                    >
                                                      {badgeType}
                                                    </Badge>
                                                  </span>
                                                )
                                                i++ // Skip the [doc] link
                                                continue
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                  
                                  // Regular non-string child
                                  result.push(child)
                                  i++
                                }
                              }
                              
                              return result.length > 0 ? result : children
                            }
                            
                            return children
                          }
                          
                          const processedChildren = processChildren(children)
                          
                          return <p {...props}>{processedChildren}</p>
                        },
                        // Handle links - ReactMarkdown might convert [doc] to a link
                        a: ({ href, children, ...props }: any) => {
                          // Check if this is a [doc] citation that was converted to a link
                          const linkText = typeof children === 'string' ? children : 
                            (Array.isArray(children) ? children.join('') : String(children))
                          
                          if (linkText === '[doc]' || href === '[doc]') {
                            // This is a [doc] link - don't render it (we use icons now)
                            // The icon should already be added by the quote processing logic
                            return null
                          }
                          
                          return <a href={href} {...props}>{children}</a>
                        },
                        // Handle text nodes that might contain standalone [doc]
                        // Note: ReactMarkdown doesn't expose text as a component, so we handle it in the p component
                      } as Components}
                    >
                      {readMessageContent(message)}
                    </ReactMarkdown>
                  </div>
                  {isAssistant && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleOpenEvidenceDialog(message, index)}
                          disabled={evidenceStatus === "saving" || isLoading}
                        >
                          {evidenceStatus === "saving" ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            <>
                              <Plus className="mr-1 h-3 w-3" />
                              Save as evidence
                            </>
                          )}
                        </Button>
                        {evidenceStatus === "success" && (
                          <span className="text-xs text-emerald-600">Saved to workspace evidence</span>
                        )}
                        {evidenceStatus === "error" && evidenceStatusEntry?.error && (
                          <span className="text-xs text-destructive">{evidenceStatusEntry.error}</span>
                        )}
                      </>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {isLoading && (
          <div className="flex justify-start">
            <span className="px-2 text-sm italic text-muted-foreground">{`Thinking${ellipsis.padEnd(3, ".")}`}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-card p-4 space-y-2">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={inputRef}
            value={safeInput}
            onChange={handleInputChange}
            placeholder={inputPlaceholder}
            className={cn("min-h-[60px] flex-1 resize-none shadow", isLoading ? "pr-20" : "pr-10")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as any)
              }
            }}
          />
          {isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleStop}
              className="absolute bottom-2 right-11 h-6 w-6 p-0"
            >
              <CircleStop className="h-3 w-3" />
            </Button>
          )}
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            disabled={isLoading || !safeInput.trim()}
            className="absolute bottom-2 right-3 h-6 w-6 p-0"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground pl-3">Press Enter to send, Shift+Enter for new line</p>

        {/* AI context accordion */}
        {!isContextLoading && hasContextItems && (
          <Accordion type="single" collapsible defaultValue="documents" className="mt-4">
            <AccordionItem value="documents" className="border-none">
              <AccordionTrigger className="py-3 text-xs font-medium text-muted-foreground hover:no-underline data-[state=closed]:inline-flex data-[state=closed]:items-center data-[state=closed]:rounded-full data-[state=closed]:bg-secondary data-[state=closed]:px-3 data-[state=closed]:py-2 data-[state=closed]:w-fit [&[data-state=closed]_svg]:translate-y-0">
                <span>AI Context</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <TooltipProvider>
                  <div className="space-y-3">
                    <div className="rounded-md border border-border/60 bg-secondary/10 px-3 py-2">
                      <p className="text-xs font-medium text-foreground/90">Space and Workspace Scope (always included)</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {documentId
                        ? "The chat is context-aware to the document you're currently viewing, plus any workspace evidence you keep included below. Space and Workspace Scope are always included automatically."
                        : "Select which items to include in this conversation (excluding items does not delete them):"}
                    </p>
                    {documentId ? (
                      // Simple view for document viewer - no tabs, just show the document
                      <div className="space-y-4 mt-3">
                        {(availableSourceDocuments.length > 0 || availableInheritedDocuments.length > 0) && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Document:</p>
                            <div className="flex flex-wrap gap-2">
                              {[...availableSourceDocuments, ...availableInheritedDocuments].map((doc) => (
                                <Tooltip key={doc.id}>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="pr-1">
                                      <FileText className="mr-1 h-3 w-3" />
                                      <span className="max-w-[200px] truncate">{doc.title}</span>
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{doc.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Workspace evidence available to this chat
                          </p>
                          <EvidenceList
                            available={availableEvidence}
                            excluded={excludedEvidence}
                            onRemove={handleRemoveEvidence}
                            onRestore={handleRestoreEvidence}
                            includedLabelClassName="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground/90"
                            excludedLabelClassName="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground/70"
                            emptyMessage="No workspace evidence items yet. Save answers as evidence from the chat above and they’ll appear here."
                          />
                        </div>
                      </div>
                    ) : (
                      <Tabs defaultValue="sources" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 h-8">
                          <TabsTrigger value="sources" className="text-xs">
                            Sources <span className="font-normal">({availableSourceDocuments.length})</span>
                          </TabsTrigger>
                          <TabsTrigger value="inherited" className="text-xs">
                            Inherited <span className="font-normal">({availableInheritedDocuments.length})</span>
                          </TabsTrigger>
                          <TabsTrigger value="evidence" className="text-xs">
                            Evidence <span className="font-normal">({availableEvidence.length})</span>
                          </TabsTrigger>
                          <TabsTrigger value="notes" className="text-xs">
                            Notes <span className="font-normal">({availableNotes.length})</span>
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="sources" className="space-y-3 mt-3">
                        {availableSourceDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Included ({availableSourceDocuments.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {availableSourceDocuments.map((doc) => (
                                <Tooltip key={doc.id}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="secondary"
                                      className={documentId ? "pr-1" : "cursor-pointer hover:bg-secondary/80 pr-1"}
                                      onClick={documentId ? undefined : () => handleRemoveDocument(doc.id)}
                                    >
                                      <FileText className="mr-1 h-3 w-3" />
                                      <span className="max-w-[200px] truncate">{doc.title}</span>
                                      {!documentId && <X className="ml-1 h-3 w-3" />}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{doc.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        )}
                        {!documentId && excludedSourceDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Excluded ({excludedSourceDocuments.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {excludedSourceDocuments.map((doc) => (
                                <Tooltip key={doc.id}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="cursor-pointer hover:bg-accent pr-1 opacity-60"
                                      onClick={() => handleRestoreDocument(doc.id)}
                                    >
                                      <FileText className="mr-1 h-3 w-3" />
                                      <span className="max-w-[200px] truncate line-through">{doc.title}</span>
                                      <Plus className="ml-1 h-3 w-3" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{doc.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        )}
                        {availableSourceDocuments.length === 0 && excludedSourceDocuments.length === 0 && (
                          <p className="text-xs text-muted-foreground">No source documents</p>
                        )}
                      </TabsContent>

                      <TabsContent value="inherited" className="space-y-3 mt-3">
                        {availableInheritedDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Included ({availableInheritedDocuments.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {availableInheritedDocuments.map((doc) => (
                                <Tooltip key={doc.id}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="secondary"
                                      className={documentId ? "pr-1" : "cursor-pointer hover:bg-secondary/80 pr-1"}
                                      onClick={documentId ? undefined : () => handleRemoveDocument(doc.id)}
                                    >
                                      <FileText className="mr-1 h-3 w-3" />
                                      <span className="max-w-[200px] truncate">{doc.title}</span>
                                      {!documentId && <X className="ml-1 h-3 w-3" />}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{doc.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        )}
                        {!documentId && excludedInheritedDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Excluded ({excludedInheritedDocuments.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {excludedInheritedDocuments.map((doc) => (
                                <Tooltip key={doc.id}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="cursor-pointer hover:bg-accent pr-1 opacity-60"
                                      onClick={() => handleRestoreDocument(doc.id)}
                                    >
                                      <FileText className="mr-1 h-3 w-3" />
                                      <span className="max-w-[200px] truncate line-through">{doc.title}</span>
                                      <Plus className="ml-1 h-3 w-3" />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{doc.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </div>
                        )}
                        {availableInheritedDocuments.length === 0 && excludedInheritedDocuments.length === 0 && (
                          <p className="text-xs text-muted-foreground">No inherited documents</p>
                        )}
                      </TabsContent>

                      <TabsContent value="evidence" className="space-y-3 mt-3">
                        <EvidenceList
                          available={availableEvidence}
                          excluded={excludedEvidence}
                          onRemove={handleRemoveEvidence}
                          onRestore={handleRestoreEvidence}
                          includedLabelClassName="mb-2 text-xs font-medium text-muted-foreground"
                          excludedLabelClassName="mb-2 text-xs font-medium text-muted-foreground"
                          emptyMessage="No evidence items"
                        />
                      </TabsContent>

                      <TabsContent value="notes" className="space-y-3 mt-3">
                        {availableNotes.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Included ({availableNotes.length}):
                            </p>
                            <div className="space-y-2">
                              {availableNotes.map((note) => {
                                const authorName =
                                  note.author?.full_name || note.author?.email || "Workspace member"
                                const trimmedContent = note.content.trim()
                                const preview =
                                  trimmedContent.length > 200
                                    ? `${trimmedContent.slice(0, 200).trimEnd()}...`
                                    : trimmedContent || "[No content]"

                                return (
                                  <div
                                    key={note.id}
                                    className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground"
                                  >
                                    <div className="flex items-center justify-between gap-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                                      <span className="truncate">{authorName}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveNote(note.id)}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        aria-label="Remove note from AI context"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{preview}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {excludedNotes.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Excluded ({excludedNotes.length}):
                            </p>
                            <div className="space-y-2">
                              {excludedNotes.map((note) => {
                                const authorName =
                                  note.author?.full_name || note.author?.email || "Workspace member"
                                const trimmedContent = note.content.trim()
                                const preview =
                                  trimmedContent.length > 200
                                    ? `${trimmedContent.slice(0, 200).trimEnd()}...`
                                    : trimmedContent || "[No content]"

                                return (
                                  <div
                                    key={note.id}
                                    className="rounded-md border border-border/60 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground opacity-70"
                                  >
                                    <div className="flex items-center justify-between gap-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                                      <span className="truncate line-through">{authorName}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreNote(note.id)}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        aria-label="Restore note to AI context"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </button>
                                    </div>
                                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80 line-through">
                                      {preview}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {availableNotes.length === 0 && excludedNotes.length === 0 && (
                          <p className="text-xs text-muted-foreground">No notes</p>
                        )}
                      </TabsContent>
                    </Tabs>
                    )}
                  </div>
                </TooltipProvider>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
      <Dialog open={pendingEvidence !== null} onOpenChange={(open) => (!open ? handleCloseEvidenceDialog() : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save as workspace evidence</DialogTitle>
            <DialogDescription>
              Store this assistant response in the workspace evidence board so teammates can revisit it later.
            </DialogDescription>
          </DialogHeader>
          {pendingEvidence && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Question</p>
                <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap">
                  {pendingEvidence.question.length > 600
                    ? `${pendingEvidence.question.slice(0, 600)}…`
                    : pendingEvidence.question}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Confidence</p>
                <Select
                  value={evidenceConfidence}
                  onValueChange={(value) => setEvidenceConfidence(value as "low" | "medium" | "high")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select confidence level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High confidence</SelectItem>
                    <SelectItem value="medium">Medium confidence</SelectItem>
                    <SelectItem value="low">Low confidence</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Citations</p>
                <p className="mt-1 text-sm text-foreground/80">
                  {Array.isArray(pendingEvidence.sources) && pendingEvidence.sources.length > 0
                    ? `${pendingEvidence.sources.length} source${
                        pendingEvidence.sources.length === 1 ? "" : "s"
                      } will be linked.`
                    : "No supporting documents were detected for this answer."}
                </p>
              </div>
              {evidenceError && <p className="text-sm text-destructive">{evidenceError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEvidenceDialog} disabled={isSavingEvidence}>
              Cancel
            </Button>
            <Button onClick={handleSaveEvidence} disabled={isSavingEvidence}>
              {isSavingEvidence ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save to evidence"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

