import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const { workspaceId, itemId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("workspace_comments")
      .select("id, workspace_id, workspace_item_id, content, created_at, created_by, author:profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId)
      .eq("workspace_item_id", itemId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[workspace-comments] Fetch error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error("[workspace-comments] Unexpected GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const { workspaceId, itemId } = await params
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
      .from("workspace_comments")
      .insert({
        workspace_id: workspaceId,
        workspace_item_id: itemId,
        content,
        created_by: user.id,
      })
      .select("id, workspace_id, workspace_item_id, content, created_at, created_by, author:profiles(id, full_name, email)")
      .single()

    if (error) {
      console.error("[workspace-comments] Create error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[workspace-comments] Unexpected POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


