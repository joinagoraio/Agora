import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { unpublishSpaceItem, updateSpaceItem } from "@/lib/actions/space-item"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string; itemId: string }> },
) {
  try {
    const { itemId } = await params
    const body = await req.json()

    const { data, error } = await updateSpaceItem(itemId, body)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[v0] Space item API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string; itemId: string }> },
) {
  try {
    const { itemId } = await params

    const { error } = await unpublishSpaceItem(itemId)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Space item API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

