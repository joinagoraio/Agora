"use client"

import { TextStreamChatTransport } from "ai"
import { useChat as useAiChat } from "@ai-sdk/react"
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
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
import { IconTooltip } from "@/components/icon-tooltip"
import { FormattedMarkdown } from "@/components/formatted-markdown"
import { DictationButton, ReadAloudButton, spokenQuestion } from "@/components/ask-voice"
import Link from "next/link"
import { compileAskAnswer } from "@/lib/chat/ask-format"
import { buildDocumentUrlFromSource } from "@/lib/utils/document-linking"
import { getWorkspaceDocuments } from "@/lib/actions/document"
import { getSpaceItems } from "@/lib/actions/space-item"
import { getWorkspaceNotesForContext } from "@/lib/actions/workspace-notes"
import type { WorkspaceNoteForContext } from "@/lib/actions/workspace-notes"
import { getWorkspaceItems } from "@/lib/actions/workspace-item"
import { getWorkspaceContextDetails } from "@/lib/actions/workspace"
import { cn } from "@/lib/utils"
import { EvidenceList } from "@/components/chat/evidence-list"
import { clientLogger } from "@/lib/utils/client-logger"
import { useOptionalHighlightContext, type Highlight } from "@/lib/contexts/highlight-context"
import { fetchCsrfToken } from "@/lib/utils/csrf"
import { useI18n } from "@/lib/i18n/use-i18n"

type UseAiChatOptions = Parameters<typeof useAiChat>[0]

type MessageCitation = {
  id?: string
  quote: string
  documentId: string
  documentTitle?: string | null
  textSpan?: { start: number; end: number }
  pageNumber?: number
}

type MessageSourcesPayload = {
  documents: any[]
  citations: MessageCitation[]
}

const CITATION_MARKER_REGEX = /\[citation:\s*\{[\s\S]*?\}\]/g
const CITATION_PARTIAL_REGEX = /\[citation:[^\]]*$/i
const PENDING_HIGHLIGHT_STORAGE_KEY = "agora:pendingHighlight"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ADVISORY_SYNC_LOG_KEY = "agora:lastSyncWarning"
const isGeneratedMessageId = (id: unknown) => typeof id === "string" && id.startsWith("msg-")

const sanitizeMessageContent = (content: string): string => {
  if (!content) {
    return ""
  }
  return content
    .replace(CITATION_MARKER_REGEX, "")
    .replace(CITATION_PARTIAL_REGEX, "")
    .replace(/\s*\[doc\]\s*/gi, "")
}

const getMessageSourcesPayload = (message: any): MessageSourcesPayload => {
  const rawSources = message?.sources
  if (Array.isArray(rawSources)) {
    return { documents: rawSources, citations: [] }
  }
  if (rawSources && typeof rawSources === "object") {
    const documents = Array.isArray(rawSources.documents) ? rawSources.documents : []
    const citations = Array.isArray(rawSources.citations) ? rawSources.citations : []
    return { documents, citations }
  }
  return { documents: [], citations: [] }
}


/**
 * Search for a single quote in the document
 * Returns the highlight if found and validated, null otherwise
 */

function useChatWithInput(options: UseAiChatOptions) {
  const chat = useAiChat(options) as ReturnType<typeof useAiChat>
  const [input, setInputState] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputHistoryRef = useRef<string[]>([""])
  const historyIndexRef = useRef(0)
  const HISTORY_LIMIT = 200

  const pushHistory = useCallback((value: string) => {
    const history = inputHistoryRef.current.slice(0, historyIndexRef.current + 1)
    if (history[history.length - 1] === value) {
      return
    }
    history.push(value)
    if (history.length > HISTORY_LIMIT) {
      history.shift()
    }
    inputHistoryRef.current = history
    historyIndexRef.current = history.length - 1
  }, [])

  const setInput = useCallback(
    (value: string) => {
      setInputState(value)
      pushHistory(value)
    },
    [pushHistory],
  )

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(event.target.value)
    },
    [setInput],
  )

  const handleSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
      const trimmed = input.trim()
      if (!trimmed) {
        return
      }

      setInput("")
      setIsSubmitting(true)
      try {
        await chat.sendMessage({ text: trimmed })
      } finally {
        setIsSubmitting(false)
      }
    },
    [chat, input, setInput],
  )

  const undoInput = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      return
    }
    historyIndexRef.current -= 1
    const previousValue = inputHistoryRef.current[historyIndexRef.current] ?? ""
    setInputState(previousValue)
  }, [])

  const redoInput = useCallback(() => {
    if (historyIndexRef.current >= inputHistoryRef.current.length - 1) {
      return
    }
    historyIndexRef.current += 1
    const nextValue = inputHistoryRef.current[historyIndexRef.current] ?? ""
    setInputState(nextValue)
  }, [])

  const isLoading = chat.status === "submitted" || chat.status === "streaming" || isSubmitting

  return {
    ...chat,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    undoInput,
    redoInput,
    isLoading,
  }
}

interface ChatInterfaceProps {
  workspaceId?: string
  spaceId?: string
  conversationId: string
  initialMessages?: any[]
  documentId?: string // Optional: when provided, only show this document
  canManage?: boolean
}

