"use client"

import { useChat } from "ai/react"
import { useState, useEffect, useRef, useCallback } from "react"
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
import ReactMarkdown from "react-markdown"
import Link from "next/link"
import { buildDocumentUrlFromSource } from "@/lib/utils/document-linking"
import { getWorkspaceDocuments } from "@/lib/actions/document"
import { getWorkspaceNotesForContext } from "@/lib/actions/workspace-notes"
import type { WorkspaceNoteForContext } from "@/lib/actions/workspace-notes"
import { getWorkspaceItems } from "@/lib/actions/workspace-item"
import { getWorkspaceContextDetails } from "@/lib/actions/workspace"
import { cn } from "@/lib/utils"

interface ChatInterfaceProps {
  workspaceId: string
  conversationId: string
  initialMessages?: any[]
  documentId?: string // Optional: when provided, only show this document
}

export function ChatInterface({ workspaceId, conversationId, initialMessages = [], documentId }: ChatInterfaceProps) {
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
    setIsLoadingEvidence(true)
    setHasLoadedWorkspaceMetadata(false)
    setIsLoadingEvidence(true)
    setIsLoadingEvidence(true)

    try {
      const documentsPromise = (async () => {
        const result = await getWorkspaceDocuments(workspaceId)

        if (result.error) {
          console.error("[ChatInterface] Failed to fetch documents:", result.error)
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
          console.error("[ChatInterface] Failed to fetch evidence items:", result.error)
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
          console.error("[ChatInterface] Failed to fetch workspace context:", result.error)
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
        console.error("[ChatInterface] Failed to fetch workspace notes:", notesResult.error)
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
      console.error("[ChatInterface] Failed to load AI context items:", error)
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
        console.log(`[ChatInterface] Context event received (${event.type}), refreshing AI context items`)
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

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, stop, setInput } = useChat({
    api: "/api/chat",
    body: {
      workspaceId,
      conversationId,
      excludedDocumentIds: Array.from(excludedDocumentIds),
      excludedNoteIds: Array.from(excludedNoteIds),
      excludedEvidenceIds: Array.from(excludedEvidenceIds),
    },
    initialMessages: hasLoadedInitial ? undefined : initialMessages,
  })

  // Fetch sources and thinking_duration for the last assistant message after streaming completes
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
              }
            }
          } catch (error) {
            console.error("Failed to fetch message sources:", error)
          }
        }, 500) // Wait 500ms for DB write to complete

        return () => clearTimeout(timer)
      }
    }
  }, [isLoading, messages, conversationId, setMessages])

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
  const prevInitialMessagesLengthRef = useRef<number>(initialMessages.length)

  useEffect(() => {
    console.log("[ChatInterface] Messages effect:", {
      hasLoadedInitial,
      initialMessagesCount: initialMessages.length,
      conversationId,
      prevConversationId: prevConversationIdForMessagesRef.current,
      isLoading,
    })

    const conversationChanged = prevConversationIdForMessagesRef.current !== conversationId
    const initialMessagesChanged = prevInitialMessagesLengthRef.current !== initialMessages.length

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (!hasLoadedInitial) {
      // Initial load - load messages from initialMessages
      console.log("[ChatInterface] Loading initial messages:", initialMessages.length)
      if (initialMessages.length > 0) {
        setMessages(initialMessages)
      } else {
        setMessages([])
      }
      setHasLoadedInitial(true)
      prevConversationIdForMessagesRef.current = conversationId
      prevInitialMessagesLengthRef.current = initialMessages.length
    } else if (conversationChanged && conversationId) {
      // Conversation changed - sync with initialMessages
      // This happens when switching between conversations
      console.log("[ChatInterface] Conversation changed, syncing messages")
      setIsSwitchingConversation(true)
      if (initialMessages.length > 0) {
        setMessages(initialMessages)
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
      prevInitialMessagesLengthRef.current = initialMessages.length
    } else if (initialMessagesChanged && !isLoading && conversationId && !conversationChanged) {
      // initialMessages updated for current conversation (e.g., after loadMessages completes)
      // Only sync if we're not currently loading to avoid overwriting streaming messages
      // and conversation hasn't changed (to avoid double-syncing)
      console.log("[ChatInterface] initialMessages updated, syncing messages")
      if (initialMessages.length > 0) {
        setMessages(initialMessages)
        setIsSwitchingConversation(false)
      } else {
        setMessages([])
      }
      prevInitialMessagesLengthRef.current = initialMessages.length
    }

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
    // Don't sync messages on every render - let useChat hook manage messages during streaming
    // Only sync when conversation changes, on initial load, or when initialMessages updates
  }, [initialMessages, hasLoadedInitial, setMessages, conversationId, isLoading])

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
      setInput(lastUserMessage.content)
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
      const candidate = messages[i]
      if (candidate?.role === "user" && typeof candidate.content === "string" && candidate.content.trim().length > 0) {
        return candidate.content
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
      answer: typeof message?.content === "string" ? message.content : "",
      sources: Array.isArray(message?.sources) ? message.sources : [],
    })
  }

  const handleCloseEvidenceDialog = () => {
    if (isSavingEvidence) {
      return
    }
    setPendingEvidence(null)
    setEvidenceError(null)
  }

  const handleHighlight = async (message: any) => {
    if (!documentId) {
      console.warn("[handleHighlight] No documentId provided")
      return
    }

    const sources = Array.isArray(message?.sources) ? message.sources : []
    console.log("[handleHighlight] Looking for relevant sources:", {
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
    if (message.content) {
      console.log("[handleHighlight] Extracting phrases from AI response to find highlights")
      
      // Extract quoted phrases from the message content
      // Look for phrases in quotes - these are the most reliable
      const quotedPhrases = message.content.match(/"([^"]+)"/g) || []
      const extractedPhrases = quotedPhrases.map((q: string) => q.replace(/"/g, "").trim())
      
      console.log("[handleHighlight] Extracted quoted phrases:", extractedPhrases)
      
      // Also extract phrases that match common patterns
      // Pattern 1: "clear view of X" (with or without quotes)
      const clearViewMatches = message.content.match(/(?:the\s+)?(?:need\s+for\s+)?(?:a\s+)?(?:clear\s+view\s+of\s+[^.,!?]+)/gi) || []
      
      // Pattern 2: Phrases after "mentions", "refers to", etc.
      const mentionMatches = message.content.match(/(?:mentions?|refers? to|discusses?|talks? about|says?|states?|notes?|indicates?|expresses?)\s+(?:the\s+)?(?:need\s+for\s+)?(?:a\s+)?(?:clear\s+view\s+of\s+[^.,!?]+)/gi) || []
      
      // Clean up matches: remove leading words like "mentions", "refers to", etc.
      const cleanedMentionMatches = mentionMatches.map((m: string) => {
        return m.replace(/^(?:mentions?|refers? to|discusses?|talks? about|says?|states?|notes?|indicates?|expresses?)\s+/i, "").trim()
      })
      
      // Combine all phrases and clean them up
      // Prioritize quoted phrases as they're most likely to be exact matches
      const allPhrases = [...new Set([
        ...extractedPhrases, // Quoted phrases first (most reliable)
        ...clearViewMatches.map((m: string) => m.trim()),
        ...cleanedMentionMatches,
      ])]
        .map((p: string) => p.replace(/^["']|["']$/g, "").trim()) // Remove quotes
        .filter((p: string) => p.length >= 5 && p.length < 300) // More lenient length filter
        .slice(0, 15) // Increase limit to 15 phrases
      
      console.log("[handleHighlight] All extracted phrases:", allPhrases)
      
      if (allPhrases.length > 0) {
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
            console.log("[handleHighlight] Found highlights from phrase search:", foundHighlights)
            
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
              
              // Use the first source for navigation, or create a default one
              const firstSource = sources.find((s: any) => s.id === documentId) || {
                id: documentId,
                pageNumber: uniqueHighlights[0]?.pageNumber || 1,
              }
              
              let url = buildDocumentUrlFromSource(workspaceId, firstSource)
              
              // Preserve conversationId from current URL if it exists
              const currentConversationId = searchParams.get("conversationId")
              if (currentConversationId) {
                const urlObj = new URL(url, window.location.origin)
                urlObj.searchParams.set("conversationId", currentConversationId)
                url = urlObj.pathname + urlObj.search
              }
              
              // Check if we're already on this document page
              const currentPath = window.location.pathname
              const targetPath = url.split("?")[0]
              const isSamePage = currentPath === targetPath
              
              if (isSamePage) {
                window.history.replaceState({}, "", url)
                window.dispatchEvent(new CustomEvent("highlightUpdated", {
                  detail: { highlights: uniqueHighlights },
                }))
              } else {
                // Store highlights in sessionStorage for the new page
                if (typeof window !== "undefined") {
                  sessionStorage.setItem(`highlights-${documentId}`, JSON.stringify(uniqueHighlights))
                }
                router.replace(url)
              }
              return
            }
          }
        } catch (error) {
          console.error("[handleHighlight] Error searching for phrases:", error)
        }
      }
    }

    // Fallback: if we have sources with textSpan but no phrase matches, use those
    if (relevantSources.length > 0) {
      console.log("[handleHighlight] Found relevant sources:", relevantSources.length, relevantSources)
      
      // Use the first source for URL navigation (to go to the right page)
      const firstSource = relevantSources[0]
      let url = buildDocumentUrlFromSource(workspaceId, firstSource)
      
      // Preserve conversationId from current URL if it exists
      const currentConversationId = searchParams.get("conversationId")
      if (currentConversationId) {
        const urlObj = new URL(url, window.location.origin)
        urlObj.searchParams.set("conversationId", currentConversationId)
        url = urlObj.pathname + urlObj.search
      }
      
      // Build highlights array from all relevant sources
      const highlights = relevantSources.map((source: any, index: number) => {
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
      
      console.log("[handleHighlight] Built highlights array:", highlights)
      console.log("[handleHighlight] Navigating to:", url)
      
      // Check if we're already on this document page
      const currentPath = window.location.pathname
      const targetPath = url.split("?")[0]
      const isSamePage = currentPath === targetPath
      
      if (isSamePage) {
        // If we're already on the same page, update URL without navigation to avoid refresh
        // This prevents the document from reloading
        window.history.replaceState({}, "", url)
        // Dispatch a custom event to notify the document viewer to update highlights
        // Pass all highlights, not just the first one
        window.dispatchEvent(new CustomEvent("highlightUpdated", { 
          detail: { 
            highlights: highlights, // Pass all highlights
            highlight: new URL(url, window.location.origin).searchParams.get("highlight"),
            textSpan: new URL(url, window.location.origin).searchParams.get("textSpan"),
            page: new URL(url, window.location.origin).searchParams.get("page"),
          } 
        }))
      } else {
        // If we're on a different page, use router.replace to navigate
        // Store highlights in sessionStorage to pass them to the new page
        if (typeof window !== "undefined" && highlights.length > 0) {
          sessionStorage.setItem(`highlights-${documentId}`, JSON.stringify(highlights))
        }
        router.replace(url)
      }
    } else {
      console.warn("[handleHighlight] No relevant source found with highlight info")
    }
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
      const response = await fetch("/api/evidence/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          question,
          answer,
          citations,
          confidence: evidenceConfidence,
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

        {messages.map((message: any, index) => {
          const isUser = message.role === "user"
          const isAssistant = message.role === "assistant"
          const isLastAssistant = isAssistant && index === messages.length - 1
          const messageKey = getMessageKey(message, index)
          const evidenceStatusEntry = evidenceStatusByMessage[messageKey]
          const evidenceStatus = evidenceStatusEntry?.status ?? "idle"
          
          // Process message content to add source badges after quoted text
          // We'll render badges separately, not through ReactMarkdown
          const sources = Array.isArray(message?.sources) ? message.sources : []
          const hasDocumentSource = documentId && sources.some((s: any) => s.id === documentId)
          
          // Extract quoted phrases for badge rendering
          const quotedPhrases = isAssistant && message.content 
            ? message.content.match(/"([^"]+)"/g) || []
            : []

          return (
            <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className="space-y-2 group">
                {isAssistant && (
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
                        p: ({ children, ...props }) => {
                          // Process text nodes to add badges after quoted text
                          const processTextNode = (text: string): any[] => {
                            const parts: any[] = []
                            const quoteRegex = /"([^"]+)"/g
                            let lastIndex = 0
                            let match
                            
                            while ((match = quoteRegex.exec(text)) !== null) {
                              // Add text before the quote
                              if (match.index > lastIndex) {
                                parts.push(text.substring(lastIndex, match.index))
                              }
                              
                              // Add quoted text with badge
                              const quotedText = match[1]
                              const badgeType = hasDocumentSource ? 'doc' : 'scope'
                              
                              parts.push(
                                <span key={match.index} className="inline-flex items-center gap-1">
                                  <span className="font-medium">"{quotedText}"</span>
                                  <Badge 
                                    variant={badgeType === 'doc' ? 'secondary' : 'outline'} 
                                    className="text-[10px] px-1.5 py-0 h-4"
                                  >
                                    {badgeType}
                                  </Badge>
                                </span>
                              )
                              
                              lastIndex = match.index + match[0].length
                            }
                            
                            // Add remaining text
                            if (lastIndex < text.length) {
                              parts.push(text.substring(lastIndex))
                            }
                            
                            return parts
                          }
                          
                          if (typeof children === 'string') {
                            const processed = processTextNode(children)
                            return <p {...props}>{processed.length > 0 ? processed : children}</p>
                          }
                          
                          if (Array.isArray(children)) {
                            return (
                              <p {...props}>
                                {children.map((child, idx) => {
                                  if (typeof child === 'string') {
                                    const processed = processTextNode(child)
                                    return processed.length > 0 ? <>{processed}</> : child
                                  }
                                  return child
                                })}
                              </p>
                            )
                          }
                          
                          return <p {...props}>{children}</p>
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {isAssistant && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {documentId ? (
                        // Document viewer mode: show Highlight button
                        (() => {
                          const sources = Array.isArray(message?.sources) ? message.sources : []
                          // Show highlight button if there are ANY sources for this document
                          // (even without textSpan, we can extract phrases from the response)
                          const hasRelevantSource = sources.some(
                            (source: any) => source.id === documentId
                          )
                          return hasRelevantSource ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleHighlight(message)}
                              disabled={isLoading}
                            >
                              <Highlighter className="mr-1 h-3 w-3" />
                              Highlight
                            </Button>
                          ) : null
                        })()
                      ) : (
                        // Workspace mode: show Save as evidence button
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
                      )}
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
            value={input}
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
            disabled={isLoading || !input.trim()}
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
                        ? "The chat is context-aware to the document you're currently viewing. Space and Workspace Scope are always included automatically."
                        : "Select which items to include in this conversation (excluding items does not delete them):"}
                    </p>
                    {documentId ? (
                      // Simple view for document viewer - no tabs, just show the document
                      <div className="space-y-3 mt-3">
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
                        {availableEvidence.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Included ({availableEvidence.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {availableEvidence.map((item) => {
                                const question = item.payload?.question || "Saved evidence"
                                const truncatedQuestion = question.length > 100 ? `${question.slice(0, 100)}...` : question
                                return (
                                  <Tooltip key={item.id}>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="secondary"
                                        className="cursor-pointer hover:bg-secondary/80 pr-1"
                                        onClick={() => handleRemoveEvidence(item.id)}
                                      >
                                        <FileText className="mr-1 h-3 w-3" />
                                        <span className="max-w-[200px] truncate">{truncatedQuestion}</span>
                                        <X className="ml-1 h-3 w-3" />
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{question}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {excludedEvidence.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Excluded ({excludedEvidence.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {excludedEvidence.map((item) => {
                                const question = item.payload?.question || "Saved evidence"
                                const truncatedQuestion = question.length > 100 ? `${question.slice(0, 100)}...` : question
                                return (
                                  <Tooltip key={item.id}>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        className="cursor-pointer hover:bg-accent pr-1 opacity-60"
                                        onClick={() => handleRestoreEvidence(item.id)}
                                      >
                                        <FileText className="mr-1 h-3 w-3" />
                                        <span className="max-w-[200px] truncate line-through">{truncatedQuestion}</span>
                                        <Plus className="ml-1 h-3 w-3" />
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{question}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {availableEvidence.length === 0 && excludedEvidence.length === 0 && (
                          <p className="text-xs text-muted-foreground">No evidence items</p>
                        )}
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

