import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { updateWorkspaceItem } from "@/lib/actions/workspace-item"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; itemId: string }> },
) {
  try {
    const rawParams = await params
    assertUUIDParam(rawParams.workspaceId, "workspaceId")
    const itemId = assertUUIDParam(rawParams.itemId, "itemId")
    const body = await req.json()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const updates: {
      classification?: "public" | "internal" | "confidential"
      include_in_ai_context?: boolean
    } = {}

    if (body.classification !== undefined) {
      updates.classification = body.classification
    }

    if (body.includeInAiContext !== undefined || body.include_in_ai_context !== undefined) {
      updates.include_in_ai_context = body.includeInAiContext ?? body.include_in_ai_context
    }

    const { data, error } = await updateWorkspaceItem(itemId, updates)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[workspace-items] Update error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

