"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatToggleButton } from "@/components/chat-toggle-button"
import { patchAskPanelPreference } from "@/lib/chat/ask-panel-preference"
import type { ChatGuidanceConfig, ChatPanelTab } from "@/lib/guidance/chat-guidance"

interface WorkspaceChatWrapperProps {
  workspaceId?: string
  spaceId?: string
  workspaceName: string
  children: React.ReactNode
  defaultOpen?: boolean
  defaultPanelTab?: ChatPanelTab
  canManage?: boolean
}

const ChatContext = createContext<{
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
  sidebarWidth: number | null
  setSidebarWidth: (width: number | null) => void
  isSidebarResizing: boolean
  setIsSidebarResizing: (isResizing: boolean) => void
  setGuidance: (guidance: ChatGuidanceConfig | null) => void
  panelTab: ChatPanelTab
  setPanelTab: (tab: ChatPanelTab) => void
}>({
  isChatOpen: false,
  setIsChatOpen: () => {},
  sidebarWidth: null,
  setSidebarWidth: () => {},
  isSidebarResizing: false,
  setIsSidebarResizing: () => {},
  setGuidance: () => {},
  panelTab: "ask",
  setPanelTab: () => {},
})

export function useChatContext() {
  return useContext(ChatContext)
}

export function WorkspaceChatWrapper({
  workspaceId,
  spaceId,
  workspaceName,
  children,
  defaultOpen = false,
  defaultPanelTab = "ask",
  canManage = true,
}: WorkspaceChatWrapperProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isChatOpen, setIsChatOpen] = useState(defaultOpen)
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [guidance, setGuidance] = useState<ChatGuidanceConfig | null>(null)
  const [panelTab, setPanelTab] = useState<ChatPanelTab>(defaultPanelTab)

  // Auto-open chat if conversationId is in URL
  // Only open if not already open to avoid closing/reopening loops
  useEffect(() => {
    const conversationId = searchParams.get("conversationId")
    if (conversationId && !isChatOpen) {
      setIsChatOpen(true)
    }
  }, [searchParams, isChatOpen])

  const persistOpen = (open: boolean) => {
    setIsChatOpen(open)
    patchAskPanelPreference(spaceId, workspaceId, { open })
  }

  const handleClose = () => {
    persistOpen(false)
    // Clear conversationId from URL when closing to prevent auto-reopening
    const conversationId = searchParams.get("conversationId")
    if (conversationId) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("conversationId")
      const queryString = params.toString()
      const targetUrl = queryString ? `${pathname}?${queryString}` : pathname
      router.replace(targetUrl)
    }
  }

  const handleToggle = () => {
    persistOpen(!isChatOpen)
  }

  // Get responsive default width for margin calculation
  // Use a consistent default on server to avoid hydration mismatch
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  const getDefaultWidth = () => {
    if (!mounted) return 800 // Consistent default for SSR
    if (window.innerWidth >= 1280) return 800 // xl
    if (window.innerWidth >= 1024) return 600 // lg
    if (window.innerWidth >= 768) return 500 // md
    if (window.innerWidth >= 640) return 400 // sm
    return 0 // mobile: no margin
  }

  const currentMargin = sidebarWidth ?? getDefaultWidth()
  const isMobile = mounted && window.innerWidth < 640
  const effectiveMargin = !isMobile && isChatOpen ? currentMargin : 0
  const toggleOffsetRight = (isMobile ? 16 : 24) + effectiveMargin
  const toggleOffsetBottom = isMobile ? 16 : 24

  return (
    <ChatContext.Provider
      value={{
        isChatOpen,
        setIsChatOpen: persistOpen,
        sidebarWidth,
        setSidebarWidth,
        isSidebarResizing,
        setIsSidebarResizing,
        setGuidance,
        panelTab,
        setPanelTab,
      }}
    >
      <div className="relative flex min-h-screen overflow-x-hidden">
        <div 
          className={`relative min-w-0 flex-1 ${isSidebarResizing ? "transition-none" : "transition-[margin-right] duration-300 ease-out"}`}
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
          spaceId={spaceId}
          workspaceName={workspaceName}
          isOpen={isChatOpen}
          onClose={handleClose}
          canManage={canManage}
          guidance={guidance}
          panelTab={panelTab}
          onPanelTabChange={setPanelTab}
        />
      </div>
    </ChatContext.Provider>
  )
}
