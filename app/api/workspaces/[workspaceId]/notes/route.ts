import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("workspace_notes")
      .select(
        "id, workspace_id, content, include_in_ai_context, created_at, updated_at, created_by, author:profiles(id, full_name, email)",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[workspace-notes] Fetch error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error("[workspace-notes] Unexpected GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params
    const body = await req.json()
    const content = typeof body?.content === "string" ? body.content.trim() : ""
    const includeInAiContextRaw = body?.includeInAiContext ?? body?.include_in_ai_context
    const includeInAiContext = typeof includeInAiContextRaw === "boolean" ? includeInAiContextRaw : true

    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 })
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("workspace_notes")
      .insert({
        workspace_id: workspaceId,
        content,
        include_in_ai_context: includeInAiContext,
        created_by: user.id,
      })
      .select(
        "id, workspace_id, content, include_in_ai_context, created_at, updated_at, created_by, author:profiles(id, full_name, email)",
      )
      .single()

    if (error) {
      console.error("[workspace-notes] Create error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[workspace-notes] Unexpected POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
