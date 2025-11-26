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
import { toast } from "sonner"
import { useI18n } from "@/lib/i18n/use-i18n"

interface ChatSidebarProps {
  workspaceId: string
  workspaceName: string
  isOpen: boolean
  onClose: () => void
  canManage?: boolean
}

const DEFAULT_CONVERSATION_TITLE_KEY = "new conversation"

export function ChatSidebar({ workspaceId, workspaceName, isOpen, onClose, canManage = true }: ChatSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sidebarWidth, setSidebarWidth, setIsSidebarResizing, setIsChatOpen } = useChatContext()
  const { t } = useI18n()
  const getConversationTitle = useCallback(
    (title?: string | null) => {
      const trimmed = title?.trim()
      if (!trimmed || trimmed.length === 0) {
        return t("workspace.chat.interface.defaultTitle")
      }
      if (trimmed.toLowerCase() === DEFAULT_CONVERSATION_TITLE_KEY) {
        return t("workspace.chat.interface.defaultTitle")
      }
      return trimmed
    },
    [t],
  )

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

  const { type: contextType, contextId, documentId: activeDocumentId } = chatContext
  const isDocumentView = Boolean(activeDocumentId)
  const contextKey = useMemo(() => `${contextType}:${contextId ?? ""}`, [contextType, contextId])
  const previousContextKeyRef = useRef(contextKey)

  const storageKey = useMemo(() => `workspace:${workspaceId}:activeConversation`, [workspaceId])
  const initialConversationId = searchParams.get("conversationId")
  const [conversationIdParam, setConversationIdParam] = useState<string | null>(() => {
    if (initialConversationId) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(storageKey, initialConversationId)
      }
      return initialConversationId
    }
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem(storageKey)
    }
    return null
  })
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
  const wasDocumentViewRef = useRef(isDocumentView)

  useEffect(() => {
    const fromUrl = searchParams.get("conversationId")
    if (fromUrl) {
      if (fromUrl !== conversationIdParam) {
        setConversationIdParam(fromUrl)
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(storageKey, fromUrl)
      }
    } else if (!isDocumentView && conversationIdParam !== null) {
      setConversationIdParam(null)
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(storageKey)
      }
    } else if (isDocumentView && !fromUrl && conversationIdParam === null && typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem(storageKey)
      if (stored) {
        setConversationIdParam(stored)
      }
    }
  }, [searchParams, storageKey, isDocumentView, conversationIdParam])

  // Helper function to update URL with conversationId while preserving current path
  const updateConversationId = useCallback(
    (conversationId: string | null, options?: { forceUrlSync?: boolean }) => {
      setConversationIdParam(conversationId)
      if (typeof window !== "undefined") {
        if (conversationId) {
          window.sessionStorage.setItem(storageKey, conversationId)
        } else {
          window.sessionStorage.removeItem(storageKey)
        }
      }

      const shouldSyncUrl = !isDocumentView || options?.forceUrlSync
      if (!shouldSyncUrl) {
        return
      }

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
      // Use replace instead of push to avoid full page refresh
      router.replace(targetUrl)
      // Reset flag after a short delay
      setTimeout(() => {
        isUpdatingUrlRef.current = false
      }, 100)
    },
    [router, pathname, searchParams, isDocumentView, storageKey],
  )

  useEffect(() => {
    if (wasDocumentViewRef.current && !isDocumentView && currentConversationId) {
      updateConversationId(currentConversationId, { forceUrlSync: true })
    }
    wasDocumentViewRef.current = isDocumentView
  }, [isDocumentView, currentConversationId, updateConversationId])

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
        // BUT: Don't clear conversationId from URL if we have messages (user might be in middle of conversation)
        console.log("[ChatSidebar] No conversation selected, showing empty state")
        setCurrentConversationId(null)
        setMessages([])
        // Only clear conversationId if context changed (switched to different context) or no conversations exist
        // Don't clear if conversation just not found - might be a timing issue
        if (contextChanged || data.length === 0) {
        updateConversationId(null)
        }
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
    if (isCreatingConversationRef.current) {
      return
    }
    isCreatingConversationRef.current = true
    try {
      const result = await createConversation(workspaceId, {
        contextType,
        contextId,
      })
      if (result.error || !result.data) {
        toast.error(t("workspace.chat.toast.createError"), {
          description: result.error || t("workspace.chat.toast.genericError"),
        })
        return
      }

      toast.success(t("workspace.chat.toast.createSuccess"), {
        description: t("workspace.chat.toast.createSuccessDescription"),
      })

      const newConversationId = result.data.id
      lastCreatedConversationRef.current = newConversationId

      // Reset state for new conversation
      setHasLoadedInitial(false)
      setMessages([])
      setCurrentConversationId(newConversationId)
      updateConversationId(newConversationId)

      await loadConversations()
      // Load messages (will be empty for new conversation)
      await loadMessages(newConversationId)
      setHasLoadedInitial(true)
      // Expand list when conversation is created
      setIsListExpanded(true)
      // Ensure chat sidebar is open
      setIsChatOpen(true)
    } finally {
      isCreatingConversationRef.current = false
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
    
    // Mark as deleting to prevent width updates during deletion
    isDeletingRef.current = true
    
    // Reset chat state first to prevent shaking
    if (wasActiveConversation) {
      setCurrentConversationId(null)
      setMessages([])
      setHasLoadedInitial(false)
    }
    
    const result = await deleteConversation(conversationToDelete)
    if (result?.error) {
      toast.error(t("workspace.chat.toast.deleteError"), {
        description: result.error || t("workspace.chat.toast.genericError"),
      })
    } else if (result?.success) {
      toast.success(t("workspace.chat.toast.deleteSuccess"))
    }
    if (result?.success) {
      // Reload conversations to get updated list
      const updated = await loadConversations()
        
      if (wasActiveConversation) {
        if (updated.length > 0) {
          const mostRecent = updated[0]
          // Small delay to ensure state is reset before loading new conversation
          await new Promise(resolve => setTimeout(resolve, 50))
          setCurrentConversationId(mostRecent.id)
          updateConversationId(mostRecent.id)
          await loadMessages(mostRecent.id)
          setHasLoadedInitial(true)
        } else {
          // No conversations left - ensure state is fully reset
          setCurrentConversationId(null)
          setMessages([])
          updateConversationId(null)
          setHasLoadedInitial(true)
        }
      }
    }
    
    // Reset deletion flag after a short delay to allow state to settle
    setTimeout(() => {
      isDeletingRef.current = false
    }, 200)
    
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
      setRenameError(t("workspace.chat.rename.validation"))
      return
    }

    setIsRenaming(true)
    setRenameError(null)

    const result = await updateConversationTitle(conversationToRename.id, cleanedTitle)

    if (result.error) {
      setRenameError(result.error)
      toast.error(t("workspace.chat.toast.renameError"), {
        description: result.error || t("workspace.chat.toast.genericError"),
      })
      setIsRenaming(false)
      return
    }

    await loadConversations()

    if (conversationToRename.id === currentConversationId) {
      setCurrentConversationId(conversationToRename.id)
    }

    setIsRenaming(false)
    toast.success(t("workspace.chat.toast.renameSuccess"))
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
    if (result?.error) {
      toast.error(t("workspace.chat.toast.archiveError"), {
        description: result.error || t("workspace.chat.toast.genericError"),
      })
      return
    }

    toast.success(t("workspace.chat.toast.archiveSuccess"))
    if (result?.success) {
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
      // Constrain width between minimum width and 90% of viewport
      // When list is expanded, minimum width includes both chat and list widths
      const listWidth = getListWidth()
      const minChatWidth = getMinChatWidth()
      const minWidth = isListExpanded ? minChatWidth + listWidth : minChatWidth
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
  }, [isResizing, setSidebarWidth, isListExpanded])

  useEffect(() => {
    setIsSidebarResizing(isResizing)
  }, [isResizing, setIsSidebarResizing])

  // Mark component as mounted to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Track if user has manually resized
  const hasManuallyResizedRef = useRef(false)
  // Track if we're currently deleting to prevent width updates during deletion
  const isDeletingRef = useRef(false)
  
  // Update sidebar width when conversations or list expansion changes
  // Only update if user hasn't manually resized
  useEffect(() => {
    if (!isMounted || !isOpen) return
    
    // Skip width updates during deletion to prevent shaking
    if (isDeletingRef.current) {
      return
    }
    
    const listWidth = getListWidth()
    const minChatWidth = getMinChatWidth()
    const minSidebarWidth = isListExpanded ? minChatWidth + listWidth : minChatWidth
    
    // Always enforce minimum width (hard constraint)
    // When list is expanded: minChatWidth + listWidth
    // When list is collapsed: minChatWidth
    if (sidebarWidth !== null && sidebarWidth < minSidebarWidth) {
      console.log("[ChatSidebar] Enforcing minimum width:", { current: sidebarWidth, minimum: minSidebarWidth, isListExpanded })
      setSidebarWidth(minSidebarWidth)
      return
    }
    
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
      // Ensure we use at least minimum chat width + list width
      // List widths: w-48 (192px), sm:w-56 (224px), md:w-64 (256px)
      let chatWidth: number
      
      if (window.innerWidth >= 1280) {
        chatWidth = Math.max(500, minChatWidth) // xl chat, but at least minChatWidth
      } else if (window.innerWidth >= 1024) {
        chatWidth = Math.max(450, minChatWidth) // lg chat, but at least minChatWidth
      } else if (window.innerWidth >= 768) {
        chatWidth = Math.max(400, minChatWidth) // md chat, but at least minChatWidth
      } else if (window.innerWidth >= 640) {
        chatWidth = Math.max(350, minChatWidth) // sm chat, but at least minChatWidth
      } else {
        newWidth = window.innerWidth
        setSidebarWidth(newWidth)
        return
      }
      
      newWidth = chatWidth + listWidth
      // Ensure we never go below the minimum
      newWidth = Math.max(newWidth, minSidebarWidth)
    }
    
    // Only update if width actually changed to prevent unnecessary re-renders
    if (sidebarWidth !== null && Math.abs(sidebarWidth - newWidth) < 1) {
      return
    }
    
    console.log("[ChatSidebar] Updating sidebar width:", { newWidth, hasConversations, isListExpanded, conversationsCount: conversations.length, minSidebarWidth })
    setSidebarWidth(newWidth)
  }, [conversations.length, isListExpanded, sidebarWidth, setSidebarWidth, isOpen, isMounted])

  const currentWidth = isMounted ? (sidebarWidth ?? getDefaultWidth()) : 800
  const isMobile = isMounted && typeof window !== "undefined" && window.innerWidth < 640
  
  // Calculate if list should be visible
  // List should always be visible when expanded (no width check)
  const listWidth = isMounted ? getListWidth() : 256
  const minChatWidth = isMounted ? getMinChatWidth() : 300
  const shouldShowList = isListExpanded

  return (
    <>
      <div
        className={`fixed inset-y-0 right-0 z-50 flex h-screen flex-col ${isMobile ? "border-l" : ""} bg-card shadow-lg ${
          isResizing ? "" : "transition-[width,transform] duration-300 ease-out"
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
              <span className="font-semibold">{workspaceName}</span> <span className="text-muted-foreground">·</span>{" "}
              {t("workspace.chat.header")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleNewChat} title={t("workspace.chat.actions.newChat")}>
              <Plus className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                console.log("[ChatSidebar] Toggle list button clicked, current state:", isListExpanded)
                const listWidth = getListWidth()
                const currentWidth = sidebarWidth ?? getDefaultWidth()
                const newState = !isListExpanded
                
                console.log("[ChatSidebar] Setting list expanded to:", newState)
                
                // Calculate new width based on expansion state
                let newWidth: number
                if (newState) {
                  // Expanding: add list width to current width (preserve chat width)
                  const minChatWidth = getMinChatWidth()
                  const minSidebarWidth = minChatWidth + listWidth
                  newWidth = Math.max(currentWidth + listWidth, minSidebarWidth)
                } else {
                  // Collapsing: subtract list width, but ensure we don't go below min chat width
                  newWidth = Math.max(currentWidth - listWidth, getMinChatWidth())
                }
                
                // Update states separately to avoid updating parent during render
                setIsListExpanded(newState)
                setSidebarWidth(newWidth)
                
                // Mark as manually adjusted so auto-update doesn't override
                hasManuallyResizedRef.current = true
              }} 
              title={
                isListExpanded ? t("workspace.chat.actions.collapseList") : t("workspace.chat.actions.expandList")
              }
            >
              <List className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main chat area - flexible width with minimum width */}
        <main 
          className="flex flex-col flex-1 min-w-0"
          style={isMounted ? { minWidth: `${getMinChatWidth()}px` } : undefined}
        >
          {currentConversationId ? (
            <ChatInterface
              workspaceId={workspaceId}
              conversationId={currentConversationId}
              initialMessages={formattedMessages}
              documentId={activeDocumentId}
              canManage={canManage}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Card className="border-0 shadow-none">
                <CardContent className="p-8">
                  <h3 className="mb-2 text-lg font-semibold">{t("workspace.chat.empty.title")}</h3>
                  <p className="mb-4 text-sm text-muted-foreground">{t("workspace.chat.empty.description")}</p>
                  <Button onClick={handleNewChat} className="w-full">
                    {t("workspace.chat.actions.newChat")}
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
                    conversations.map((conv) => {
                      const isActive = conv.id === currentConversationId
                      const displayTitle = getConversationTitle(conv.title)
                      return (
                      <div
                        key={conv.id}
                        className={cn(
                          "group relative flex items-center gap-2 px-3 py-2 m-1 cursor-pointer transition-all rounded-md",
                          "hover:bg-accent hover:shadow-sm",
                          isActive && "bg-accent/50"
                        )}
                        onClick={() => handleConversationSelect(conv.id)}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className={cn(
                                "truncate text-xs",
                                isActive ? "font-bold" : "font-medium"
                              )}>{displayTitle}</p>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{displayTitle}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto"
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7 p-1.5 hover:bg-accent-foreground/10">
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
                            {t("workspace.chat.actions.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleArchive(conv.id, e)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            {t("workspace.chat.actions.archive")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleDelete(conv.id, e)}
                            className="hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&:hover_svg]:!text-destructive [&:focus_svg]:!text-destructive [&:hover_span]:!text-destructive [&:focus_span]:!text-destructive"
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            <span>{t("common.actions.delete")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    )
                    })
                  ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">{t("workspace.chat.list.empty")}</p>
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
            <AlertDialogTitle>{t("workspace.chat.dialog.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.chat.dialog.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsConfirmation && (
            <p className="text-sm text-destructive font-medium">
              {t("workspace.chat.dialog.deleteWarning")}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNeedsConfirmation(false)}>
              {t("common.actions.cancel")}
            </AlertDialogCancel>
            {needsConfirmation ? (
              <AlertDialogAction 
                onClick={confirmDelete} 
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("workspace.chat.dialog.confirmDelete")}
              </AlertDialogAction>
            ) : (
              <Button 
                onClick={() => setNeedsConfirmation(true)} 
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("common.actions.delete")}
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
              <DialogTitle>{t("workspace.chat.rename.title")}</DialogTitle>
              <DialogDescription>{t("workspace.chat.rename.description")}</DialogDescription>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => {
                setRenameValue(event.target.value)
                if (renameError) {
                  setRenameError(null)
                }
              }}
              placeholder={t("workspace.chat.rename.placeholder")}
              autoFocus
              disabled={isRenaming}
            />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRenameDialog} disabled={isRenaming}>
                {t("common.actions.cancel")}
              </Button>
              <Button type="submit" disabled={isRenaming || renameValue.trim().length === 0}>
                {isRenaming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("workspace.chat.rename.saving")}
                  </>
                ) : (
                  t("common.actions.save")
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
