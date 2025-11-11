import { createClient } from "@/lib/supabase/server"
import { getRelevantContext } from "@/lib/rag/search"
import { streamText } from "ai"

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { messages, workspaceId, conversationId } = await req.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response("Unauthorized", { status: 401 })
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1]
    const userQuery = lastMessage.content

    // Get relevant context from documents
    const { context, sources } = await getRelevantContext(workspaceId, userQuery)

    // Build system prompt with context
    const systemPrompt = `You are AGORA, an intelligent policy assistant. You help users find and understand information from their organization's documents.

Context from relevant documents:
${context}

Instructions:
- Answer questions based on the provided context
- If the context doesn't contain relevant information, say so clearly
- Be concise and accurate
- Cite sources when possible
- If asked about something outside the context, politely explain you can only answer based on the workspace documents`

    // Generate AI response
    const result = streamText({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.7,
      maxTokens: 1000,
    })

    // Store the response with sources
    const stream = result.toDataStream({
      async onFinal(completion) {
        // Save assistant message to database
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: completion,
          sources: sources,
        })

        // Update conversation timestamp
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId)
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}
