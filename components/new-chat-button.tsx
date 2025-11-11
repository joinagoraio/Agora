"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MessageSquarePlus } from "lucide-react"
import { createConversation } from "@/lib/actions/conversation"

interface NewChatButtonProps {
  workspaceId: string
}

export function NewChatButton({ workspaceId }: NewChatButtonProps) {
  const router = useRouter()

  const handleNewChat = async () => {
    const result = await createConversation(workspaceId)
    if (result.data) {
      router.push(`/workspaces/${workspaceId}/chat?conversationId=${result.data.id}`)
    }
  }

  return (
    <Button className="w-full" onClick={handleNewChat}>
      <MessageSquarePlus className="mr-2 h-4 w-4" />
      New Chat
    </Button>
  )
}

