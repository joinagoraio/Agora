import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; itemId: string; commentId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const itemId = assertUUIDParam(rawParams.itemId, "itemId")
    const commentId = assertUUIDParam(rawParams.commentId, "commentId")
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("workspace_comments")
      .delete()
      .eq("id", commentId)
      .eq("workspace_id", workspaceId)
      .eq("workspace_item_id", itemId)

    if (error) {
      const status = error.code === "PGRST116" ? 403 : 400
      console.error("[workspace-comments] Delete error:", error)
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[workspace-comments] Unexpected DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
