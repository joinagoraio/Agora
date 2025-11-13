"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { useSearchParams } from "next/navigation"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatToggleButton } from "@/components/chat-toggle-button"

interface WorkspaceChatWrapperProps {
  workspaceId: string
  workspaceName: string
  children: React.ReactNode
  defaultOpen?: boolean
}

const ChatContext = createContext<{
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
  sidebarWidth: number | null
  setSidebarWidth: (width: number | null) => void
  isSidebarResizing: boolean
  setIsSidebarResizing: (isResizing: boolean) => void
}>({
  isChatOpen: false,
  setIsChatOpen: () => {},
  sidebarWidth: null,
  setSidebarWidth: () => {},
  isSidebarResizing: false,
  setIsSidebarResizing: () => {},
})

export function useChatContext() {
  return useContext(ChatContext)
}

export function WorkspaceChatWrapper({
  workspaceId,
  workspaceName,
  children,
  defaultOpen = false,
}: WorkspaceChatWrapperProps) {
  const searchParams = useSearchParams()
  const [isChatOpen, setIsChatOpen] = useState(defaultOpen)
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)

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

  // Get responsive default width for margin calculation
  const getDefaultWidth = () => {
    if (typeof window === "undefined") return 800
    if (window.innerWidth >= 1280) return 800 // xl
    if (window.innerWidth >= 1024) return 600 // lg
    if (window.innerWidth >= 768) return 500 // md
    if (window.innerWidth >= 640) return 400 // sm
    return 0 // mobile: no margin
  }

  const currentMargin = sidebarWidth ?? getDefaultWidth()
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640
  const effectiveMargin = !isMobile && isChatOpen ? currentMargin : 0
  const toggleOffsetRight = (isMobile ? 16 : 24) + effectiveMargin
  const toggleOffsetBottom = isMobile ? 16 : 24

  return (
    <ChatContext.Provider
      value={{ isChatOpen, setIsChatOpen, sidebarWidth, setSidebarWidth, isSidebarResizing, setIsSidebarResizing }}
    >
      <div className="relative flex min-h-screen overflow-x-hidden">
        <div 
          className={`relative flex-1 ${isSidebarResizing ? "transition-none" : "transition-[margin-right] duration-300 ease-out"}`}
          style={!isMobile ? { marginRight: `${effectiveMargin}px` } : undefined}
        >
          {children}
          <ChatToggleButton
            onClick={handleToggle}
            isOpen={isChatOpen}
            offsetRight={toggleOffsetRight}
            offsetBottom={toggleOffsetBottom}
          />
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
