import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createConversation, getUserConversations, getConversationMessages } from "@/lib/actions/conversation"
import { ChatInterface } from "@/components/chat-interface"
import { ShareConversationDialog } from "@/components/share-conversation-dialog"
import { NewChatButton } from "@/components/new-chat-button"
import { UserMenu } from "@/components/user-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ conversationId?: string }>
}) {
  const { workspaceId } = await params
  const { conversationId } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get workspace details
  const { data: workspace } = await supabase.from("workspaces").select("*, spaces(*)").eq("id", workspaceId).single()

  if (!workspace) {
    redirect("/dashboard")
  }

  // Get or create conversation
  let currentConversationId = conversationId
  if (!currentConversationId) {
    const result = await createConversation(workspaceId)
    if (result.data) {
      currentConversationId = result.data.id
      redirect(`/workspaces/${workspaceId}/chat?conversationId=${currentConversationId}`)
    }
  }

  // Get all conversations
  const { data: conversations } = await getUserConversations(workspaceId)

  // Get current conversation messages
  const { data: messages } = currentConversationId ? await getConversationMessages(currentConversationId) : { data: [] }

  const formattedMessages =
    messages?.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      sources: msg.sources,
    })) || []

  return (
    <div className="flex h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href={`/spaces/${workspace.spaces.id}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="text-sm font-normal">Back to {workspace.spaces.name}</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">{workspace.name}</h1>
              <p className="text-sm text-muted-foreground">AI Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentConversationId && messages && messages.length > 0 && (
              <ShareConversationDialog conversationId={currentConversationId} />
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with conversation history */}
        <aside className="w-64 border-r bg-card">
          <div className="flex h-full flex-col">
            <div className="border-b p-4">
              <NewChatButton workspaceId={workspaceId} />
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-4">
                {conversations && conversations.length > 0 ? (
                  conversations.map((conv) => (
                    <Link key={conv.id} href={`/workspaces/${workspaceId}/chat?conversationId=${conv.id}`}>
                      <Card
                        className={`cursor-pointer transition-colors hover:bg-accent ${
                          conv.id === currentConversationId ? "border-primary bg-accent" : ""
                        }`}
                      >
                        <CardContent className="p-3">
                          <p className="truncate text-sm font-medium">{conv.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(conv.updated_at).toLocaleDateString()}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                ) : (
                  <p className="text-center text-sm text-muted-foreground">No conversations yet</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </aside>

        {/* Main chat area */}
        <main className="flex-1">
          {currentConversationId ? (
            <ChatInterface
              workspaceId={workspaceId}
              conversationId={currentConversationId}
              initialMessages={formattedMessages}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Card>
                <CardContent className="p-8">
                  <h3 className="mb-2 text-lg font-semibold">No conversation selected</h3>
                  <p className="text-sm text-muted-foreground">Start a new conversation to begin chatting</p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
