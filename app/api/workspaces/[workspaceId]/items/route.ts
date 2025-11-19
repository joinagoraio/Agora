import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { getWorkspaceItems, createWorkspaceItem } from "@/lib/actions/workspace-item"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const rawParams = await params
    const workspaceId = assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const searchParams = req.nextUrl.searchParams
    const inheritance = searchParams.get("inheritance") as "reference" | "local" | null
    const classification = searchParams.get("classification") as "public" | "internal" | "confidential" | null

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const filters: any = {}
    if (inheritance) filters.inheritance = inheritance
    if (classification) filters.classification = classification

    const { data, error } = await getWorkspaceItems(workspaceId, filters)

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Workspace items API error:", error)
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
    const body = await req.json()

    const { data, error } = await createWorkspaceItem(workspaceId, body)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Workspace items API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
