import { publishSpaceItem } from "@/lib/actions/space-item"
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const { workspaceId, itemId } = await params
    const body = await req.json()
    const spaceId = typeof body?.spaceId === "string" ? body.spaceId : ""
    const classification = body?.classification as "public" | "internal" | "confidential" | undefined

    if (!spaceId) {
      return NextResponse.json({ error: "Space ID is required" }, { status: 400 })
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: workspaceItem, error: itemError } = await supabase
      .from("workspace_items")
      .select("id, payload, classification")
      .eq("workspace_id", workspaceId)
      .eq("id", itemId)
      .single()

    if (itemError || !workspaceItem) {
      return NextResponse.json({ error: "Workspace item not found" }, { status: 404 })
    }

    const payload = workspaceItem.payload as Record<string, any>

    if (!payload || payload.type !== "evidence") {
      return NextResponse.json({ error: "Only evidence items can be published" }, { status: 400 })
    }

    const publishPayload = {
      item_type: "answer" as const,
      classification: classification || "public",
      payload: {
        question: payload.question,
        answer: payload.answer,
        confidence: payload.confidence,
        citations: payload.citations,
        source_workspace_item_id: workspaceItem.id,
      },
    }

    const { data: publishedItem, error: publishError } = await publishSpaceItem(spaceId, publishPayload)

    if (publishError || !publishedItem) {
      return NextResponse.json({ error: publishError }, { status: 400 })
    }

    // Attempt to link workspace item to published space item for traceability
    await supabase
      .from("workspace_items")
      .update({ source_space_item_id: publishedItem.id })
      .eq("id", workspaceItem.id)
      .eq("workspace_id", workspaceId)

    return NextResponse.json({ data: publishedItem })
  } catch (error) {
    console.error("[workspace-publish] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


