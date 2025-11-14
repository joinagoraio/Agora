"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  createConversation,
  getUserConversations,
  getConversationMessages,
  deleteConversation,
  archiveConversation,
  ConversationContextType,
  updateConversationTitle,
} from "@/lib/actions/conversation"
import { ChatInterface } from "@/components/chat-interface"
import { useChatContext } from "@/components/workspace-chat-wrapper"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { X, Plus, MoreVertical, Archive, Trash2, List, GripVertical, Pencil, Loader2 } from "lucide-react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ChatSidebarProps {
  workspaceId: string
  workspaceName: string
  isOpen: boolean
  onClose: () => void
}

export function ChatSidebar({ workspaceId, workspaceName, isOpen, onClose }: ChatSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sidebarWidth, setSidebarWidth, setIsSidebarResizing, setIsChatOpen } = useChatContext()

  const chatContext = useMemo(() => {
    if (!pathname) {
      return { type: "workspace" as ConversationContextType, contextId: null, documentId: undefined }
    }

    const documentViewMatch = pathname.match(/\/workspaces\/[^/]+\/documents\/([^/]+)/)
    if (documentViewMatch) {
      const docId = documentViewMatch[1]
      return { type: "document_view" as ConversationContextType, contextId: docId, documentId: docId }
    }

    const documentEditMatch = pathname.match(/\/workspaces\/[^/]+\/my-documents\/([^/]+)/)
    if (documentEditMatch) {
      const docId = documentEditMatch[1]
      return { type: "document_edit" as ConversationContextType, contextId: docId, documentId: docId }
    }

    return { type: "workspace" as ConversationContextType, contextId: null, documentId: undefined }
  }, [pathname])

  const { type: contextType, contextId } = chatContext
  const activeDocumentId = chatContext.documentId
  const contextKey = useMemo(() => `${contextType}:${contextId ?? ""}`, [contextType, contextId])
  const previousContextKeyRef = useRef(contextKey)

  const [conversations, setConversations] = useState<any[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const [isListExpanded, setIsListExpanded] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [conversationToRename, setConversationToRename] = useState<any | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const isCreatingConversationRef = useRef(false)
  const isUpdatingUrlRef = useRef(false)

  // Helper function to update URL with conversationId while preserving current path
  const updateConversationId = useCallback(
    (conversationId: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      const existingConversationId = params.get("conversationId")

      if (conversationId) {
        if (existingConversationId === conversationId) {
          return
        }
        params.set("conversationId", conversationId)
      } else {
        if (!existingConversationId) {
          return
        }
        params.delete("conversationId")
      }

      const queryString = params.toString()
      const targetUrl = queryString ? `${pathname}?${queryString}` : pathname
      isUpdatingUrlRef.current = true
      router.push(targetUrl)
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingUrlRef.current = false
      }, 100)
    },
    [router, pathname, searchParams],
  )

  const loadMessages = useCallback(async (conversationId: string) => {
    setIsLoading(true)
    console.log("[ChatSidebar] Loading messages for conversation:", conversationId)
    const result = await getConversationMessages(conversationId)
    if (result.data) {
      console.log("[ChatSidebar] Loaded messages:", result.data.length)
      setMessages(result.data)
      // Expand list if there are messages
      if (result.data.length > 0) {
        setIsListExpanded(true)
      }
    } else {
      console.log("[ChatSidebar] No messages found")
      setMessages([])
    }
    setIsLoading(false)
  }, [])

  const loadConversations = useCallback(async () => {
    const result = await getUserConversations(workspaceId, {
      contextType,
      contextId,
    })
    if (result.data) {
      setConversations(result.data)
      return result.data
    }
    setConversations([])
    return []
  }, [workspaceId, contextType, contextId])

  const conversationIdParam = useMemo(() => searchParams.get("conversationId"), [searchParams])
  const lastCreatedConversationRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // Skip if we're in the middle of updating the URL ourselves
    if (isUpdatingUrlRef.current) {
      console.log("[ChatSidebar] URL update in progress, skipping")
      return
    }

    const contextChanged = previousContextKeyRef.current !== contextKey
    previousContextKeyRef.current = contextKey

    if (!contextChanged && conversationIdParam === currentConversationId && hasLoadedInitial) {
      return
    }

    // Prevent duplicate conversation creation
    if (isCreatingConversationRef.current) {
      console.log("[ChatSidebar] Already creating conversation, skipping")
      return
    }

    const initialize = async () => {
      if (contextChanged) {
        setHasLoadedInitial(false)
        setCurrentConversationId(null)
        setMessages([])
        lastCreatedConversationRef.current = null
      }

      const data = await loadConversations()

      // If we have a conversationIdParam, check if it exists in the list
      // This handles the case where a conversation was just created
      if (conversationIdParam && data.some(conv => conv.id === conversationIdParam)) {
        console.log("[ChatSidebar] Conversation from URL exists, using it:", conversationIdParam)
        setCurrentConversationId(conversationIdParam)
        await loadMessages(conversationIdParam)
        setHasLoadedInitial(true)
        return
      }

      // Check if we just created this conversation (prevent duplicate creation)
      if (lastCreatedConversationRef.current && data.some(conv => conv.id === lastCreatedConversationRef.current)) {
        console.log("[ChatSidebar] Using recently created conversation:", lastCreatedConversationRef.current)
        const createdConv = data.find(conv => conv.id === lastCreatedConversationRef.current)
        if (createdConv) {
          setCurrentConversationId(createdConv.id)
          updateConversationId(createdConv.id)
          await loadMessages(createdConv.id)
          setHasLoadedInitial(true)
          return
        }
      }

      if (data.length === 0) {
        // No conversations exist - show empty state
        setCurrentConversationId(null)
        setMessages([])
        updateConversationId(null)
        setHasLoadedInitial(true)
        return
      }

      let targetConversationId = conversationIdParam
      const hasTargetConversation = targetConversationId
        ? data.some((conversation) => conversation.id === targetConversationId)
        : false

      console.log("[ChatSidebar] Conversation selection logic:", {
        conversationIdParam,
        hasTargetConversation,
        contextChanged,
        currentConversationId,
        hasLoadedInitial,
        availableConversations: data.length,
      })

      if (!targetConversationId || contextChanged || !hasTargetConversation) {
        // No conversationId in URL, context changed, or conversation not found - show empty state
        console.log("[ChatSidebar] No conversation selected, showing empty state")
        setCurrentConversationId(null)
        setMessages([])
        updateConversationId(null)
        setHasLoadedInitial(true)
        return
      } else {
        // conversationIdParam exists and is valid - ensure it's in the URL
        if (targetConversationId !== conversationIdParam) {
          updateConversationId(targetConversationId)
        }
      }

      if (targetConversationId && (contextChanged || targetConversationId !== currentConversationId || !hasLoadedInitial)) {
        console.log("[ChatSidebar] Loading messages for conversation:", targetConversationId)
        setCurrentConversationId(targetConversationId)
        await loadMessages(targetConversationId)
      } else {
        console.log("[ChatSidebar] Skipping message load:", {
          hasTargetConversationId: !!targetConversationId,
          contextChanged,
          conversationChanged: targetConversationId !== currentConversationId,
          hasLoadedInitial,
        })
      }

      setHasLoadedInitial(true)
    }

    void initialize()
  }, [
    isOpen,
    contextKey,
    conversationIdParam,
    loadConversations,
    loadMessages,
    updateConversationId,
    currentConversationId,
    hasLoadedInitial,
    workspaceId,
    contextType,
    contextId,
  ])

  useEffect(() => {
    if (!isOpen) {
      setHasLoadedInitial(false)
    }
  }, [isOpen])

  // Expand list when there are conversations available
  useEffect(() => {
    if (conversations.length > 0) {
      console.log("[ChatSidebar] Expanding list, conversations count:", conversations.length)
      setIsListExpanded(true)
    }
  }, [conversations.length])

  const handleNewChat = async () => {
    const result = await createConversation(workspaceId, {
      contextType,
      contextId,
    })
    if (result.data) {
      // Reset state for new conversation
      setHasLoadedInitial(false)
      setMessages([])
      setCurrentConversationId(result.data.id)
      updateConversationId(result.data.id)
      await loadConversations()
      // Load messages (will be empty for new conversation)
      await loadMessages(result.data.id)
      setHasLoadedInitial(true)
      // Expand list when conversation is created
      setIsListExpanded(true)
      // Ensure chat sidebar is open
      setIsChatOpen(true)
    }
  }

  const handleConversationSelect = async (conversationId: string) => {
    console.log("[ChatSidebar] Conversation selected:", conversationId)
    // Load messages first, then update conversation ID to avoid showing placeholder
    setIsLoading(true)
    const result = await getConversationMessages(conversationId)
    if (result.data) {
      console.log("[ChatSidebar] Loaded messages:", result.data.length)
      // Update conversation ID and messages together to prevent placeholder flash
      setCurrentConversationId(conversationId)
      updateConversationId(conversationId)
      setMessages(result.data)
      // Expand list if there are messages
      if (result.data.length > 0) {
        setIsListExpanded(true)
      }
    } else {
      console.log("[ChatSidebar] No messages found")
      // Still update conversation ID even if no messages
      setCurrentConversationId(conversationId)
      updateConversationId(conversationId)
      setMessages([])
    }
    setIsLoading(false)
    // Expand list when conversation is selected
    setIsListExpanded(true)
  }

  const handleDelete = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConversationToDelete(conversationId)
    setNeedsConfirmation(false)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!needsConfirmation) {
      setNeedsConfirmation(true)
      return
    }
    
    if (!conversationToDelete) return
    
    const wasActiveConversation = conversationToDelete === currentConversationId
    
    const result = await deleteConversation(conversationToDelete)
    if (result.success) {
      // Reload conversations to get updated list
      const updated = await loadConversations()
        
      if (wasActiveConversation) {
        if (updated.length > 0) {
          const mostRecent = updated[0]
          setCurrentConversationId(mostRecent.id)
          updateConversationId(mostRecent.id)
          await loadMessages(mostRecent.id)
        } else {
          setCurrentConversationId(null)
          setMessages([])
          updateConversationId(null)
        }
      }
    }
    setDeleteDialogOpen(false)
    setConversationToDelete(null)
    setNeedsConfirmation(false)
  }
  const openRenameDialog = (conversation: any) => {
    setConversationToRename(conversation)
    setRenameValue(conversation?.title ?? "")
    setRenameError(null)
    setRenameDialogOpen(true)
  }

  const closeRenameDialog = () => {
    if (isRenaming) {
      return
    }
    setRenameDialogOpen(false)
    setConversationToRename(null)
    setRenameValue("")
    setRenameError(null)
    // Force cleanup after a brief delay to ensure portal unmounts
    setTimeout(() => {
      document.body.style.pointerEvents = ""
      document.body.style.overflow = ""
      // Remove any lingering overlay elements
      const overlays = document.querySelectorAll('[data-slot="dialog-overlay"], [data-radix-portal]')
      overlays.forEach(overlay => {
        if (overlay instanceof HTMLElement) {
          overlay.style.pointerEvents = "none"
        }
      })
    }, 0)
  }

  const handleRenameSubmit = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault()
    }
    if (!conversationToRename) {
      return
    }

    const cleanedTitle = renameValue.replace(/\s+/g, " ").trim()
    if (!cleanedTitle) {
      setRenameError("Title cannot be empty")
      return
    }

    setIsRenaming(true)
    setRenameError(null)

    const result = await updateConversationTitle(conversationToRename.id, cleanedTitle)

    if (result.error) {
      setRenameError(result.error)
      setIsRenaming(false)
      return
    }

    await loadConversations()

    if (conversationToRename.id === currentConversationId) {
      setCurrentConversationId(conversationToRename.id)
    }

    setIsRenaming(false)
    setRenameDialogOpen(false)
    setConversationToRename(null)
    setRenameValue("")
  }


  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      setDeleteDialogOpen(false)
      setConversationToDelete(null)
      setNeedsConfirmation(false)
      // Force cleanup after a brief delay to ensure portal unmounts
      setTimeout(() => {
        document.body.style.pointerEvents = ""
        document.body.style.overflow = ""
        // Remove any lingering overlay elements
        const overlays = document.querySelectorAll('[data-slot="dialog-overlay"], [data-radix-portal]')
        overlays.forEach(overlay => {
          if (overlay instanceof HTMLElement) {
            overlay.style.pointerEvents = "none"
          }
        })
      }, 0)
    }
  }

  const handleArchive = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const wasActiveConversation = conversationId === currentConversationId
    
    const result = await archiveConversation(conversationId)
    if (result.success) {
      // Reload conversations to get updated list
      const updated = await loadConversations()

      if (wasActiveConversation) {
        if (updated.length > 0) {
          const mostRecent = updated[0]
          setCurrentConversationId(mostRecent.id)
          updateConversationId(mostRecent.id)
          await loadMessages(mostRecent.id)
        } else {
          setCurrentConversationId(null)
          setMessages([])
          updateConversationId(null)
        }
      }
    }
  }

  const formattedMessages =
    messages?.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      sources: msg.sources,
      thinking_duration: msg.thinking_duration,
    })) || []

  // Get list width (fixed width)
  const getListWidth = () => {
    if (typeof window === "undefined") return 256
    if (window.innerWidth >= 768) return 256 // md:w-64
    if (window.innerWidth >= 640) return 224 // sm:w-56
    return 192 // w-48
  }

  // Get minimum chat width
  const getMinChatWidth = () => {
    if (typeof window === "undefined") return 300
    if (window.innerWidth >= 1280) return 300 // xl
    if (window.innerWidth >= 1024) return 280 // lg
    if (window.innerWidth >= 768) return 250 // md
    if (window.innerWidth >= 640) return 220 // sm
    return 200 // mobile
  }

  // Get responsive default width
  // Narrow width when no conversations (empty state)
  // Chat width + List width when conversations exist (list is expanded)
  const getDefaultWidth = () => {
    if (typeof window === "undefined") return 800
    
    // If no conversations, use narrow width (just chat area)
    const hasConversations = conversations.length > 0 && isListExpanded
    
    if (!hasConversations) {
      // Narrow width for just the chat interface (empty state)
      if (window.innerWidth >= 1280) return 500 // xl
      if (window.innerWidth >= 1024) return 450 // lg
      if (window.innerWidth >= 768) return 400 // md
      if (window.innerWidth >= 640) return 350 // sm
      return window.innerWidth // mobile: full width
    }
    
    // Chat width + List width when conversations exist (list is expanded)
    // List widths: w-48 (192px), sm:w-56 (224px), md:w-64 (256px)
    let chatWidth: number
    let listWidth: number
    
    if (window.innerWidth >= 1280) {
      chatWidth = 500 // xl chat
      listWidth = 256 // md:w-64
    } else if (window.innerWidth >= 1024) {
      chatWidth = 450 // lg chat
      listWidth = 256 // md:w-64
    } else if (window.innerWidth >= 768) {
      chatWidth = 400 // md chat
      listWidth = 256 // md:w-64
    } else if (window.innerWidth >= 640) {
      chatWidth = 350 // sm chat
      listWidth = 224 // sm:w-56
    } else {
      return window.innerWidth // mobile: full width
    }
    
    return chatWidth + listWidth
  }

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      // Constrain width between minimum chat width and 90% of viewport
      const minWidth = getMinChatWidth()
      const maxWidth = window.innerWidth * 0.9
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
      hasManuallyResizedRef.current = true
      setSidebarWidth(constrainedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing, setSidebarWidth])

  useEffect(() => {
    setIsSidebarResizing(isResizing)
  }, [isResizing, setIsSidebarResizing])

  // Mark component as mounted to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Track if user has manually resized
  const hasManuallyResizedRef = useRef(false)
  
  // Update sidebar width when conversations or list expansion changes
  // Only update if user hasn't manually resized
  useEffect(() => {
    if (!isMounted || !isOpen) return
    
    // Only auto-update width if user hasn't manually resized
    if (hasManuallyResizedRef.current && sidebarWidth !== null) {
      return
    }
    
    const hasConversations = conversations.length > 0 && isListExpanded
    
    let newWidth: number
    if (!hasConversations) {
      // Narrow width for just the chat interface (empty state)
      if (window.innerWidth >= 1280) newWidth = 500
      else if (window.innerWidth >= 1024) newWidth = 450
      else if (window.innerWidth >= 768) newWidth = 400
      else if (window.innerWidth >= 640) newWidth = 350
      else newWidth = window.innerWidth
    } else {
      // Chat width + List width when conversations exist (list is expanded)
      // List widths: w-48 (192px), sm:w-56 (224px), md:w-64 (256px)
      let chatWidth: number
      let listWidth: number
      
      if (window.innerWidth >= 1280) {
        chatWidth = 500 // xl chat
        listWidth = 256 // md:w-64
      } else if (window.innerWidth >= 1024) {
        chatWidth = 450 // lg chat
        listWidth = 256 // md:w-64
      } else if (window.innerWidth >= 768) {
        chatWidth = 400 // md chat
        listWidth = 256 // md:w-64
      } else if (window.innerWidth >= 640) {
        chatWidth = 350 // sm chat
        listWidth = 224 // sm:w-56
      } else {
        newWidth = window.innerWidth
        setSidebarWidth(newWidth)
        return
      }
      
      newWidth = chatWidth + listWidth
    }
    
    console.log("[ChatSidebar] Updating sidebar width:", { newWidth, hasConversations, isListExpanded, conversationsCount: conversations.length })
    setSidebarWidth(newWidth)
  }, [conversations.length, isListExpanded, sidebarWidth, setSidebarWidth, isOpen, isMounted])

  const currentWidth = isMounted ? (sidebarWidth ?? getDefaultWidth()) : 800
  const isMobile = isMounted && typeof window !== "undefined" && window.innerWidth < 640
  
  // Calculate if list should be visible
  // List should be hidden if sidebar width is less than min chat width + list width
  const listWidth = isMounted ? getListWidth() : 256
  const minChatWidth = isMounted ? getMinChatWidth() : 300
  const shouldShowList = isListExpanded && currentWidth >= (minChatWidth + listWidth)

  return (
    <>
      <div
        className={`fixed inset-y-0 right-0 z-50 flex h-screen flex-col ${isMobile ? "border-l" : ""} bg-card shadow-lg ${
          isResizing ? "" : "transition-transform duration-300 ease-out"
        } ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } ${isMobile ? "w-full" : ""}`}
        style={!isMobile && isMounted ? { width: `${currentWidth}px` } : undefined}
        suppressHydrationWarning
      >
        {/* Resize handle as left border */}
        {isOpen && !isMobile && (
          <div
            className="absolute inset-y-0 left-0 w-px cursor-col-resize bg-transparent hover:bg-gray-300/50 dark:hover:bg-gray-600/40 transition-colors group z-10"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizing(true)
            }}
          >
            <div className="absolute inset-y-0 left-0 w-px bg-gray-300/30 dark:bg-gray-600/25 group-hover:bg-gray-300/50 dark:group-hover:bg-gray-600/40 transition-colors" />
            <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2">
              <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            </div>
          </div>
        )}
      {/* Header with close button */}
      <div className="border-b bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div>
            <h2 className="text-sm">
              <span className="font-semibold">{workspaceName}</span> <span className="text-muted-foreground">·</span> AI Assistant
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleNewChat} title="New Chat">
              <Plus className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                console.log("[ChatSidebar] Toggle list button clicked, current state:", isListExpanded)
                setIsListExpanded(prev => {
                  const newState = !prev
                  console.log("[ChatSidebar] Setting list expanded to:", newState)
                  return newState
                })
              }} 
              title={isListExpanded ? "Collapse list" : "Expand list"}
            >
              <List className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main chat area - flexible width */}
        <main className="flex flex-col flex-1 min-w-0">
          {currentConversationId ? (
            <ChatInterface
              workspaceId={workspaceId}
              conversationId={currentConversationId}
              initialMessages={formattedMessages}
              documentId={activeDocumentId}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Card className="border-0 shadow-none">
                <CardContent className="p-8">
                  <h3 className="mb-2 text-lg font-semibold">No conversation selected</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Start a new conversation to begin chatting</p>
                  <Button onClick={handleNewChat} className="w-full">
                    New Chat
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </main>

        {/* Sidebar with conversation history - fixed width when visible */}
        <aside 
          className={`border-l bg-card transition-all duration-300 ${
            shouldShowList ? "w-48 sm:w-56 md:w-64 flex-shrink-0" : "w-0 overflow-hidden"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className={cn("flex-1", conversations.length > 0 ? "overflow-y-auto" : "overflow-hidden")}>
              <TooltipProvider>
                <div className="space-y-0">
                  {conversations && conversations.length > 0 ? (
                    conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className="group relative flex items-center justify-between px-4 py-1 m-1 cursor-pointer transition-colors rounded-md hover:bg-accent"
                        onClick={() => handleConversationSelect(conv.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="truncate text-xs font-medium">{conv.title}</p>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{conv.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              openRenameDialog(conv)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleArchive(conv.id, e)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleDelete(conv.id, e)}
                            className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">No conversations yet</p>
                )}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </aside>
      </div>

      {deleteDialogOpen && (
        <AlertDialog open={true} onOpenChange={handleDeleteDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the conversation and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsConfirmation && (
            <p className="text-sm text-destructive font-medium">
              This action cannot be undone.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNeedsConfirmation(false)}>Cancel</AlertDialogCancel>
            {needsConfirmation ? (
              <AlertDialogAction 
                onClick={confirmDelete} 
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Confirm?
              </AlertDialogAction>
            ) : (
              <Button 
                onClick={() => setNeedsConfirmation(true)} 
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
      {renameDialogOpen && (
        <Dialog open={true} onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog()
          }
        }}>
        <DialogContent>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogDescription>Give this conversation a clearer title.</DialogDescription>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => {
                setRenameValue(event.target.value)
                if (renameError) {
                  setRenameError(null)
                }
              }}
              placeholder="Conversation title"
              autoFocus
              disabled={isRenaming}
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRenameDialog} disabled={isRenaming}>
                Cancel
              </Button>
              <Button type="submit" disabled={isRenaming || renameValue.trim().length === 0}>
                {isRenaming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}
      </div>
    </>
  )
}
