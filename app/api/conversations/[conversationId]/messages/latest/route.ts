import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await context.params
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: message, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[Messages API] Failed to fetch latest assistant message:", error)
    return NextResponse.json({ error: "Failed to fetch latest assistant message" }, { status: 500 })
  }

  if (!message) {
    return NextResponse.json({ error: "No assistant messages found" }, { status: 404 })
  }

  return NextResponse.json({ message })
}

