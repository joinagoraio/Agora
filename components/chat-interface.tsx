"use client"

import { useChat } from "ai/react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Send, Loader2, ExternalLink, FileText } from "lucide-react"
import ReactMarkdown from "react-markdown"
import Link from "next/link"
import { buildDocumentUrlFromSource } from "@/lib/utils/document-linking"

interface ChatInterfaceProps {
  workspaceId: string
  conversationId: string
  initialMessages?: any[]
}

export function ChatInterface({ workspaceId, conversationId, initialMessages = [] }: ChatInterfaceProps) {
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: "/api/chat",
    body: {
      workspaceId,
      conversationId,
    },
    initialMessages: hasLoadedInitial ? undefined : initialMessages,
  })

  useEffect(() => {
    if (initialMessages.length > 0 && !hasLoadedInitial) {
      setMessages(initialMessages)
      setHasLoadedInitial(true)
    }
  }, [initialMessages, hasLoadedInitial, setMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <h3 className="mb-2 text-lg font-semibold">Start a conversation</h3>
              <p className="text-sm text-muted-foreground">
                Ask questions about your documents and get instant answers
              </p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <Card
              className={`max-w-[80%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}
            >
              <CardContent className="p-4">
                <div className="mb-1 text-xs font-medium opacity-70">{message.role === "user" ? "You" : "AGORA"}</div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
                {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <p className="text-xs font-medium">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.sources.map((source: any, idx: number) => {
                        // Check if source has document ID (for in-app viewing)
                        const hasDocumentId = source.id && typeof source.id === "string"
                        const hasPageInfo = source.pageNumber !== undefined

                        if (hasDocumentId) {
                          // Link to in-app document viewer
                          const documentUrl = buildDocumentUrlFromSource(workspaceId, source)
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
                )}
              </CardContent>
            </Card>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <Card className="bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-card p-4">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            value={input}
            onChange={handleInputChange}
            placeholder="Ask a question about your documents..."
            className="min-h-[60px] flex-1 resize-none pr-10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as any)
              }
            }}
          />
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
        <p className="mt-2 text-xs text-muted-foreground">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  )
}