export function ChatInterface({ workspaceId, spaceId, conversationId, initialMessages = [], documentId, canManage = true }: ChatInterfaceProps) {
  const highlightContext = useOptionalHighlightContext()
  const canUseHighlights = Boolean(highlightContext)
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false)
  const [documents, setDocuments] = useState<any[]>([])
  const [contextNotes, setContextNotes] = useState<WorkspaceNoteForContext[]>([])
  const [evidenceItems, setEvidenceItems] = useState<any[]>([])
  const [evidenceVersion, setEvidenceVersion] = useState(0) // Force re-render on evidence update
  const [workspaceContextText, setWorkspaceContextText] = useState<string | null>(null)
  const [workspaceLocation, setWorkspaceLocation] = useState<string | null>(null)
  const [hasLoadedWorkspaceMetadata, setHasLoadedWorkspaceMetadata] = useState(false)
  const [excludedDocumentIds, setExcludedDocumentIds] = useState<Set<string>>(new Set())
  const [excludedNoteIds, setExcludedNoteIds] = useState<Set<string>>(new Set())
  const [excludedEvidenceIds, setExcludedEvidenceIds] = useState<Set<string>>(new Set())
  /** Answers after this message index are read aloud, because their question was spoken. */
  const [autoReadAfter, setAutoReadAfterState] = useState<number | null>(() => spokenQuestion.after)
  const setAutoReadAfter = useCallback((after: number | null) => {
    spokenQuestion.after = after
    setAutoReadAfterState(after)
  }, [])
  const { t } = useI18n()

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
    spaceId,
    conversationId,
    excludedDocumentIds: Array.from(excludedDocumentIds),
    excludedNoteIds: Array.from(excludedNoteIds),
    excludedEvidenceIds: Array.from(excludedEvidenceIds),
  })
  const syncRequestBodyRef = useCallback(
    (overrides?: {
      excludedDocumentIds?: Set<string>
      excludedNoteIds?: Set<string>
      excludedEvidenceIds?: Set<string>
    }) => {
      const nextExcludedDocs = overrides?.excludedDocumentIds ?? excludedDocumentIds
      const nextExcludedNotes = overrides?.excludedNoteIds ?? excludedNoteIds
      const nextExcludedEvidence = overrides?.excludedEvidenceIds ?? excludedEvidenceIds

      requestBodyRef.current = {
        workspaceId,
        spaceId,
        conversationId,
        excludedDocumentIds: Array.from(nextExcludedDocs),
        excludedNoteIds: Array.from(nextExcludedNotes),
        excludedEvidenceIds: Array.from(nextExcludedEvidence),
      }
    },
    [workspaceId, spaceId, conversationId, excludedDocumentIds, excludedNoteIds, excludedEvidenceIds],
  )
  const csrfTokenRef = useRef<string | null>(null)
  const processedAutoHighlightsRef = useRef<Set<string>>(new Set())
  const syncedAssistantMessagesRef = useRef<Set<string>>(new Set())

  // Fetch CSRF token on mount and keep it in ref
  useEffect(() => {
    fetchCsrfToken().then(token => {
      csrfTokenRef.current = token
    })
  }, [])

  useEffect(() => {
    processedAutoHighlightsRef.current.clear()
  }, [conversationId])

  useEffect(() => {
    syncRequestBodyRef()
  }, [syncRequestBodyRef])

  const chatTransport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        body: () => requestBodyRef.current,
        headers: (): Record<string, string> => {
          if (!csrfTokenRef.current) {
            clientLogger.error("[ChatInterface] Missing CSRF token for chat request")
            return {}
          }
          return { "x-csrf-token": csrfTokenRef.current }
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
      if (spaceId) {
        const result = await getSpaceItems(spaceId, { item_type: "document" })
        if (result.error) {
          clientLogger.error("[ChatInterface] Failed to fetch library documents:", result.error)
        }
        const mapped = (result.data ?? []).map((item: any) => ({
          id: item.id,
          title: item.payload?.title || item.payload?.file_name || "Untitled document",
        }))
        setDocuments(documentId ? mapped.filter((doc: { id: string }) => doc.id === documentId) : mapped)
        setContextNotes([])
        setEvidenceItems([])
        setWorkspaceContextText(null)
        setWorkspaceLocation(null)
        setHasLoadedWorkspaceMetadata(true)
        return
      }

      if (!workspaceId) {
        setDocuments([])
        setContextNotes([])
        setEvidenceItems([])
        setHasLoadedWorkspaceMetadata(true)
        return
      }

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
  }, [workspaceId, spaceId, documentId])

  useEffect(() => {
    loadContextItems()
  }, [loadContextItems])

  // Incremental update functions for specific context items
  const updateDocuments = useCallback(async () => {
    if (spaceId) {
      const result = await getSpaceItems(spaceId, { item_type: "document" })
      const mapped = (result.data ?? []).map((item: any) => ({
        id: item.id,
        title: item.payload?.title || item.payload?.file_name || "Untitled document",
      }))
      setDocuments(documentId ? mapped.filter((doc: { id: string }) => doc.id === documentId) : mapped)
      return
    }
    if (!workspaceId) {
      return
    }
    try {
      const result = await getWorkspaceDocuments(workspaceId)
      if (result.error) {
        clientLogger.error("[ChatInterface] Failed to fetch documents:", result.error)
        return
      }

      if (documentId) {
        const currentDoc = result.data?.find((doc: any) => doc.id === documentId)
        setDocuments(currentDoc ? [currentDoc] : [])
      } else {
        setDocuments(result.data ?? [])
      }
    } catch (error) {
      clientLogger.error("[ChatInterface] Failed to update documents:", error)
    }
  }, [workspaceId, spaceId, documentId])

  const updateNotes = useCallback(async () => {
    if (!workspaceId) {
      return
    }
    try {
      const notesResult = await getWorkspaceNotesForContext(workspaceId)
      if (notesResult.error) {
        clientLogger.error("[ChatInterface] Failed to fetch workspace notes:", notesResult.error)
        setContextNotes([])
      } else {
        setContextNotes(notesResult.data)
      }
    } catch (error) {
      clientLogger.error("[ChatInterface] Failed to update notes:", error)
    }
  }, [workspaceId])

  const updateEvidence = useCallback(async () => {
    if (!workspaceId) {
      return
    }
    try {
      const result = await getWorkspaceItems(workspaceId, { inheritance: "local" })
      if (result.error) {
        clientLogger.error("[ChatInterface] Failed to fetch evidence items:", result.error)
        return
      }
      // Filter for evidence items with include_in_ai_context=true
      const evidenceData = (result.data ?? []).filter(
        (item: any) => item.payload?.type === "evidence" && item.include_in_ai_context === true,
      )
      setEvidenceItems(evidenceData)
    } catch (error) {
      clientLogger.error("[ChatInterface] Failed to update evidence:", error)
    }
  }, [workspaceId])

  const updateWorkspaceContext = useCallback(async () => {
    if (!workspaceId) {
      return
    }
    try {
      const result = await getWorkspaceContextDetails(workspaceId)
      if (result.error) {
        clientLogger.error("[ChatInterface] Failed to fetch workspace context:", result.error)
        return
      }
      const data = result.data ?? { context: null, location: null }
      setWorkspaceContextText(typeof data.context === "string" ? data.context : null)
      setWorkspaceLocation(typeof data.location === "string" ? data.location : null)
    } catch (error) {
      clientLogger.error("[ChatInterface] Failed to update workspace context:", error)
    }
  }, [workspaceId])

  // Refresh documents when window becomes visible after being hidden for a while
  // Only reloads if page was hidden for more than 30 seconds to avoid unnecessary reloads
  useEffect(() => {
    let hiddenTime: number | null = null
    const MIN_HIDDEN_DURATION = 30000 // 30 seconds

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page became hidden - record the time
        hiddenTime = Date.now()
      } else {
        // Page became visible - only reload if it was hidden for a significant duration
        if (hiddenTime !== null) {
          const hiddenDuration = Date.now() - hiddenTime
          if (hiddenDuration > MIN_HIDDEN_DURATION) {
            clientLogger.debug(
              `[ChatInterface] Page was hidden for ${hiddenDuration}ms, refreshing context items`,
            )
            loadContextItems()
          }
          hiddenTime = null
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [loadContextItems])

  // Listen for document upload and context update events - with incremental updates
  useEffect(() => {
    const handleContextUpdate = (event: CustomEvent<{ workspaceId?: string; type?: string; action?: string }>) => {
      const eventWorkspaceId = event.detail?.workspaceId
      if (eventWorkspaceId && eventWorkspaceId !== workspaceId) {
        return // Ignore events from other workspaces
      }

      const updateType = event.detail?.type
      const action = event.detail?.action

      clientLogger.debug(
        `[ChatInterface] Context event received (${event.type}), type: ${updateType}, action: ${action}`,
      )

      // Handle incremental updates based on what changed
      if (event.type === "documentUploaded") {
        // Document was uploaded - update only documents list
        updateDocuments()
      } else if (event.type === "workspaceContextUpdated") {
        // Workspace context changed - update specific items based on type
        switch (updateType) {
          case "document":
            updateDocuments()
            break
          case "note":
            updateNotes()
            break
          case "evidence":
            updateEvidence()
            break
          case "workspace":
            updateWorkspaceContext()
            break
          default:
            // If type is not specified, do a full reload as fallback
            clientLogger.debug("[ChatInterface] No specific type in event, doing full context reload")
            loadContextItems()
        }
      }
    }

    window.addEventListener("documentUploaded" as any, handleContextUpdate as EventListener)
    window.addEventListener("workspaceContextUpdated" as any, handleContextUpdate as EventListener)

    return () => {
      window.removeEventListener("documentUploaded" as any, handleContextUpdate as EventListener)
      window.removeEventListener("workspaceContextUpdated" as any, handleContextUpdate as EventListener)
    }
  }, [workspaceId, updateDocuments, updateNotes, updateEvidence, updateWorkspaceContext, loadContextItems])

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
    clientLogger.info("[ChatInterface] evidenceItems changed, new count:", evidenceItems.length)
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

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    undoInput,
    redoInput,
    isLoading,
    setMessages,
    stop,
    setInput,
    sendMessage,
    error: chatError,
  } = useChatWithInput({
    transport: chatTransport,
    messages: hasLoadedInitial ? undefined : (normalizedInitialMessages as any),
  })

  // useChat may briefly return undefined before hydration; always work with a string
  const safeInput = typeof input === "string" ? input : input != null ? String(input) : ""

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const key = event.key.toLowerCase()
      const isModifier = event.metaKey || event.ctrlKey

      if (isModifier && key === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redoInput()
        } else {
          undoInput()
        }
        return
      }

      if (!event.metaKey && event.ctrlKey && key === "y") {
        event.preventDefault()
        redoInput()
        return
      }

      if (event.key === "Enter" && !event.altKey && !event.shiftKey) {
        if (isModifier) {
          event.preventDefault()
          setAutoReadAfter(null)
          handleSubmit(event as any)
          return
        }
        if (!isModifier) {
          event.preventDefault()
          setAutoReadAfter(null)
          handleSubmit(event as any)
          return
        }
      }
    },
    [handleSubmit, redoInput, setAutoReadAfter, undoInput],
  )

  const deriveHighlightId = useCallback(
    (citation: MessageCitation, messageKey: string, citationIndex: number) => {
      if (citation.id && citation.id.length > 0) {
        return `${messageKey}-${citation.id}`
      }
      return `ai-citation-${messageKey}-${citationIndex}`
    },
    [],
  )

  const focusCitationHighlight = useCallback(
    (citation: MessageCitation, messageKey: string, citationIndex: number) => {
      if (!citation.documentId || !citation.textSpan) {
        clientLogger.warn("[ChatInterface] Citation missing data for focus", citation)
        return
      }

      if (highlightContext) {
        const highlightId = deriveHighlightId(citation, messageKey, citationIndex)
        const highlight: Highlight = {
          id: highlightId,
          documentId: citation.documentId,
          textSpan: citation.textSpan,
          pageNumber: citation.pageNumber || 1,
          quote: citation.quote,
          source: "ai_response",
          confidence: "exact",
          color: "rgba(255, 221, 0, 0.45)",
        }
        highlightContext.addHighlight(citation.documentId, highlight)
        highlightContext.setActiveDocument(citation.documentId)
      }

      if (typeof window === "undefined") {
        return
      }

      const highlightId = deriveHighlightId(citation, messageKey, citationIndex)
      const pendingPayload = {
        documentId: citation.documentId,
        highlightId,
        pageNumber: citation.pageNumber || 1,
        textSpan: citation.textSpan,
        timestamp: Date.now(),
        quote: citation.quote,
        source: "ai_response" as const,
        confidence: "exact" as const,
        color: "rgba(255, 221, 0, 0.45)",
      }

      const dispatchScrollEvent = () => {
        window.dispatchEvent(
          new CustomEvent("focusDocumentHighlight", {
            detail: pendingPayload,
          }),
        )
      }

      const targetUrl = new URL(
        spaceId
          ? `/spaces/${spaceId}/documents/${citation.documentId}`
          : `/workspaces/${workspaceId}/documents/${citation.documentId}`,
        window.location.origin,
      )
      if (conversationId) {
        targetUrl.searchParams.set("conversationId", conversationId)
      }
      const targetHref = targetUrl.pathname + targetUrl.search
      const isSameDocument = window.location.pathname === targetUrl.pathname

      window.sessionStorage.setItem(PENDING_HIGHLIGHT_STORAGE_KEY, JSON.stringify(pendingPayload))

      if (!isSameDocument) {
        try {
          router.push(targetHref)
        } catch (error) {
          console.error("[ChatInterface] Failed to navigate to document for highlight:", error)
        }
      } else {
        setTimeout(() => {
          dispatchScrollEvent()
        }, 120)
      }
    },
    [conversationId, deriveHighlightId, highlightContext, router, workspaceId, spaceId],
  )

  const hoverCitationHighlight = useCallback(
    (citation: MessageCitation, messageKey: string, citationIndex: number, isActive: boolean) => {
      if (typeof window === "undefined") {
        return
      }
      if (!citation.documentId || !citation.textSpan) {
        return
      }
      const highlightId = deriveHighlightId(citation, messageKey, citationIndex)
      window.dispatchEvent(
        new CustomEvent("hoverDocumentHighlight", {
          detail: {
            documentId: citation.documentId,
            highlightId,
            textSpan: citation.textSpan,
            active: isActive,
          },
        }),
      )
    },
    [deriveHighlightId],
  )

  useEffect(() => {
    if (!highlightContext) {
      return
    }

    messages.forEach((message: any, index: number) => {
      if (!message || message.role !== "assistant") {
        return
      }

      const messageKey = getMessageKey(message, index)
      if (processedAutoHighlightsRef.current.has(messageKey)) {
        return
      }

      const { citations } = getMessageSourcesPayload(message)
      if (!Array.isArray(citations) || citations.length === 0) {
        return
      }

      let addedAtLeastOne = false
      citations.forEach((citation, citationIndex) => {
        if (!citation.documentId || !citation.textSpan) {
          return
        }

        const highlightId = deriveHighlightId(citation, messageKey, citationIndex)
        const highlight: Highlight = {
          id: highlightId,
          documentId: citation.documentId,
          textSpan: citation.textSpan,
          pageNumber: citation.pageNumber || 1,
          quote: citation.quote,
          source: "ai_response",
          confidence: "exact",
          color: "rgba(255, 221, 0, 0.45)",
        }
        highlightContext.addHighlight(citation.documentId, highlight)
        addedAtLeastOne = true
      })

      if (addedAtLeastOne) {
        processedAutoHighlightsRef.current.add(messageKey)
      }
    })
  }, [messages, highlightContext, deriveHighlightId])

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
            clientLogger.error("Failed to fetch message sources:", error)
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
      setInput("")
      if (highlightContext) {
        if (documentId) {
          highlightContext.setHighlights(documentId, [], true)
        } else {
          highlightContext.clearAllHighlights()
        }
      }
    }
  }, [conversationId, setInput, highlightContext, documentId])

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
      setEllipsis("")

      interval = setInterval(() => {
        setEllipsis((prev) => {
          // Cycle through: "" -> "." -> ".." -> "..." -> ""
          if (prev.length >= 3) {
            return ""
          }
          return prev + "."
        })
      }, 400)
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
      syncRequestBodyRef({ excludedDocumentIds: newSet })
      return newSet
    })
  }

  const handleRestoreDocument = (documentId: string) => {
    setExcludedDocumentIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(documentId)
      syncRequestBodyRef({ excludedDocumentIds: newSet })
      return newSet
    })
  }

  const handleRemoveNote = (noteId: string) => {
    setExcludedNoteIds((prev) => {
      const newSet = new Set(prev)
      newSet.add(noteId)
      syncRequestBodyRef({ excludedNoteIds: newSet })
      return newSet
    })
  }

  const handleRestoreNote = (noteId: string) => {
    setExcludedNoteIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(noteId)
      syncRequestBodyRef({ excludedNoteIds: newSet })
      return newSet
    })
  }

  const handleRemoveEvidence = (evidenceId: string) => {
    setExcludedEvidenceIds((prev) => {
      const newSet = new Set(prev)
      newSet.add(evidenceId)
      syncRequestBodyRef({ excludedEvidenceIds: newSet })
      return newSet
    })
  }

  const handleRestoreEvidence = (evidenceId: string) => {
    setExcludedEvidenceIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(evidenceId)
      syncRequestBodyRef({ excludedEvidenceIds: newSet })
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

  const pendingAssistantSync = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (!msg || msg.role !== "assistant") {
        continue
      }
      const messageKey = getMessageKey(msg, i)
      if (syncedAssistantMessagesRef.current.has(messageKey)) {
        continue
      }
      const hasPersistentId = typeof msg.id === "string" && !isGeneratedMessageId(msg.id)
      const { citations } = getMessageSourcesPayload(msg)
      const hasCitations = Array.isArray(citations) && citations.length > 0
      if (!hasPersistentId || !hasCitations) {
        return { index: i, messageKey }
      }
      break
    }
    return null
  }, [messages])

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
    const { documents: pendingSources } = getMessageSourcesPayload(message)

    const rawAnswer = readMessageContent(message)
    const cleanedAnswer = sanitizeMessageContent(rawAnswer)

    setPendingEvidence({
      messageKey,
      question,
      answer: cleanedAnswer,
      sources: pendingSources,
    })
  }

  /** Retry highlight functionality removed */
  useEffect(() => {
    if (!conversationId || !pendingAssistantSync || isLoading) {
      return
    }

    if (!UUID_REGEX.test(conversationId)) {
      return
    }

    const { index: syncIndex, messageKey } = pendingAssistantSync
    if (syncedAssistantMessagesRef.current.has(messageKey)) {
      return
    }
    syncedAssistantMessagesRef.current.add(messageKey)

    let aborted = false
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    const MAX_RETRIES = 5
    const RETRY_DELAY_MS = 800

    const syncLatestAssistantMessage = async (attempt = 0) => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/messages/latest`)

        if (response.status === 404 || response.status === 400) {
          if (attempt < MAX_RETRIES && !aborted) {
            retryTimeout = setTimeout(() => {
              syncLatestAssistantMessage(attempt + 1)
            }, RETRY_DELAY_MS * (attempt + 1))
            return
          }
          const infoKey = `${ADVISORY_SYNC_LOG_KEY}:${conversationId}:${messageKey}`
          if (typeof window !== "undefined") {
            const lastWarning = window.sessionStorage.getItem(infoKey)
            if (!lastWarning) {
              clientLogger.info(
                `[ChatInterface] Assistant message not yet available after ${attempt} attempts. Continuing without auto-sync.`,
              )
              window.sessionStorage.setItem(infoKey, "shown")
            }
          }
          syncedAssistantMessagesRef.current.delete(messageKey)
          return
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch latest assistant message: ${response.status}`)
        }

        const data = await response.json()
        if (aborted || !data?.message) {
          return
        }

        const normalized = normalizeMessage(data.message)
        setMessages((prev: any[]) => {
          const next = [...prev]
          next[syncIndex] = normalized
          return next
        })
      } catch (error) {
        if (!aborted) {
          clientLogger.error("[ChatInterface] Failed to sync latest assistant message:", error)
        }
        syncedAssistantMessagesRef.current.delete(messageKey)
      }
    }

    syncLatestAssistantMessage()

    return () => {
      aborted = true
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
    }
  }, [conversationId, isLoading, normalizeMessage, pendingAssistantSync, setMessages])

  const handleCloseEvidenceDialog = () => {
    if (isSavingEvidence) {
      return
    }
    setPendingEvidence(null)
    setEvidenceError(null)
  }

  const refreshEvidenceItems = async () => {
    try {
      const currentCount = evidenceItems.length
      // Query Supabase directly from client to bypass server action cache
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("workspace_items")
        .select(
          "*, created_by:profiles(id, email, full_name), source_space_item:space_items(id, item_type, classification, payload, source_url, source_doc_id, source_page)",
        )
        .eq("workspace_id", workspaceId)
        .eq("inheritance", "local")
        .order("created_at", { ascending: false })
      
      if (error) {
        clientLogger.error("[ChatInterface] Failed to refresh evidence items:", error)
        return
      }
      
      // Filter for evidence items with include_in_ai_context=true
      const evidenceData = (data ?? []).filter(
        (item: any) => item.payload?.type === "evidence" && item.include_in_ai_context === true,
      )
      clientLogger.info("[ChatInterface] Refreshed evidence items:", {
        previousCount: currentCount,
        totalWorkspaceItems: data?.length ?? 0,
        filteredEvidenceCount: evidenceData.length,
        countIncreased: evidenceData.length > currentCount,
        sampleItem: evidenceData[0] ? {
          id: evidenceData[0].id,
          type: evidenceData[0].payload?.type,
          include_in_ai_context: evidenceData[0].include_in_ai_context,
        } : 'none'
      })
      // Force state update with new array reference to trigger re-render
      setEvidenceItems([...evidenceData])
      // Increment version to force component re-render
      setEvidenceVersion(prev => prev + 1)
    } catch (error) {
      clientLogger.error("[ChatInterface] Failed to refresh evidence items:", error)
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
        const result = await response.json()
        clientLogger.info("[ChatInterface] Evidence saved successfully:", result)
        updateEvidenceStatus(messageKey, "success")
        setPendingEvidence(null)
        // Small delay to ensure database write has completed
        await new Promise(resolve => setTimeout(resolve, 300))
        // Refresh evidence items from server to ensure UI is in sync
        clientLogger.info("[ChatInterface] Refreshing evidence items after save...")
        await refreshEvidenceItems()
        
        // Emit custom event to notify workspace page that evidence was saved
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('evidenceSaved', { detail: { workspaceId } })
          window.dispatchEvent(event)
          clientLogger.info("[ChatInterface] Dispatched evidenceSaved event")
        }
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
  // Use evidenceVersion to ensure React detects changes
  const availableEvidence = evidenceItems.filter((item) => !excludedEvidenceIds.has(item.id))
  const excludedEvidence = evidenceItems.filter((item) => excludedEvidenceIds.has(item.id))
  
  // Log for debugging counter update
  if (typeof window !== 'undefined' && evidenceVersion > 0) {
    clientLogger.info("[ChatInterface] Rendering with evidence counts:", {
      evidenceItemsLength: evidenceItems.length,
      availableEvidenceLength: availableEvidence.length,
      excludedEvidenceLength: excludedEvidence.length,
      evidenceVersion
    })
  }
  const isContextLoading = isLoadingDocuments || isLoadingNotes || isLoadingEvidence
  const hasContextItems =
    hasLoadedWorkspaceMetadata || documents.length > 0 || contextNotes.length > 0 || evidenceItems.length > 0

  const formatIncludedLabel = (count: number) => t("workspace.chat.interface.context.included", undefined, { count })
  const formatExcludedLabel = (count: number) => t("workspace.chat.interface.context.excluded", undefined, { count })
  const formatThoughtDurationLabel = (duration?: number | null) => {
    if (duration !== undefined && duration !== null && !Number.isNaN(duration)) {
      return t("workspace.chat.interface.messages.thoughtFor", undefined, { duration: formatDuration(duration) })
    }
    return t("workspace.chat.interface.messages.thought")
  }

  const emptyStateDescription = documentId
    ? t("workspace.chat.interface.empty.descriptionDocument")
    : t("workspace.chat.interface.empty.descriptionDocuments")

  const inputPlaceholder = documentId
    ? t("workspace.chat.interface.input.placeholderDocument")
    : t("workspace.chat.interface.input.placeholderDocuments")

  // Pre-compute badge information for all messages to prevent flash

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
              {t("workspace.chat.interface.controls.clear")}
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 text-xs h-6">
              <span className="text-muted-foreground">{t("workspace.chat.interface.controls.confirmQuestion")}</span>
              <button
                type="button"
                className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors h-6"
                onClick={() => setIsClearConfirmOpen(false)}
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                className="px-2 py-1 text-destructive hover:text-destructive/80 transition-colors h-6"
                onClick={() => {
                  handleClearMessages()
                  setIsClearConfirmOpen(false)
                }}
              >
                {t("workspace.chat.interface.controls.confirm")}
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
              <h3 className="mb-2 text-lg font-semibold">{t("workspace.chat.interface.empty.title")}</h3>
              <p className="text-sm text-muted-foreground">{emptyStateDescription}</p>
            </div>
          </div>
        )}

        {messages.map((message: any, index: number) => {
          const isUser = message.role === "user"
          const isAssistant = message.role === "assistant"
          const isLastAssistant = isAssistant && index === messages.length - 1
          const isStreamingAssistant = isAssistant && isLastAssistant && isLoading
          const shouldShowThinkingTooltip = isAssistant && !isStreamingAssistant
          const shouldShowLiveThinking = isStreamingAssistant
          const messageKey = getMessageKey(message, index)
          const evidenceStatusEntry = evidenceStatusByMessage[messageKey]
          const evidenceStatus = evidenceStatusEntry?.status ?? "idle"
          const { citations } = getMessageSourcesPayload(message)
          const rawContent = readMessageContent(message)
          const priorUserQuestion = isAssistant
            ? [...messages.slice(0, index)]
                .reverse()
                .find((entry: { role?: string }) => entry.role === "user")
            : null
          const displayContent = isAssistant
            ? compileAskAnswer(sanitizeMessageContent(rawContent), {
                question: priorUserQuestion ? readMessageContent(priorUserQuestion) : null,
              })
            : sanitizeMessageContent(rawContent)

          const thinkingLabel = (() => {
            if (message.thinking_duration !== null && message.thinking_duration !== undefined) {
              const duration =
                typeof message.thinking_duration === "number"
                  ? message.thinking_duration
                  : Number.parseFloat(String(message.thinking_duration))
              if (!isNaN(duration)) {
                return formatThoughtDurationLabel(duration)
              }
            }

            if (thinkingDurations.has(index)) {
              const duration = thinkingDurations.get(index)!
              return formatThoughtDurationLabel(duration)
            }

            if (isLastAssistant && lastThinkingDuration !== null) {
              return formatThoughtDurationLabel(lastThinkingDuration)
            }

            return t("workspace.chat.interface.messages.thought")
          })()

          const messageAlignment = isUser ? "justify-end" : "justify-start"

          return (
            <div key={messageKey} className={cn("flex", messageAlignment)}>
              <div className="space-y-2 group">
                {shouldShowLiveThinking && (
                  <div className="flex items-center px-2 mb-1 animate-pulse">
                    <span className="text-xs italic text-muted-foreground">
                      {t("workspace.chat.interface.messages.thinking")}
                      {ellipsis}
                    </span>
                  </div>
                )}

                {shouldShowThinkingTooltip && (
                  <span className="text-xs italic text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {thinkingLabel}
                  </span>
                )}

                <div
                  className={cn(
                    "max-w-[80%] sm:max-w-[60ch] rounded-2xl px-3 py-2 text-sm break-words",
                    isUser && "bg-primary/5 text-foreground",
                    isAssistant && "space-y-2",
                  )}
                >
                  <FormattedMarkdown>{displayContent}</FormattedMarkdown>

                  {isAssistant && citations.length > 0 && canUseHighlights && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {citations.map((citation, citationIndex) => {
                        const key = `${messageKey}-${citation.id || citationIndex}`
                        const label = citation.pageNumber ? `p.${citation.pageNumber}` : `${citationIndex + 1}`
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => focusCitationHighlight(citation, messageKey, citationIndex)}
                            onMouseEnter={() => hoverCitationHighlight(citation, messageKey, citationIndex, true)}
                            onMouseLeave={() => hoverCitationHighlight(citation, messageKey, citationIndex, false)}
                            className="inline-flex items-center gap-1 rounded-full border border-muted/70 bg-card/80 px-2.5 py-1 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-primary/5 focus:outline-none focus-visible:ring focus-visible:ring-primary/40 cursor-pointer"
                          >
                            <Highlighter className="h-3 w-3 text-primary" />
                            <span>{label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {isAssistant && citations.length === 0 && !isStreamingAssistant && canUseHighlights && (
                    <div className="pt-2">
                      <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900/80">
                        {t("workspace.chat.interface.messages.noHighlights")}
                      </div>
                    </div>
                  )}
                  </div>

                  {isAssistant && !isStreamingAssistant && displayContent.trim() ? (
                    <div className="flex items-center pt-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                      <ReadAloudButton
                        id={`${conversationId}-${index}`}
                        text={displayContent}
                        workspaceId={workspaceId}
                        autoPlay={autoReadAfter !== null && index > autoReadAfter}
                      />
                    </div>
                  ) : null}

                  {isAssistant && canManage && !spaceId && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                              {t("workspace.chat.interface.evidence.saving")}
                            </>
                          ) : (
                            <>
                              <Plus className="mr-1 h-3 w-3" />
                              {t("workspace.chat.interface.evidence.save")}
                            </>
                          )}
                        </Button>
                        {evidenceStatus === "success" && (
                          <span className="text-xs text-emerald-600">{t("workspace.chat.interface.evidence.saved")}</span>
                        )}
                        {evidenceStatus === "error" && evidenceStatusEntry?.error && (
                          <span className="text-xs text-destructive">{evidenceStatusEntry.error}</span>
                        )}
                    </div>
                  )}
              </div>
            </div>
          )
        })}

        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
          <div className="flex justify-start">
            <div className="flex items-center px-2 animate-pulse">
              <span className="text-sm italic text-muted-foreground">
                {t("workspace.chat.interface.messages.thinking")}
                {ellipsis}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-card p-4 space-y-2">
        {chatError && (
          <p className="text-sm text-destructive pl-1" role="alert">
            {t("workspace.chat.interface.input.failed")}
          </p>
        )}
        <form
          onSubmit={(event) => {
            setAutoReadAfter(null)
            void handleSubmit(event)
          }}
          className="relative"
        >
          <Textarea
            ref={inputRef}
            value={safeInput}
            onChange={handleInputChange}
            placeholder={inputPlaceholder}
            className={cn("min-h-[60px] flex-1 resize-none shadow", isLoading ? "pr-28" : "pr-20")}
            onKeyDown={handleTextareaKeyDown}
            data-guidance-target="ask-input"
          />
          <DictationButton
            workspaceId={workspaceId}
            disabled={isLoading}
            className={cn("absolute bottom-2", isLoading ? "right-[4.75rem]" : "right-11")}
            onText={(text) => {
              setAutoReadAfter(messages.length)
              void sendMessage({ text })
            }}
          />
          {isLoading && (
            <IconTooltip label={t("workspace.chat.interface.input.stop")} className="absolute bottom-2 right-11">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleStop}
                className="h-6 w-6 p-0"
                aria-label={t("workspace.chat.interface.input.stop")}
              >
                <CircleStop className="h-3 w-3" />
              </Button>
            </IconTooltip>
          )}
          <IconTooltip label={t("workspace.chat.interface.input.send")} className="absolute bottom-2 right-3">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              disabled={isLoading || !safeInput.trim()}
              className="h-6 w-6 p-0"
              aria-label={t("workspace.chat.interface.input.send")}
              data-guidance-target="ask-send"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            </Button>
          </IconTooltip>
        </form>
        <p className="text-xs text-muted-foreground pl-3">{t("workspace.chat.interface.input.hint")}</p>

        {/* AI context accordion */}
        {!isContextLoading && hasContextItems && (
          <Accordion type="single" collapsible defaultValue="documents" className="mt-4">
            <AccordionItem value="documents" className="border-none">
              <AccordionTrigger className="py-3 text-xs font-medium text-muted-foreground hover:no-underline data-[state=closed]:inline-flex data-[state=closed]:items-center data-[state=closed]:rounded-full data-[state=closed]:bg-secondary data-[state=closed]:px-3 data-[state=closed]:py-2 data-[state=closed]:w-fit [&[data-state=closed]_svg]:translate-y-0">
                <span>{t("workspace.chat.interface.context.title")}</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <TooltipProvider>
                  <div className="space-y-3">
                    <div className="rounded-md border border-border/60 bg-secondary/10 px-3 py-2">
                      <p className="text-xs font-medium text-foreground/90">
                        {spaceId
                          ? t("workspace.chat.interface.context.scopeAlwaysIncludedAuthority")
                          : t("workspace.chat.interface.context.scopeAlwaysIncluded")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {documentId
                        ? t(
                            spaceId
                              ? "workspace.chat.interface.context.documentNoticeAuthority"
                              : "workspace.chat.interface.context.documentNotice",
                          )
                        : t("workspace.chat.interface.context.selectionDescription")}
                    </p>
                    {documentId ? (
                      // Simple view for document viewer - no tabs, just show the document
                      <div className="space-y-4 mt-3">
                        {(availableSourceDocuments.length > 0 || availableInheritedDocuments.length > 0) && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {t("workspace.chat.interface.context.documentLabel")}
                            </p>
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
                    ) : spaceId ? (
                      <div className="space-y-3 mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("workspace.chat.interface.context.sharedLibraryFiles")}{" "}
                          <span className="font-normal">({availableSourceDocuments.length})</span>
                        </p>
                        {availableSourceDocuments.length > 0 && (
                          <div>
                            <div className="flex flex-wrap gap-2">
                              {availableSourceDocuments.map((doc) => (
                                <Tooltip key={doc.id}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="secondary"
                                      className="cursor-pointer hover:bg-secondary/80 pr-1"
                                      onClick={() => handleRemoveDocument(doc.id)}
                                    >
                                      <FileText className="mr-1 h-3 w-3" />
                                      <span className="max-w-[200px] truncate">{doc.title}</span>
                                      <X className="ml-1 h-3 w-3" />
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
                        {excludedSourceDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {formatExcludedLabel(excludedSourceDocuments.length)}
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
                          <p className="text-xs text-muted-foreground">
                            {t("workspace.chat.interface.context.noSharedLibraryFiles")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Tabs defaultValue="sources" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 h-8" key={`tablist-${evidenceVersion}-${availableEvidence.length}`}>
                          <TabsTrigger value="sources" className="text-xs" key={`src-${availableSourceDocuments.length}`}>
                            {t("workspace.tabs.sources")}{" "}
                            <span className="font-normal">({availableSourceDocuments.length})</span>
                          </TabsTrigger>
                          <TabsTrigger value="inherited" className="text-xs" key={`inh-${availableInheritedDocuments.length}`}>
                            {t("workspace.tabs.inherited")}{" "}
                            <span className="font-normal">({availableInheritedDocuments.length})</span>
                          </TabsTrigger>
                          <TabsTrigger value="evidence" className="text-xs" key={`ev-${availableEvidence.length}-${evidenceVersion}`}>
                            {t("workspace.tabs.evidence")}{" "}
                            <span className="font-normal" key={`ev-count-${availableEvidence.length}`}>
                              ({availableEvidence.length})
                            </span>
                          </TabsTrigger>
                          <TabsTrigger value="notes" className="text-xs" key={`notes-${availableNotes.length}`}>
                            {t("workspace.tabs.notes")}{" "}
                            <span className="font-normal">({availableNotes.length})</span>
                          </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="sources" className="space-y-3 mt-3">
                        {availableSourceDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {formatIncludedLabel(availableSourceDocuments.length)}
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
                              {formatExcludedLabel(excludedSourceDocuments.length)}
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
                          <p className="text-xs text-muted-foreground">{t("workspace.chat.interface.context.noSources")}</p>
                        )}
                      </TabsContent>

                      <TabsContent value="inherited" className="space-y-3 mt-3">
                        {availableInheritedDocuments.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {formatIncludedLabel(availableInheritedDocuments.length)}
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
                              {formatExcludedLabel(excludedInheritedDocuments.length)}
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
                          <p className="text-xs text-muted-foreground">{t("workspace.chat.interface.context.noInherited")}</p>
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
                          emptyMessage={t("workspace.chat.interface.context.noEvidence")}
                        />
                      </TabsContent>

                      <TabsContent value="notes" className="space-y-3 mt-3">
                        {availableNotes.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              {formatIncludedLabel(availableNotes.length)}
                            </p>
                            <div className="space-y-2">
                              {availableNotes.map((note) => {
                                const authorName =
                                  note.author?.full_name ||
                                  note.author?.email ||
                                  t("workspace.sections.notes.status.memberFallback")
                                const trimmedContent = note.content.trim()
                                const preview =
                                  trimmedContent.length > 200
                                    ? `${trimmedContent.slice(0, 200).trimEnd()}...`
                                    : trimmedContent || t("workspace.sections.notes.previewEmpty")

                                return (
                                  <div
                                    key={note.id}
                                    className="rounded-md border border-border/60 bg-secondary/20 px-3 py-2 text-xs text-muted-foreground"
                                  >
                                    <div className="flex items-center justify-between gap-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                                      <span className="truncate">{authorName}</span>
                                      <IconTooltip label={t("workspace.sections.notes.contextRemove")}>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveNote(note.id)}
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                          aria-label={t("workspace.sections.notes.contextRemove")}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </IconTooltip>
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
                              {formatExcludedLabel(excludedNotes.length)}
                            </p>
                            <div className="space-y-2">
                              {excludedNotes.map((note) => {
                                const authorName =
                                  note.author?.full_name ||
                                  note.author?.email ||
                                  t("workspace.sections.notes.status.memberFallback")
                                const trimmedContent = note.content.trim()
                                const preview =
                                  trimmedContent.length > 200
                                    ? `${trimmedContent.slice(0, 200).trimEnd()}...`
                                    : trimmedContent || t("workspace.sections.notes.previewEmpty")

                                return (
                                  <div
                                    key={note.id}
                                    className="rounded-md border border-border/60 bg-secondary/10 px-3 py-2 text-xs text-muted-foreground opacity-70"
                                  >
                                    <div className="flex items-center justify-between gap-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                                      <span className="truncate line-through">{authorName}</span>
                                      <IconTooltip label={t("workspace.sections.notes.contextRestore")}>
                                        <button
                                          type="button"
                                          onClick={() => handleRestoreNote(note.id)}
                                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                          aria-label={t("workspace.sections.notes.contextRestore")}
                                        >
                                          <Plus className="h-3 w-3" />
                                        </button>
                                      </IconTooltip>
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
                          <p className="text-xs text-muted-foreground">{t("workspace.chat.interface.context.noNotes")}</p>
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
            <DialogTitle>{t("workspace.chat.interface.dialog.title")}</DialogTitle>
            <DialogDescription>{t("workspace.chat.interface.dialog.description")}</DialogDescription>
          </DialogHeader>
          {pendingEvidence && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t("workspace.chat.interface.dialog.questionLabel")}
                </p>
                <p className="mt-1 text-sm text-foreground/90 whitespace-pre-wrap">
                  {pendingEvidence.question.length > 600
                    ? `${pendingEvidence.question.slice(0, 600)}…`
                    : pendingEvidence.question}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t("workspace.chat.interface.dialog.confidenceLabel")}
                </p>
                <Select
                  value={evidenceConfidence}
                  onValueChange={(value) => setEvidenceConfidence(value as "low" | "medium" | "high")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t("workspace.chat.interface.dialog.confidencePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">{t("workspace.chat.interface.dialog.confidenceHigh")}</SelectItem>
                    <SelectItem value="medium">{t("workspace.chat.interface.dialog.confidenceMedium")}</SelectItem>
                    <SelectItem value="low">{t("workspace.chat.interface.dialog.confidenceLow")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t("workspace.chat.interface.dialog.citationsLabel")}
                </p>
                <p className="mt-1 text-sm text-foreground/80">
                  {Array.isArray(pendingEvidence.sources) && pendingEvidence.sources.length > 0
                    ? pendingEvidence.sources.length === 1
                      ? t("workspace.chat.interface.dialog.citationsLinkedOne", undefined, {
                          count: pendingEvidence.sources.length,
                        })
                      : t("workspace.chat.interface.dialog.citationsLinkedMany", undefined, {
                          count: pendingEvidence.sources.length,
                        })
                    : t("workspace.chat.interface.dialog.noCitations")}
                </p>
              </div>
              {evidenceError && <p className="text-sm text-destructive">{evidenceError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEvidenceDialog} disabled={isSavingEvidence}>
              {t("common.actions.cancel")}
            </Button>
            <Button onClick={handleSaveEvidence} disabled={isSavingEvidence}>
              {isSavingEvidence ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("workspace.chat.interface.dialog.saving")}
                </>
              ) : (
                t("workspace.chat.interface.dialog.save")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

