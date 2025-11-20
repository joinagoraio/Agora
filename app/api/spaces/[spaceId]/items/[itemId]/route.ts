import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { unpublishSpaceItem, updateSpaceItem } from "@/lib/actions/space-item"
import { assertUUIDParam } from "@/lib/utils/param-validation"
import { ValidationError } from "@/lib/utils/errors"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string; itemId: string }> },
) {
  try {
    const rawParams = await params
    assertUUIDParam(rawParams.spaceId, "spaceId")
    const itemId = assertUUIDParam(rawParams.itemId, "itemId")
    const body = await req.json()

    const { data, error, warnings } = await updateSpaceItem(itemId, body)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data, warnings })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[v0] Space item API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string; itemId: string }> },
) {
  try {
    const rawParams = await params
    assertUUIDParam(rawParams.spaceId, "spaceId")
    const itemId = assertUUIDParam(rawParams.itemId, "itemId")

    console.log(`[SpaceItemAPI] DELETE request for item ${itemId} in space ${rawParams.spaceId}`)

    const { error } = await unpublishSpaceItem(itemId)

    if (error) {
      console.error(`[SpaceItemAPI] Delete error for item ${itemId}:`, error)
      return NextResponse.json({ error }, { status: 400 })
    }

    console.log(`[SpaceItemAPI] Successfully deleted item ${itemId}`)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`[SpaceItemAPI] Validation error:`, error.message)
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error("[SpaceItemAPI] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
