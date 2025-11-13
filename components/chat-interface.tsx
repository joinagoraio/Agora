"use client"

import { useChat } from "@ai-sdk/react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Send, Loader2, ExternalLink, FileText, X, Plus, Sparkles, CircleStop } from "lucide-react"
import ReactMarkdown from "react-markdown"
import Link from "next/link"
import { buildDocumentUrlFromSource } from "@/lib/utils/document-linking"
import { getWorkspaceDocuments } from "@/lib/actions/document"
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
  const [excludedDocumentIds, setExcludedDocumentIds] = useState<Set<string>>(new Set())
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const thinkingStartRef = useRef<number | null>(null)
  const [thinkingDurations, setThinkingDurations] = useState<Map<number, number>>(new Map())
  const [lastThinkingDuration, setLastThinkingDuration] = useState<number | null>(null)
  const [ellipsis, setEllipsis] = useState("...")
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [isSwitchingConversation, setIsSwitchingConversation] = useState(false)

  // Fetch workspace documents or single document
  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true)
    if (documentId) {
      // In document viewer mode: fetch only the current document
      const result = await getWorkspaceDocuments(workspaceId)
      if (result.data) {
        const currentDoc = result.data.find((doc: any) => doc.id === documentId)
        setDocuments(currentDoc ? [currentDoc] : [])
      }
    } else {
      // Normal mode: fetch all documents
      const result = await getWorkspaceDocuments(workspaceId)
      if (result.data) {
        setDocuments(result.data)
      }
    }
    setIsLoadingDocuments(false)
  }, [workspaceId, documentId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Refresh documents when window gains focus (handles case where user uploads in another tab)
  useEffect(() => {
    const handleFocus = () => {
      loadDocuments()
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [loadDocuments])

  // Listen for document upload events
  useEffect(() => {
    const handleDocumentUpload = (event: CustomEvent) => {
      // Only refresh if the upload is for this workspace
      if (event.detail?.workspaceId === workspaceId) {
        console.log("[ChatInterface] Document uploaded, refreshing document list")
        loadDocuments()
      }
    }
    window.addEventListener("documentUploaded" as any, handleDocumentUpload as EventListener)
    return () => window.removeEventListener("documentUploaded" as any, handleDocumentUpload as EventListener)
  }, [workspaceId, loadDocuments])

  useEffect(() => {
    setExcludedDocumentIds(new Set())
  }, [conversationId])

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, stop, setInput } = useChat({
    api: "/api/chat",
    body: {
      workspaceId,
      conversationId,
      excludedDocumentIds: Array.from(excludedDocumentIds),
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

  const availableDocuments = documents.filter((doc) => !excludedDocumentIds.has(doc.id))
  const excludedDocuments = documents.filter((doc) => excludedDocumentIds.has(doc.id))

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
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  {isAssistant &&
                    message.sources &&
                    message.sources.length > 0 &&
                    (() => {
                      // Hide sources if they're all from documents already shown in AI Context
                      const availableDocumentIds = new Set(availableDocuments.map((d: any) => d.id))

                      // Check if all sources are from available documents in AI Context
                      const allSourcesInContext = message.sources.every((source: any) => {
                        // Only check sources with document IDs (internal documents)
                        if (source.id && typeof source.id === "string") {
                          return availableDocumentIds.has(source.id)
                        }
                        // External sources (no document ID) should always be shown
                        return false
                      })

                      // Check if there are any external sources (sources without document IDs)
                      const hasExternalSources = message.sources.some((s: any) => !s.id || typeof s.id !== "string")

                      // Check if any sources have highlight information (textSpan or pageNumber)
                      // These should always be shown so users can jump to the specific section
                      const hasHighlightInfo = message.sources.some(
                        (s: any) => s.textSpan || (s.pageNumber !== undefined && s.pageNumber !== null),
                      )

                      // Hide sources if:
                      // 1. All sources are from documents in AI Context (redundant)
                      // 2. AND there are no external sources to show
                      // 3. AND there's no highlight information to navigate to
                      // Show sources if there are external sources, highlight info, or if not all sources are in context
                      const shouldShowSources = hasExternalSources || !allSourcesInContext || hasHighlightInfo

                      if (!shouldShowSources) {
                        return null
                      }

                      return (
                        <div className="pt-2 space-y-2 border-t border-border/60">
                          <p className="text-xs font-medium">Sources:</p>
                          <div className="flex flex-wrap gap-2">
                            {message.sources.map((source: any, idx: number) => {
                              // Check if source has document ID (for in-app viewing)
                              const hasDocumentId = source.id && typeof source.id === "string"
                              const hasPageInfo = source.pageNumber !== undefined

                              if (hasDocumentId) {
                                // Link to in-app document viewer
                                console.log("[ChatInterface] Building URL from source:", {
                                  sourceId: source.id,
                                  sourceTitle: source.title,
                                  pageNumber: source.pageNumber,
                                  textSpan: source.textSpan,
                                  hasPageNumber: source.pageNumber !== undefined,
                                  hasTextSpan: source.textSpan !== undefined,
                                  fullSource: JSON.stringify(source, null, 2),
                                })
                                const documentUrl = buildDocumentUrlFromSource(workspaceId, source)
                                console.log("[ChatInterface] Built URL:", documentUrl)
                                return (
                                  <Link key={idx} href={documentUrl}>
                                    <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">
                                      <FileText className="mr-1 h-3 w-3" />
                                      {source.title}
                                      {hasPageInfo && (
                                        <span className="ml-1 text-xs opacity-70">(Page {source.pageNumber})</span>
                                      )}
                                    </Badge>
                                  </Link>
                                )
                              } else {
                                // Fallback to external URL
                                return (
                                  <a
                                    key={idx}
                                    href={source.url || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1"
                                  >
                                    <Badge variant="secondary" className="text-xs">
                                      {source.title}
                                      {source.url && <ExternalLink className="ml-1 h-3 w-3" />}
                                    </Badge>
                                  </a>
                                )
                              }
                            })}
                          </div>
                        </div>
                      )
                    })()}
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
            className={cn("min-h-[60px] flex-1 resize-none", isLoading ? "pr-20" : "pr-10")}
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
              className="absolute bottom-2 right-9 h-6 w-6 p-0"
            >
              <CircleStop className="h-3 w-3" />
            </Button>
          )}
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="absolute bottom-2 right-2 h-6 w-6 p-0"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">Press Enter to send, Shift+Enter for new line</p>

        {/* Document pills in accordion */}
        {!isLoadingDocuments && documents.length > 0 && (
          <Accordion type="single" collapsible defaultValue="documents" className="mt-4">
            <AccordionItem value="documents" className="border-none">
              <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline data-[state=closed]:inline-flex data-[state=closed]:items-center data-[state=closed]:rounded-full data-[state=closed]:bg-secondary data-[state=closed]:px-3 data-[state=closed]:py-1 data-[state=closed]:w-fit [&[data-state=closed]_svg]:translate-y-0">
                <span>AI Context</span>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <TooltipProvider>
                  <div className="space-y-3">
                    {availableDocuments.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Included in this conversation ({availableDocuments.length}):
                          </p>
                          {!documentId && <Sparkles className="h-4 w-4 text-purple-400" />}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {availableDocuments.map((doc) => (
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
                    {!documentId && excludedDocuments.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Excluded from this conversation ({excludedDocuments.length}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {excludedDocuments.map((doc) => (
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
                    <p className="text-xs text-muted-foreground pt-2">
                      {documentId
                        ? "The chat is context-aware to the document you're currently viewing."
                        : "Select which documents to include in AI responses for this conversation. Excluding documents does not delete them."}
                    </p>
                  </div>
                </TooltipProvider>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  )
}
