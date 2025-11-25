import { getSharedConversation, getSharedMessages } from "@/lib/actions/sharing"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, ExternalLink } from "lucide-react"
import ReactMarkdown from "react-markdown"

export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const { data: sharedLink, error } = await getSharedConversation(token)

  if (error || !sharedLink) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h2 className="mb-2 text-xl font-bold">Link Not Found</h2>
            <p className="text-center text-sm text-muted-foreground">
              {error || "This shared conversation link is invalid or has expired."}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { data: messages } = await getSharedMessages(sharedLink.conversation_id)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6" />
            <div>
              <h1 className="text-xl font-bold">AGORA</h1>
              <p className="text-xs text-muted-foreground">Shared Conversation</p>
            </div>
          </div>
          <Badge variant="secondary">Read-only</Badge>
        </div>
      </header>

      <main className="flex-1 bg-white">
        <div className="container mx-auto max-w-4xl py-8 px-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">{sharedLink.conversations.title || "Shared Conversation"}</h2>
            <p className="text-sm text-muted-foreground">From workspace: {sharedLink.conversations.workspaces.name}</p>
          </div>

          <div className="space-y-4">
            {messages && messages.length > 0 ? (
              messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <Card
                    className={`max-w-[80%] ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="mb-1 text-xs font-medium opacity-70">
                        {message.role === "user" ? "User" : "AGORA"}
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      {message.role === "assistant" && (() => {
                        const docs = Array.isArray(message.sources)
                          ? message.sources
                          : Array.isArray(message.sources?.documents)
                            ? message.sources.documents
                            : []
                        return docs.length > 0 ? (
                        <div className="mt-3 space-y-2 border-t pt-3">
                          <p className="text-xs font-medium">Sources:</p>
                          <div className="flex flex-wrap gap-2">
                            {docs.map((source: any, idx: number) => (
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
                            ))}
                          </div>
                        </div>
                        ) : null
                      })()}
                    </CardContent>
                  </Card>
                </div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No messages in this conversation</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="mt-8 rounded-lg border bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              This is a read-only shared conversation. To start your own conversation,{" "}
              <a href="/" className="font-medium text-primary underline-offset-4 hover:underline">
                sign up for AGORA
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
