import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { createWorkspaceShareLink, revokeWorkspaceShareLink } from "@/lib/actions/workspace-share"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params
    const { expiresInDays } = await req.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, shareUrl, error } = await createWorkspaceShareLink(workspaceId, expiresInDays)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data, shareUrl }, { status: 201 })
  } catch (error) {
    console.error("[v0] Workspace share API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; token: string }> },
) {
  try {
    const { workspaceId, token } = await params

    const { error } = await revokeWorkspaceShareLink(workspaceId, token)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Workspace share API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

