import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveCitations } from "@/lib/chat/resolve-citations"

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params
  if (!messageId) {
    return NextResponse.json({ error: "Message ID is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, content, sources, conversation_id")
    .eq("id", messageId)
    .maybeSingle()

  if (messageError || !message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 })
  }

  if (!message.content || typeof message.content !== "string") {
    return NextResponse.json({ error: "Message has no content to process" }, { status: 400 })
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, workspace_id, space_id")
    .eq("id", message.conversation_id)
    .maybeSingle()

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  const existingSources = message.sources ?? {}
  const documents =
    Array.isArray(existingSources?.documents) && existingSources.documents.length > 0
      ? existingSources.documents
      : Array.isArray(existingSources)
        ? existingSources
        : []

  try {
    const citations = await resolveCitations({
      content: message.content,
      workspaceId: conversation.workspace_id,
      spaceId: conversation.space_id,
      supabase: adminSupabase,
      documents,
    })

    if (!citations || citations.length === 0) {
      return NextResponse.json(
        { error: "No verifiable highlights were found for this message.", citations: [] },
        { status: 422 },
      )
    }

    const payload =
      existingSources && typeof existingSources === "object" && !Array.isArray(existingSources)
        ? {
            ...existingSources,
            documents: Array.isArray(existingSources.documents) ? existingSources.documents : documents,
            citations,
          }
        : {
            documents,
            citations,
          }

    const { error: updateError } = await adminSupabase
      .from("messages")
      .update({ sources: payload })
      .eq("id", messageId)

    if (updateError) {
      console.error("[RetryHighlights] Failed to update message sources", updateError)
      return NextResponse.json({ error: "Failed to store new highlights" }, { status: 500 })
    }

    return NextResponse.json({ citations })
  } catch (error) {
    console.error("[RetryHighlights] Failed to resolve citations", error)
    return NextResponse.json({ error: "Failed to regenerate highlights" }, { status: 500 })
  }
}

