import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { attachParentSpace, detachParentSpace, getWorkspaceParentSpaces } from "@/lib/actions/workspace-space-link"

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

    const { data, error } = await getWorkspaceParentSpaces(workspaceId)

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Workspace spaces API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params
    const { spaceId } = await req.json()

    if (!spaceId) {
      return NextResponse.json({ error: "spaceId is required" }, { status: 400 })
    }

    const { data, error } = await attachParentSpace(workspaceId, spaceId)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[v0] Workspace spaces API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; spaceId: string }> },
) {
  try {
    const { workspaceId, spaceId } = await params

    const { error } = await detachParentSpace(workspaceId, spaceId)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Workspace spaces API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

