import { createClient } from "@/lib/supabase/server"
import { getRelevantContext } from "@/lib/rag/search"
import OpenAI from "openai"

let cachedOpenAIClient: OpenAI | null = null

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return null
  }

  if (!cachedOpenAIClient) {
    cachedOpenAIClient = new OpenAI({ apiKey })
  }

  return cachedOpenAIClient
}

// Increase timeout to 60 seconds to handle RAG search and OpenAI API calls
// This is especially important when searching through multiple documents
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const openai = getOpenAIClient()

    // Validate API key before processing
    if (!openai) {
      console.error("[Chat API] OPENAI_API_KEY is missing")
      return new Response(
        JSON.stringify({ 
          error: "OpenAI API key not configured",
          message: "Please set OPENAI_API_KEY in your environment variables"
        }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    const { messages, workspaceId, conversationId, excludedDocumentIds = [], excludedNoteIds = [], excludedEvidenceIds = [] } = await req.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, workspace_id, user_id, context_type, context_id, title")
      .eq("id", conversationId)
      .single()

    if (conversationError) {
      // Check if error is due to missing columns (migration not run)
      if (conversationError.message?.includes("column") && conversationError.message?.includes("does not exist")) {
        console.error("[Chat API] Database migration not applied. Please run scripts/023_add_conversation_context.sql")
        return new Response(
          JSON.stringify({ 
            error: "Database migration required. Please run scripts/023_add_conversation_context.sql in your Supabase SQL Editor." 
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      }
      console.error("[Chat API] Conversation fetch error:", conversationError)
      return new Response("Conversation not found", { status: 404 })
    }

    if (
      !conversation ||
      conversation.workspace_id !== workspaceId ||
      conversation.user_id !== user.id
    ) {
      return new Response("Conversation not found", { status: 404 })
    }

    // Handle legacy conversations without context_type (shouldn't happen after migration, but be safe)
    const contextType = conversation.context_type || "workspace"
    const contextId = conversation.context_id || null

    const shouldRestrictToDocument =
      contextType === "document_view" || contextType === "document_edit"
    
    let includedDocumentIds: string[] | undefined
    
    if (shouldRestrictToDocument) {
      // Document preview/edit mode: only include the specific document
      includedDocumentIds = contextId ? [contextId] : []
    } else {
      // Workspace mode: include all workspace documents except excluded ones
      // This ensures documents shown in "AI Context" are actually included in the search
      // Without this, the search requires text matching and may return no results
      // Filter to match getWorkspaceDocuments: exclude deleted and archived documents
      const { data: workspaceDocuments } = await supabase
        .from("documents")
        .select("id")
        .eq("workspace_id", workspaceId)
        .neq("status", "deleted")
        .neq("status", "archived")
      
      if (workspaceDocuments && workspaceDocuments.length > 0) {
        const excludedSet = new Set(excludedDocumentIds)
        includedDocumentIds = workspaceDocuments
          .map((doc) => doc.id)
          .filter((id) => !excludedSet.has(id))
      } else {
        includedDocumentIds = []
      }
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1]
    const userQuery = lastMessage.content

    // Save user message to database
    if (lastMessage.role === "user") {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: userQuery,
      })
    }

    // Get workspace to fetch additional context
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name, context, location, description, metadata, space_id")
      .eq("id", workspaceId)
      .single()

    // Get space details if workspace has a space_id
    let space = null
    if (workspace?.space_id) {
      const { data: spaceData } = await supabase
        .from("spaces")
        .select("name, description, metadata, jurisdiction")
        .eq("id", workspace.space_id)
        .single()
      space = spaceData
    }

    // Get relevant context from documents, excluding specified document IDs
    const contextStartTime = Date.now()
    console.log(`[Chat API] Starting RAG search for ${includedDocumentIds?.length || 0} documents...`)
    
    const { context, sources } = await getRelevantContext(
      workspaceId,
      userQuery,
      excludedDocumentIds,
      includedDocumentIds,
      excludedNoteIds,
      excludedEvidenceIds,
    )
    
    const contextDuration = (Date.now() - contextStartTime) / 1000
    console.log(`[Chat API] RAG search completed in ${contextDuration.toFixed(2)}s`)
    
    // Log context for debugging
    if (includedDocumentIds && includedDocumentIds.length > 0) {
      console.log(`[Chat API] Included document IDs: ${includedDocumentIds.join(", ")}`)
      console.log(`[Chat API] Context length: ${context.length} chars`)
      console.log(`[Chat API] Sources count: ${sources.length}`)
      if (context.length < 100) {
        console.warn(`[Chat API] Context is very short, document may not have content`)
      }
    }

    // Build system prompt with context
    const isDocumentPreview = shouldRestrictToDocument && contextId
    
    let contextInstructions = ""
    if (isDocumentPreview) {
      contextInstructions = `You are currently in document preview mode, viewing a specific document. You can reference specific pages and sections of this document. When mentioning information from the document, you can indicate which page it's on if that information is available in the context.`
    }

    // Build workspace context section
    let workspaceContextSection = ""
    
    // Workspace details (shown first to emphasize workspace-specific context)
    if (workspace?.name) {
      workspaceContextSection = `\n\nWorkspace name: ${workspace.name}`
    }
    
    const scopeMetadata = ((workspace?.metadata as Record<string, any> | null) ?? {}).scope as
      | Record<string, any>
      | null
      | undefined
    const workspaceSummary = workspace?.description
    const workspaceScopeDescription = scopeMetadata?.description as string | undefined
    const workspaceScopeTimeframe = scopeMetadata?.timeframe as string | undefined

    if (workspace?.context) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nWorkspace context:\n${workspace.context}`
        : `\n\nWorkspace context:\n${workspace.context}`
    }
    if (workspace?.location) {
      workspaceContextSection += workspaceContextSection ? `\n\nWorkspace location: ${workspace.location}` : `\n\nWorkspace location: ${workspace.location}`
    }
    if (workspaceSummary) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nWorkspace summary:\n${workspaceSummary}`
        : `\n\nWorkspace summary:\n${workspaceSummary}`
    }
    if (workspaceScopeDescription) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nWorkspace description:\n${workspaceScopeDescription}`
        : `\n\nWorkspace description:\n${workspaceScopeDescription}`
    }
    if (workspaceScopeTimeframe) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nWorkspace programme timeframe: ${workspaceScopeTimeframe}`
        : `\n\nWorkspace programme timeframe: ${workspaceScopeTimeframe}`
    }
    
    // Space details (parent space context)
    if (space?.name) {
      workspaceContextSection += workspaceContextSection
        ? `\n\n---\n\nParent Space name: ${space.name}`
        : `\n\nParent Space name: ${space.name}`
    }
    
    // Space scope summary (from space.description)
    if (space?.description) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nSpace mission statement:\n${space.description}`
        : `\n\nSpace mission statement:\n${space.description}`
    }
    
    // Space scope details (from space.metadata.scope)
    const spaceScopeMetadata = ((space?.metadata as Record<string, any> | null) ?? {}).scope as
      | Record<string, any>
      | null
      | undefined
    const spaceScopeDescription = spaceScopeMetadata?.description as string | undefined
    const spaceScopeTimeframe = spaceScopeMetadata?.timeframe as string | undefined
    
    if (spaceScopeDescription) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nSpace scope details:\n${spaceScopeDescription}`
        : `\n\nSpace scope details:\n${spaceScopeDescription}`
    }
    if (spaceScopeTimeframe) {
      workspaceContextSection += workspaceContextSection
        ? `\n\nSpace programme timeframe: ${spaceScopeTimeframe}`
        : `\n\nSpace programme timeframe: ${spaceScopeTimeframe}`
    }
    
    // Space jurisdiction
    if (space?.jurisdiction && typeof space.jurisdiction === "object") {
      const jurisdictionValues = Object.values(space.jurisdiction as Record<string, any>)
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .map((value) => String(value).trim())
      if (jurisdictionValues.length > 0) {
        workspaceContextSection += workspaceContextSection
          ? `\n\nSpace jurisdiction: ${jurisdictionValues.join(" • ")}`
          : `\n\nSpace jurisdiction: ${jurisdictionValues.join(" • ")}`
      }
    }
    
    const hasWorkspaceContext = !!(
      workspace?.name ||
      workspace?.context ||
      workspace?.location ||
      workspaceSummary ||
      workspaceScopeDescription ||
      workspaceScopeTimeframe ||
      space?.name ||
      space?.description ||
      spaceScopeDescription ||
      spaceScopeTimeframe ||
      (space?.jurisdiction && typeof space.jurisdiction === "object" && Object.values(space.jurisdiction as Record<string, any>).some((v) => typeof v === "string" && v.trim().length > 0))
    )
    
    const contextMentionInstruction = hasWorkspaceContext 
      ? "  2. The additional workspace context/properties and scope information (if provided)"
      : ""
    
    const systemPrompt = `You are AGORA, an intelligent policy assistant. You help users find and understand information from their organization's documents.

${contextInstructions}${workspaceContextSection}

Context from relevant documents:
${context}

Instructions:
- Answer questions based on the provided context
- If the context doesn't contain relevant information, say so clearly
- Be concise and accurate
- Cite sources when possible, including page numbers if available
${isDocumentPreview ? "- Since you're viewing a specific document, you can reference specific pages and sections" : ""}
- If asked about something outside the context, politely explain you can only answer based on the workspace documents
- When asked about your context or what information you have access to, mention:
  1. The documents you can access (from the document context provided)
${contextMentionInstruction}`

    // Prepare messages for OpenAI (convert to OpenAI format)
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
    ]

    // Track thinking start time (time before API call)
    const thinkingStartTime = Date.now()
    console.log(`[Chat API] Calling OpenAI API with ${openaiMessages.length} messages...`)

    // Create a streaming response
    // Note: maxDuration (60s) handles overall route timeout
    // The OpenAI SDK will handle connection timeouts internally
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      temperature: 0.7,
      stream: true,
    })

    // Track when first chunk arrives (thinking end time)
    let thinkingEndTime: number | null = null
    let thinkingDuration: number | null = null

    // Create a ReadableStream to transform OpenAI's stream format to the format expected by useChat
    const encoder = new TextEncoder()
    let fullResponse = ""

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // Record thinking end time on first chunk
            if (thinkingEndTime === null) {
              thinkingEndTime = Date.now()
              thinkingDuration = (thinkingEndTime - thinkingStartTime) / 1000 // Convert to seconds
            }

            const content = chunk.choices[0]?.delta?.content || ""
            if (content) {
              fullResponse += content
              // Format for useChat hook - it expects: 0:"text content"
              // We need to properly escape the content
              const escapedContent = content
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
              const data = `0:"${escapedContent}"\n`
              controller.enqueue(encoder.encode(data))
            }
          }

          // Save assistant message to database after streaming completes
          try {
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: fullResponse,
              sources: sources,
              thinking_duration: thinkingDuration,
            })

            // Generate conversation title if it's still "New Conversation"
            if (conversation.title === "New Conversation") {
              try {
                // Generate a short, descriptive title based on the user's question
                const titleResponse = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: [
                    {
                      role: "system",
                      content: "Generate a very short, descriptive title (maximum 6 words) for a conversation based on the user's question. Return only the title, nothing else.",
                    },
                    {
                      role: "user",
                      content: userQuery,
                    },
                  ],
                  temperature: 0.7,
                  max_tokens: 20,
                })

                const generatedTitle = titleResponse.choices[0]?.message?.content?.trim() || null
                if (generatedTitle) {
                  // Ensure title is not too long (max 64 characters)
                  const finalTitle = generatedTitle.length > 64 
                    ? `${generatedTitle.slice(0, 61).trimEnd()}...` 
                    : generatedTitle

                  await supabase
                    .from("conversations")
                    .update({
                      title: finalTitle,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", conversationId)
                }
              } catch (titleError) {
                console.error("[Chat API] Failed to generate conversation title:", titleError)
                // Fallback to using a truncated version of the user's message
                const cleanedTitle = userQuery.replace(/\s+/g, " ").trim()
                if (cleanedTitle.length > 0) {
                  const maxLength = 64
                  const autoTitle = cleanedTitle.length > maxLength 
                    ? `${cleanedTitle.slice(0, maxLength - 3).trimEnd()}...` 
                    : cleanedTitle

                  await supabase
                    .from("conversations")
                    .update({
                      title: autoTitle,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", conversationId)
                }
              }
            }

            // Update conversation timestamp
            await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId)
          } catch (dbError) {
            console.error("[Chat API] Failed to persist assistant response:", dbError)
          }

          controller.close()
        } catch (streamError) {
          console.error("[Chat API] Stream error:", streamError)
          
          // Try to send error message to client before closing
          try {
            const errorMessage = streamError instanceof Error ? streamError.message : String(streamError)
            const errorData = `0:"[Error: ${errorMessage}]"\n`
            controller.enqueue(encoder.encode(errorData))
          } catch (e) {
            console.error("[Chat API] Failed to send error message:", e)
          }
          
          controller.error(streamError)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (error) {
    console.error("[Chat API] Error details:", error)
    
    // Handle OpenAI SDK errors (they have a specific structure)
    if (error && typeof error === 'object' && 'status' in error) {
      const openaiError = error as any
      const status = openaiError.status
      const errorMessage = openaiError.message || String(error)
      const errorCode = openaiError.code || openaiError.type
      
      console.error("[Chat API] OpenAI API error:", {
        status,
        code: errorCode,
        message: errorMessage,
        error: openaiError.error
      })
      
      // Check for quota/credit issues
      if (
        status === 402 || // Payment Required
        status === 429 || // Rate Limit
        errorMessage.toLowerCase().includes("insufficient_quota") ||
        errorMessage.toLowerCase().includes("quota") ||
        errorMessage.toLowerCase().includes("billing") ||
        errorMessage.toLowerCase().includes("payment") ||
        errorMessage.toLowerCase().includes("credit") ||
        errorCode === "insufficient_quota" ||
        errorCode === "billing_not_active"
      ) {
        return new Response(
          JSON.stringify({ 
            error: "OpenAI API quota exceeded",
            message: "Your OpenAI account has insufficient credits or quota. Please add credits to your OpenAI account to continue using the chat feature."
          }),
          { 
            status: 402,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
      
      // Check for rate limit (different from quota)
      if (status === 429 || errorMessage.toLowerCase().includes("rate limit")) {
        return new Response(
          JSON.stringify({ 
            error: "OpenAI API rate limit exceeded",
            message: "Too many requests. Please wait a moment and try again."
          }),
          { 
            status: 429,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
      
      // Check for authentication errors
      if (
        status === 401 ||
        errorMessage.toLowerCase().includes("api key") ||
        errorMessage.toLowerCase().includes("authentication") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        return new Response(
          JSON.stringify({ 
            error: "OpenAI API authentication failed",
            message: "Please check your OPENAI_API_KEY environment variable"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
    }
    
    // Handle regular Error objects
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      
      // Check for quota/credit issues in error message
      if (
        errorMessage.includes("insufficient_quota") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("billing") ||
        errorMessage.includes("payment") ||
        errorMessage.includes("credit")
      ) {
        return new Response(
          JSON.stringify({ 
            error: "OpenAI API quota exceeded",
            message: "Your OpenAI account has insufficient credits or quota. Please add credits to your OpenAI account to continue using the chat feature."
          }),
          { 
            status: 402,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
      
      // Check for rate limit
      if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        return new Response(
          JSON.stringify({ 
            error: "OpenAI API rate limit exceeded",
            message: "Too many requests. Please wait a moment and try again."
          }),
          { 
            status: 429,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
      
      // Check for authentication
      if (errorMessage.includes("api key") || errorMessage.includes("authentication") || errorMessage.includes("401")) {
        return new Response(
          JSON.stringify({ 
            error: "OpenAI API authentication failed",
            message: "Please check your OPENAI_API_KEY environment variable"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        )
      }
    }
    
    // Generic error response
    return new Response(
      JSON.stringify({ 
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Unknown error",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : String(error)) : undefined
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  }
}
