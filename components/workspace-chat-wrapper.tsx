"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { useSearchParams } from "next/navigation"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatToggleButton } from "@/components/chat-toggle-button"

interface WorkspaceChatWrapperProps {
  workspaceId: string
  workspaceName: string
  children: React.ReactNode
}

const ChatContext = createContext<{
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
}>({
  isChatOpen: false,
  setIsChatOpen: () => {},
})

export function useChatContext() {
  return useContext(ChatContext)
}

export function WorkspaceChatWrapper({ workspaceId, workspaceName, children }: WorkspaceChatWrapperProps) {
  const searchParams = useSearchParams()
  const [isChatOpen, setIsChatOpen] = useState(false)

  // Auto-open chat if conversationId is in URL
  useEffect(() => {
    const conversationId = searchParams.get("conversationId")
    if (conversationId) {
      setIsChatOpen(true)
    }
  }, [searchParams])

  const handleClose = () => {
    setIsChatOpen(false)
    // Optionally clear conversationId from URL when closing
    // This is handled by the sidebar component if needed
  }

  const handleToggle = () => {
    setIsChatOpen(!isChatOpen)
  }

  return (
    <ChatContext.Provider value={{ isChatOpen, setIsChatOpen }}>
      <div className="relative flex min-h-screen">
        <div 
          className={`relative flex-1 transition-all duration-300 ease-out ${
            isChatOpen ? "sm:mr-[800px]" : ""
          }`}
        >
          {children}
          <ChatToggleButton onClick={handleToggle} isOpen={isChatOpen} />
        </div>
        <ChatSidebar
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          isOpen={isChatOpen}
          onClose={handleClose}
        />
      </div>
    </ChatContext.Provider>
  )
}

