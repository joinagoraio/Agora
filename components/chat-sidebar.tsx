"use client"

import { useState, useEffect } from "react"
import { createConversation, getUserConversations, getConversationMessages, deleteConversation, archiveConversation } from "@/lib/actions/conversation"
import { ChatInterface } from "@/components/chat-interface"
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
import { X, Plus, MoreVertical, Archive, Trash2, List } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

interface ChatSidebarProps {
  workspaceId: string
  workspaceName: string
  isOpen: boolean
  onClose: () => void
}

export function ChatSidebar({ workspaceId, workspaceName, isOpen, onClose }: ChatSidebarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<any[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(
    searchParams.get("conversationId") || null
  )
  const [messages, setMessages] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const [isListExpanded, setIsListExpanded] = useState(true)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const conversationId = searchParams.get("conversationId")
      if (conversationId) {
        // Load conversations and the specific conversation
        loadConversations()
        setCurrentConversationId(conversationId)
        loadMessages(conversationId)
      } else {
        // If no conversationId in URL, open the most recent conversation
        loadConversationsAndOpenMostRecent()
      }
    }
  }, [isOpen])

  const loadConversationsAndOpenMostRecent = async () => {
    const result = await getUserConversations(workspaceId)
    if (result.data && result.data.length > 0) {
      const mostRecent = result.data[0] // Already sorted by updated_at descending
      setConversations(result.data)
      setCurrentConversationId(mostRecent.id)
      router.push(`/workspaces/${workspaceId}?conversationId=${mostRecent.id}`)
      loadMessages(mostRecent.id)
    } else if (result.data) {
      setConversations(result.data)
    }
  }

  useEffect(() => {
    const conversationId = searchParams.get("conversationId")
    if (conversationId && conversationId !== currentConversationId) {
      setCurrentConversationId(conversationId)
      loadMessages(conversationId)
    } else if (!conversationId) {
      setCurrentConversationId(null)
      setMessages([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, currentConversationId])

  const loadConversations = async () => {
    const result = await getUserConversations(workspaceId)
    if (result.data) {
      setConversations(result.data)
    }
  }

  const loadMessages = async (conversationId: string) => {
    setIsLoading(true)
    const result = await getConversationMessages(conversationId)
    if (result.data) {
      setMessages(result.data)
    }
    setIsLoading(false)
  }

  const handleNewChat = async () => {
    const result = await createConversation(workspaceId)
    if (result.data) {
      setCurrentConversationId(result.data.id)
      router.push(`/workspaces/${workspaceId}?conversationId=${result.data.id}`)
      setMessages([])
      loadConversations()
    }
  }

  const handleConversationSelect = (conversationId: string) => {
    setCurrentConversationId(conversationId)
    router.push(`/workspaces/${workspaceId}?conversationId=${conversationId}`)
    loadMessages(conversationId)
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
      const updatedResult = await getUserConversations(workspaceId)
      if (updatedResult.data) {
        setConversations(updatedResult.data)
        
        if (wasActiveConversation) {
          // If we deleted the active conversation, redirect to the most recent one
          if (updatedResult.data.length > 0) {
            const mostRecent = updatedResult.data[0]
            setCurrentConversationId(mostRecent.id)
            router.push(`/workspaces/${workspaceId}?conversationId=${mostRecent.id}`)
            loadMessages(mostRecent.id)
          } else {
            // No conversations left
            setCurrentConversationId(null)
            setMessages([])
            router.push(`/workspaces/${workspaceId}`)
          }
        }
      }
    }
    setDeleteDialogOpen(false)
    setConversationToDelete(null)
    setNeedsConfirmation(false)
  }

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      setDeleteDialogOpen(false)
      setConversationToDelete(null)
      setNeedsConfirmation(false)
    }
  }

  const handleArchive = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const wasActiveConversation = conversationId === currentConversationId
    
    const result = await archiveConversation(conversationId)
    if (result.success) {
      // Reload conversations to get updated list
      const updatedResult = await getUserConversations(workspaceId)
      if (updatedResult.data) {
        setConversations(updatedResult.data)
        
        if (wasActiveConversation) {
          // If we archived the active conversation, redirect to the most recent one
          if (updatedResult.data.length > 0) {
            const mostRecent = updatedResult.data[0]
            setCurrentConversationId(mostRecent.id)
            router.push(`/workspaces/${workspaceId}?conversationId=${mostRecent.id}`)
            loadMessages(mostRecent.id)
          } else {
            // No conversations left
            setCurrentConversationId(null)
            setMessages([])
            router.push(`/workspaces/${workspaceId}`)
          }
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
    })) || []

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 flex h-screen w-full flex-col border-l bg-card shadow-lg transition-transform duration-300 ease-out sm:w-[800px] ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header with close button */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        <div>
          <h2 className="text-sm">
            <span className="font-semibold">{workspaceName}</span> <span className="text-muted-foreground">·</span> AI Assistant
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleNewChat} title="New Chat">
            <Plus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsListExpanded(!isListExpanded)} title={isListExpanded ? "Collapse list" : "Expand list"}>
            <List className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main chat area */}
        <main className="flex-1 flex flex-col">
          {currentConversationId ? (
            <ChatInterface
              workspaceId={workspaceId}
              conversationId={currentConversationId}
              initialMessages={formattedMessages}
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

        {/* Sidebar with conversation history */}
        <aside className={`border-l bg-card transition-all duration-300 ${isListExpanded ? "w-64" : "w-0 overflow-hidden"}`}>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-0">
                {conversations && conversations.length > 0 ? (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group relative flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-accent ${
                        conv.id === currentConversationId ? "bg-accent" : ""
                      }`}
                      onClick={() => handleConversationSelect(conv.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{conv.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(conv.updated_at).toLocaleDateString()}
                        </p>
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
                            onClick={(e) => handleArchive(conv.id, e)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => handleDelete(conv.id, e)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">No conversations yet</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogClose}>
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
    </div>
  )
}

