import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const noteId = assertUUIDParam(rawParams.noteId, "noteId")
    const body = await req.json()
    const hasContent = typeof body?.content === "string"
    const content = hasContent ? body.content.trim() : undefined
    const includeInAiContextRaw = body?.includeInAiContext ?? body?.include_in_ai_context
    const includeInAiContext =
      typeof includeInAiContextRaw === "boolean" ? includeInAiContextRaw : undefined

    if (!hasContent && includeInAiContext === undefined) {
      return NextResponse.json({ error: "No fields provided to update." }, { status: 400 })
    }

    if (hasContent && !content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 })
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const updatePayload: Record<string, unknown> = {}

    if (hasContent && content !== undefined) {
      updatePayload.content = content
    }

    if (includeInAiContext !== undefined) {
      updatePayload.include_in_ai_context = includeInAiContext
    }

    const { data, error } = await supabase
      .from("workspace_notes")
      .update(updatePayload)
      .eq("id", noteId)
      .eq("workspace_id", workspaceId)
      .select(
        "id, workspace_id, content, include_in_ai_context, created_at, updated_at, created_by, author:profiles(id, full_name, email)",
      )
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
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[workspace-notes] Unexpected PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const noteId = assertUUIDParam(rawParams.noteId, "noteId")
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
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[workspace-notes] Unexpected DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
