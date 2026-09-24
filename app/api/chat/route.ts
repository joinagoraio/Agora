import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRelevantContext } from "@/lib/rag/search"
import { buildChatScopeAwareness, buildWorkspaceContext } from "@/lib/chat/context"
import { CHAT_IDENTITY_AUTHORITY } from "@/lib/chat/playbook-compiler"
import { analyzePromptInjection } from "@/lib/chat/prompt-guard"
import { compileSystemPrompt } from "@/lib/chat/playbook-compiler"
import { openaiClientForTarget } from "@/lib/llm/openai-client"
import { chatCompletionSampling } from "@/lib/llm/model-params"
import OpenAI from "openai"
import { applyRateLimitHeaders, chatRateLimit, checkRateLimit, RateLimitStatus } from "@/lib/rate-limit"
import { chatMessageSchema } from "@/lib/validations/document"
import { compileAskAnswer } from "@/lib/chat/ask-format"
import { writingLanguageName } from "@/lib/programme/writing-language"
import { resolveCitations } from "@/lib/chat/resolve-citations"
import { getClientIdentifier } from "@/lib/utils/request"

function readMessageContent(message: any): string {
  if (!message || typeof message !== "object") {
    return ""
  }

  const extractFromValue = (value: unknown): string => {
    if (!value) {
      return ""
    }

    if (typeof value === "string") {
      return value
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") {
            return item
          }
          if (item && typeof item === "object") {
            const { text, content: innerContent } = item as { text?: unknown; content?: unknown }
            if (typeof text === "string") {
              return text
            }
            if (typeof innerContent === "string") {
              return innerContent
            }
          }
          return ""
        })
        .join("")
    }

    if (typeof value === "object") {
      const { text, content } = value as { text?: unknown; content?: unknown }
      if (typeof text === "string") {
        return text
      }
      if (typeof content === "string") {
        return content
      }
      if (Array.isArray(content)) {
        return extractFromValue(content)
      }
    }

    return ""
  }

  const { content, parts } = message as { content?: unknown; parts?: unknown }
  const contentText = extractFromValue(content)
  if (contentText) {
    return contentText
  }
  return extractFromValue(parts)
}

// Increase timeout to 60 seconds to handle RAG search and OpenAI API calls
// This is especially important when searching through multiple documents
export const maxDuration = 60

