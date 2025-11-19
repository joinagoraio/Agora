import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { attachParentSpace, detachParentSpace, getWorkspaceParentSpaces } from "@/lib/actions/workspace-space-link"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")

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
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Workspace spaces API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const { spaceId: rawSpaceId } = await req.json()
    const spaceId = assertUUIDParam(rawSpaceId, "spaceId")

    if (!spaceId) {
      return NextResponse.json({ error: "spaceId is required" }, { status: 400 })
    }

    const { data, error } = await attachParentSpace(workspaceId, spaceId)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Workspace spaces API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const url = new URL(req.url)
    const spaceId = url.searchParams.get("spaceId")

    if (!spaceId) {
      return NextResponse.json({ error: "spaceId is required" }, { status: 400 })
    }

    const sanitizedSpaceId = assertUUIDParam(spaceId, "spaceId")

    const { error } = await detachParentSpace(workspaceId, sanitizedSpaceId)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Workspace spaces API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
