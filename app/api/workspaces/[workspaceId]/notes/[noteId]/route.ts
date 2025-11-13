import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  try {
    const { workspaceId, noteId } = await params
    const body = await req.json()
    const content = typeof body?.content === "string" ? body.content.trim() : ""

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
      .update({ content })
      .eq("id", noteId)
      .eq("workspace_id", workspaceId)
      .select("id, workspace_id, content, created_at, updated_at, created_by, author:profiles(id, full_name, email)")
      .single()

    if (error) {
      const status = error.code === "PGRST116" ? 403 : 400
      console.error("[workspace-notes] Update error:", error)
      return NextResponse.json({ error: error.message }, { status })
    }

    if (!data) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[workspace-notes] Unexpected PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  try {
    const { workspaceId, noteId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("workspace_notes")
      .delete()
      .eq("id", noteId)
      .eq("workspace_id", workspaceId)

    if (error) {
      const status = error.code === "PGRST116" ? 403 : 400
      console.error("[workspace-notes] Delete error:", error)
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[workspace-notes] Unexpected DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