export async function POST(req: Request) {
  let rateLimitResult: RateLimitStatus | undefined
  const withRateLimit = (response: Response) => applyRateLimitHeaders(response, rateLimitResult)

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient() // Admin client for message writes (bypasses RLS)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const identifier = user?.id ?? getClientIdentifier(req.headers)
    const rateLimitKey = user ? `chat:user:${user.id}` : `chat:ip:${identifier}`
    const currentRateLimit = await checkRateLimit(chatRateLimit, rateLimitKey)
    rateLimitResult = currentRateLimit

    if (!currentRateLimit.success) {
      return withRateLimit(
        new Response(JSON.stringify({ error: "Too many chat requests. Please wait and try again." }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }

    const body = await req.json()
    const { messages, workspaceId, spaceId, conversationId, excludedDocumentIds = [], excludedNoteIds = [], excludedEvidenceIds = [] } = body

    // Get the last user message for validation
    if (!messages || messages.length === 0) {
      return withRateLimit(
        new Response(
        JSON.stringify({ error: "Messages array is required and cannot be empty" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
    }
    const lastMessage = messages[messages.length - 1]
    const userQuery = readMessageContent(lastMessage)

    // Validate input with Zod
    const validationResult = chatMessageSchema.safeParse({
      message: userQuery,
      conversationId,
      workspaceId,
      spaceId,
      excludedDocumentIds: excludedDocumentIds || [],
      excludedNoteIds: excludedNoteIds || [],
      excludedEvidenceIds: excludedEvidenceIds || [],
    })

    if (!validationResult.success) {
      return withRateLimit(
        new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validationResult.error.errors.map(e => ({
            path: e.path.join("."),
            message: e.message,
          }))
        }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
    }

    if (!user) {
      return withRateLimit(new Response("Unauthorized", { status: 401 }))
    }

    const { data: conversation, error: conversationError } = await adminSupabase
      .from("conversations")
      .select("id, workspace_id, space_id, user_id, context_type, context_id, title")
      .eq("id", conversationId)
      .single()

    if (conversationError) {
      // Check if error is due to missing columns (migration not run)
      if (conversationError.message?.includes("column") && conversationError.message?.includes("does not exist")) {
        console.error("[Chat API] Database migration not applied. Please run scripts/023_add_conversation_context.sql")
        return withRateLimit(
          new Response(
          JSON.stringify({ 
            error: "Database migration required. Please run scripts/023_add_conversation_context.sql in your Supabase SQL Editor." 
          }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
      console.error("[Chat API] Conversation fetch error:", conversationError)
      return withRateLimit(new Response("Conversation not found", { status: 404 }))
    }

    if (
      !conversation ||
      conversation.user_id !== user.id ||
      (spaceId ? conversation.space_id !== spaceId : conversation.workspace_id !== workspaceId)
    ) {
      return withRateLimit(new Response("Conversation not found", { status: 404 }))
    }

    // Handle legacy conversations without context_type (shouldn't happen after migration, but be safe)
    const contextType = conversation.context_type || "workspace"
    const contextId = conversation.context_id || null

    const shouldRestrictToDocument =
      contextType === "document_view" || contextType === "document_edit"
    
    let includedDocumentIds: string[] | undefined
    
    if (shouldRestrictToDocument) {
      includedDocumentIds = contextId ? [contextId] : []
    } else if (spaceId) {
      includedDocumentIds = undefined
    } else {
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

    // Get the last user message (already extracted above for validation)
    // lastMessage is already defined above

    // Save user message to database (using admin client to bypass RLS)
    if (lastMessage.role === "user") {
      await adminSupabase.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: userQuery,
      })
    }

    // Pre-create assistant message placeholder to ensure persistence even if streaming fails
    let assistantMessageId: string | null = null
    const { data: placeholderMessage, error: placeholderError } = await adminSupabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        sources: { documents: [], citations: [] },
        thinking_duration: null,
      })
      .select("id")
      .single()

    if (placeholderError) {
      console.error("[Chat API] Failed to create assistant message placeholder:", placeholderError)
    } else if (placeholderMessage?.id) {
      assistantMessageId = placeholderMessage.id
    }

    let workspace = null
    let space = null
    let context = ""
    let documentSources: any[] = []

    if (spaceId) {
      const { data: spaceData } = await supabase
        .from("spaces")
        .select("name, description, metadata, jurisdiction, writing_language")
        .eq("id", spaceId)
        .single()
      space = spaceData

      const { data: items } = await adminSupabase
        .from("space_items")
        .select("id, payload")
        .eq("space_id", spaceId)
        .eq("item_type", "document")
        .order("created_at", { ascending: false })

      const excludedSet = new Set(excludedDocumentIds as string[])
      const wanted = (items ?? []).filter((item: { id: string }) => {
        if (shouldRestrictToDocument && contextId) {
          return item.id === contextId
        }
        return !excludedSet.has(item.id)
      })

      documentSources = wanted.map((item: any) => ({
        id: item.id,
        title: item.payload?.title || item.payload?.file_name || "Untitled document",
      }))

      const parts: string[] = []
      for (const item of wanted) {
        const payload = (item.payload ?? {}) as { title?: string; full_text?: string; summary?: string }
        const text = (payload.full_text || payload.summary || "").trim()
        if (!text) continue
        const label = item.id === contextId ? "OPEN DOCUMENT" : "LIBRARY DOCUMENT"
        const clipped = text.length > (item.id === contextId ? 24000 : 4000) ? `${text.slice(0, item.id === contextId ? 24000 : 4000)}\n…` : text
        parts.push(`${label} (${payload.title || item.id}, id ${item.id}):\n${clipped}`)
      }
      context = parts.join("\n\n").slice(0, 60000)
    } else {
      const { data: workspaceRecord } = await supabase
        .from("workspaces")
        .select("name, context, location, summary, description, metadata, space_id")
        .eq("id", workspaceId)
        .single()
      workspace = workspaceRecord

      if (workspace?.space_id) {
        const { data: spaceData } = await supabase
          .from("spaces")
          .select("name, description, metadata, jurisdiction, writing_language")
          .eq("id", workspace.space_id)
          .single()
        space = spaceData
      }

      const rag = await getRelevantContext(
        workspaceId,
        userQuery,
        excludedDocumentIds,
        includedDocumentIds,
        excludedNoteIds,
        excludedEvidenceIds,
      )
      context = rag.context
      documentSources = rag.sources
    }
    
    // Check if this is a continuation of a conversation (has previous messages)
    const hasPreviousMessages = messages && messages.length > 1
    
    // Get explicit lists of included/excluded items for the system prompt
    let includedItemsList = ""
    let excludedItemsList = ""
    
    if (hasPreviousMessages && (excludedDocumentIds.length > 0 || excludedNoteIds.length > 0 || excludedEvidenceIds.length > 0)) {
      // Build list of included documents from sources
      const includedDocTitles = documentSources
        .filter((s: any) => s.id && !excludedDocumentIds.includes(s.id))
        .map((s: any) => s.title || s.id)
        .filter(Boolean)
      
      if (includedDocTitles.length > 0) {
        includedItemsList += `\nINCLUDED DOCUMENTS (you CAN use these):\n${includedDocTitles.map((title: string) => `- ${title}`).join("\n")}\n`
      }
      
      // Get excluded document titles
      if (workspaceId && excludedDocumentIds.length > 0) {
        const { data: excludedDocs } = await supabase
          .from("documents")
          .select("id, title")
          .in("id", excludedDocumentIds)
          .eq("workspace_id", workspaceId)
        
        if (excludedDocs && excludedDocs.length > 0) {
          const excludedDocTitles = excludedDocs.map((d: any) => d.title || d.id).filter(Boolean)
          excludedItemsList += `\n\n🚫 EXCLUDED DOCUMENTS (you MUST NOT use these - ignore any references to them in previous messages):\n${excludedDocTitles.map((title: string) => `- ${title}`).join("\n")}\n`
        }
      }
      
      // Get excluded note titles/content previews
      if (workspaceId && excludedNoteIds.length > 0) {
        const { data: excludedNotes } = await supabase
          .from("workspace_notes")
          .select("id, content")
          .in("id", excludedNoteIds)
          .eq("workspace_id", workspaceId)
        
        if (excludedNotes && excludedNotes.length > 0) {
          const excludedNotePreviews = excludedNotes.map((n: any) => {
            const preview = typeof n.content === "string" && n.content.length > 0
              ? n.content.substring(0, 50) + (n.content.length > 50 ? "..." : "")
              : "Note"
            return preview
          })
          excludedItemsList += `\n\n🚫 EXCLUDED NOTES (you MUST NOT use these):\n${excludedNotePreviews.map((preview: string, idx: number) => `- Note ${idx + 1}: ${preview}`).join("\n")}\n`
        }
      }
      
      // Get excluded evidence items
      if (workspaceId && excludedEvidenceIds.length > 0) {
        const { data: excludedEvidence } = await supabase
          .from("workspace_items")
          .select("id, payload")
          .in("id", excludedEvidenceIds)
          .eq("workspace_id", workspaceId)
          .eq("inheritance", "local")
        
        if (excludedEvidence && excludedEvidence.length > 0) {
          excludedItemsList += `\n\n🚫 EXCLUDED EVIDENCE ITEMS (you MUST NOT use these):\n${excludedEvidence.map((e: any, idx: number) => {
            const evidenceText = e.payload?.text || e.payload?.content || "Evidence item"
            const preview = typeof evidenceText === "string" && evidenceText.length > 0
              ? evidenceText.substring(0, 50) + (evidenceText.length > 50 ? "..." : "")
              : "Evidence"
            return `- Evidence ${idx + 1}: ${preview}`
          }).join("\n")}\n`
        }
      }
    }
    
    // Log context for debugging
    if (includedDocumentIds && includedDocumentIds.length > 0) {
      console.log(`[Chat API] Included document IDs: ${includedDocumentIds.join(", ")}`)
      console.log(`[Chat API] Context length: ${context.length} chars`)
      console.log(`[Chat API] Sources count: ${documentSources.length}`)
      if (context.length < 100) {
        console.warn(`[Chat API] Context is very short, document may not have content`)
      }
    }

    const promptGuard = analyzePromptInjection(userQuery, context)
    if (promptGuard.flagged) {
      console.warn("[Chat API] Prompt injection detected", {
        severity: promptGuard.severity,
        reasons: promptGuard.reasons,
        conversationId,
        workspaceId,
      })

      // Only block requests that are high severity. Log and continue for low/medium.
      if (promptGuard.severity === "high") {
        return withRateLimit(
          new Response(
            JSON.stringify({
              error: "Prompt rejected due to security policy",
              reasons: promptGuard.reasons,
              severity: promptGuard.severity,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
        )
      }
    }

    // Build system prompt with context
    const isDocumentPreview = shouldRestrictToDocument && contextId
    
    const { contextInstructions, workspaceContextSection, hasWorkspaceContext } = buildWorkspaceContext({
      workspace,
      space,
      includeDocumentPreviewNotice: shouldRestrictToDocument && contextId,
    })
    const formattedContextInstructions =
      typeof contextInstructions === "string" && contextInstructions.trim().length > 0
        ? `${contextInstructions.trim()}\n\n`
        : ""
    const formattedWorkspaceContextSection =
      typeof workspaceContextSection === "string" && workspaceContextSection.trim().length > 0
        ? `${workspaceContextSection.trim()}\n\n`
        : ""
    
    const chatScope = spaceId ? "authority" : "programme"
    const scopeAwareness = buildChatScopeAwareness(chatScope)
    const contextMentionInstruction = hasWorkspaceContext ? scopeAwareness.mentionInstruction : ""
    const contextAwarenessSection = hasWorkspaceContext ? scopeAwareness.awarenessSection : ""
    
    const contextChangeNotice = hasPreviousMessages && excludedItemsList
      ? `\n\n⚠️ CRITICAL: CONTEXT HAS CHANGED ⚠️

The user has EXCLUDED items from the AI Context section. The lists below show what you CAN and CANNOT use.

${includedItemsList}${excludedItemsList}

ABSOLUTE REQUIREMENTS:
1. You MUST IGNORE any references to the EXCLUDED items listed above in previous messages
2. You MUST ONLY use information from INCLUDED items (listed above or in the context below)
3. If a previous message referenced an EXCLUDED item, DO NOT use that information - it has been explicitly excluded
4. If asked about something from a previous message that's in the EXCLUDED list, clearly state: "That information is no longer available in the current AI Context. The user has excluded it from this conversation."
5. DO NOT assume information from previous messages is still available - check the lists above first

The conversation history may contain references to EXCLUDED items. You must COMPLETELY IGNORE those references and only use what's currently included.

`
      : hasPreviousMessages
      ? `\n\n⚠️ CRITICAL: CONTEXT MAY HAVE CHANGED ⚠️

The context provided below reflects the CURRENT state of the AI Context section. The user may have included or excluded documents, notes, or evidence since previous messages.

YOU MUST:
1. IGNORE any references to documents, notes, or evidence in previous messages that are NOT in the current context below
2. ONLY use information from the documents, notes, and evidence that are ACTUALLY provided in the context section below
3. If a previous message referenced something that's not in the current context, DO NOT use that information - it has been excluded
4. If asked about something from a previous message that's not in the current context, clearly state: "That information is no longer available in the current AI Context. The user has excluded it from this conversation."
5. DO NOT assume information from previous messages is still available - always verify it's in the current context below

The conversation history above may contain references to items that are no longer included. You must ONLY use what's in the current context below, regardless of what was mentioned earlier.

`
      : ""

    const runtimeSections = `${contextAwarenessSection}${formattedContextInstructions}${formattedWorkspaceContextSection}${contextChangeNotice}Context from user-selected documents, notes, and evidence (from AI Context section):
${context}`

    const { parseProgrammeBindings } = await import("@/lib/programme/domain")
    const { getLatestPlaybookBody } = await import("@/lib/actions/playbook")
    const { parsePlaybookRuntimeConfig } = await import("@/lib/programme/model-tiers")
    const { resolvePlatformTaskLlm } = await import("@/lib/llm/resolve")
    const { loadPromptLayers } = await import("@/lib/llm/prompts")
    const { completePlatformTask } = await import("@/lib/llm/resolve")
    const bindings = parseProgrammeBindings((workspace?.metadata as Record<string, unknown>) || {})
    let playbookBody: string | undefined
    let playbookConfig: unknown = {}
    if (bindings.playbookId) {
      const latest = await getLatestPlaybookBody(bindings.playbookId)
      playbookBody = latest.body
      playbookConfig = latest.config ?? {}
    }
    const runtimeConfig = parsePlaybookRuntimeConfig(playbookConfig)
    const layers = await loadPromptLayers("chat")

    const writingLanguage = writingLanguageName(
      (space as { writing_language?: string | null } | null)?.writing_language,
    )

    const { systemPrompt } = compileSystemPrompt({
      kind: "chat",
      userLanguage: writingLanguage,
      chatScope,
      identity: chatScope === "authority" ? CHAT_IDENTITY_AUTHORITY : layers.identity,
      playbookBody: playbookBody ?? layers.playbook,
      runtimeSections,
      isDocumentPreview,
      contextMentionInstruction,
      citationMode: runtimeConfig.citationMode,
    })

    // Prepare messages for OpenAI (convert to OpenAI format)
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: readMessageContent(msg),
      })),
    ]

    // Track thinking start time (time before API call)
    const thinkingStartTime = Date.now()
    console.log(`[Chat API] Calling OpenAI API with ${openaiMessages.length} messages...`)

    // Create a streaming response
    // Note: maxDuration (60s) handles overall route timeout
    // The OpenAI SDK will handle connection timeouts internally
    const chatTask = isDocumentPreview ? "chat_preview" : "chat"
    let resolvedChat
    try {
      resolvedChat = await resolvePlatformTaskLlm(chatTask)
    } catch (error) {
      console.error("[Chat API] Platform model resolution failed:", error)
      return withRateLimit(
        new Response(JSON.stringify({ error: "Chat model is not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }

    const openai = openaiClientForTarget(resolvedChat)
    const model = resolvedChat.model
    const stream = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
      ...chatCompletionSampling(model, 0.7),
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
            }
          }

          // Resolve structured citations from the full response
          let resolvedCitations: Awaited<ReturnType<typeof resolveCitations>> = []
          try {
            resolvedCitations = workspaceId || spaceId
              ? await resolveCitations({
                  content: fullResponse,
                  workspaceId,
                  spaceId,
                  supabase: adminSupabase,
                  documents: documentSources,
                })
              : []
          } catch (citationError) {
            console.error("[Chat API] Failed to resolve citations:", citationError)
          }

          let finalResponse = fullResponse
          let finalCitations = resolvedCitations

          if ((workspaceId || spaceId) && documentSources.length > 0 && resolvedCitations.length === 0) {
            console.warn("[Chat API] No structured citations found, attempting regeneration with stricter instructions")
            const regenerationResult = await regenerateResponseWithCitations({
              openai,
              model,
              conversationMessages: openaiMessages,
              previousAnswer: fullResponse,
              workspaceId,
              spaceId,
              supabase: adminSupabase,
              documents: documentSources,
            })

            if (regenerationResult) {
              finalResponse = regenerationResult.content
              finalCitations = regenerationResult.citations
            } else {
              console.warn("[Chat API] Regeneration failed to produce citations. Proceeding without highlights.")
            }
          }

          finalResponse = compileAskAnswer(finalResponse, { question: userQuery })

          const messageSourcesPayload = {
            documents: documentSources,
            citations: finalCitations,
          }

          // Save assistant message to database after streaming completes (using admin client to bypass RLS)
          try {
            if (assistantMessageId) {
              const { error: updateError } = await adminSupabase
                .from("messages")
                .update({
                  content: finalResponse,
                  sources: messageSourcesPayload,
                  thinking_duration: thinkingDuration,
                })
                .eq("id", assistantMessageId)
              
              if (updateError) {
                console.error("[Chat API] Failed to update assistant message:", updateError)
                throw updateError
              }
            } else {
              const { error: insertError } = await adminSupabase.from("messages").insert({
                conversation_id: conversationId,
                role: "assistant",
                content: finalResponse,
                sources: messageSourcesPayload,
                thinking_duration: thinkingDuration,
              })
              
              if (insertError) {
                console.error("[Chat API] Failed to insert assistant message:", insertError)
                throw insertError
              }
            }

            // Generate conversation title if it's still "New Conversation"
            if (conversation.title === "New Conversation") {
              try {
                const titlePrompt = await import("@/lib/llm/prompts").then((m) => m.getPlatformPrompt("chat_title"))
                const titleResult = await completePlatformTask("chat_title", {
                  messages: [
                    { role: "system", content: titlePrompt },
                    { role: "user", content: userQuery },
                  ],
                  temperature: 0.7,
                  maxTokens: 20,
                })
                const generatedTitle = titleResult.text.trim() || null
                if (generatedTitle) {
                  // Ensure title is not too long (max 64 characters)
                  const finalTitle = generatedTitle.length > 64 
                    ? `${generatedTitle.slice(0, 61).trimEnd()}...` 
                    : generatedTitle

                  await adminSupabase
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

                  await adminSupabase
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
            await adminSupabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId)
          } catch (dbError) {
            console.error("[Chat API] Failed to persist assistant response:", dbError)
          }

          if (finalResponse) {
            controller.enqueue(encoder.encode(finalResponse))
          }

          controller.close()
        } catch (streamError) {
          console.error("[Chat API] Stream error:", streamError)
          
          const errorMessage = streamError instanceof Error ? streamError.message : String(streamError)

          // Try to send error message to client before closing
          try {
            const errorData = `[Error: ${errorMessage}]`
            controller.enqueue(encoder.encode(errorData))
          } catch (sendError) {
            console.error("[Chat API] Failed to send error message:", sendError)
          }

          if (assistantMessageId) {
            try {
              await supabase
                .from("messages")
                .update({
                  content: `[Error: ${errorMessage}]`,
                  sources: { documents: [], citations: [] },
                })
                .eq("id", assistantMessageId)
            } catch (placeholderUpdateError) {
              console.error("[Chat API] Failed to update assistant placeholder after error:", placeholderUpdateError)
            }
          }
          
          controller.error(streamError)
        }
      },
    })

    return withRateLimit(new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    }))
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
        return withRateLimit(
          new Response(
            JSON.stringify({ 
              error: "OpenAI API quota exceeded",
              message: "Your OpenAI account has insufficient credits or quota. Please add credits to your OpenAI account to continue using the chat feature."
            }),
            { 
              status: 402,
              headers: { "Content-Type": "application/json" }
            }
          )
        )
      }
      
      // Check for rate limit (different from quota)
      if (status === 429 || errorMessage.toLowerCase().includes("rate limit")) {
        return withRateLimit(
          new Response(
            JSON.stringify({ 
              error: "OpenAI API rate limit exceeded",
              message: "Too many requests. Please wait a moment and try again."
            }),
            { 
              status: 429,
              headers: { "Content-Type": "application/json" }
            }
          )
        )
      }
      
      // Check for authentication errors
      if (
        status === 401 ||
        errorMessage.toLowerCase().includes("api key") ||
        errorMessage.toLowerCase().includes("authentication") ||
        errorMessage.toLowerCase().includes("invalid")
      ) {
        return withRateLimit(
          new Response(
            JSON.stringify({ 
              error: "OpenAI API authentication failed",
              message: "Add a provider API key in Platform admin."
            }),
            { 
              status: 401,
              headers: { "Content-Type": "application/json" }
            }
          )
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
        return withRateLimit(
          new Response(
            JSON.stringify({ 
              error: "OpenAI API quota exceeded",
              message: "Your OpenAI account has insufficient credits or quota. Please add credits to your OpenAI account to continue using the chat feature."
            }),
            { 
              status: 402,
              headers: { "Content-Type": "application/json" }
            }
          )
        )
      }
      
      // Check for rate limit
      if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        return withRateLimit(
          new Response(
            JSON.stringify({ 
              error: "OpenAI API rate limit exceeded",
              message: "Too many requests. Please wait a moment and try again."
            }),
            { 
              status: 429,
              headers: { "Content-Type": "application/json" }
            }
          )
        )
      }
      
      // Check for authentication
      if (errorMessage.includes("api key") || errorMessage.includes("authentication") || errorMessage.includes("401")) {
        return withRateLimit(
          new Response(
            JSON.stringify({ 
              error: "OpenAI API authentication failed",
              message: "Add a provider API key in Platform admin."
            }),
            { 
              status: 401,
              headers: { "Content-Type": "application/json" }
            }
          )
        )
      }
    }
    
    // Generic error response
    return withRateLimit(
      new Response(
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
    )
  }
}

async function regenerateResponseWithCitations(params: {
  openai: OpenAI
  model: string
  conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
  previousAnswer: string
  workspaceId?: string | null
  spaceId?: string | null
  supabase: ReturnType<typeof createAdminClient>
  documents: any[]
}): Promise<{ content: string; citations: Awaited<ReturnType<typeof resolveCitations>> } | null> {
  const {
    openai,
    model,
    conversationMessages,
    previousAnswer,
    workspaceId,
    spaceId,
    supabase,
    documents,
  } = params

  const reinforcementMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: "user",
    content: `Your previous response failed to include the mandatory exact quotes and structured citations.

Re-answer the user's latest request RIGHT NOW following these STRICT rules:
1. Quote the exact passages (character-for-character) from the provided context.
2. After EACH quoted passage, include the required structured citation in this format: [citation:{"quote":"exact quoted text","documentId":"doc-id","textSpan":{"start":100,"end":200},"pageNumber":1}]
3. If you truly cannot provide at least one exact quote with a structured citation, respond ONLY with: "INSUFFICIENT_CONTEXT_FOR_CITATIONS"

Restate the full answer with the required quotes and citations.`,
  }

  const regenMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...conversationMessages,
    { role: "assistant", content: previousAnswer },
    reinforcementMessage,
  ]

  try {
    const regenResponse = await openai.chat.completions.create({
      model,
      messages: regenMessages,
      ...chatCompletionSampling(model, 0.2),
    })

    const regenContent = regenResponse.choices[0]?.message?.content?.trim()
    if (!regenContent || regenContent === "INSUFFICIENT_CONTEXT_FOR_CITATIONS") {
      console.warn("[Chat API] Regeneration returned insufficient citations response.")
      return null
    }

    const regenCitations = await resolveCitations({
      content: regenContent,
      workspaceId,
      spaceId,
      supabase,
      documents,
    })

    if (regenCitations.length === 0) {
      console.warn("[Chat API] Regeneration still produced zero citations.")
      return null
    }

    return {
      content: regenContent,
      citations: regenCitations,
    }
  } catch (error) {
    console.error("[Chat API] Error during regeneration attempt:", error)
    return null
  }
}
